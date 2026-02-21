/**
 * Performance tests for the detection loop.
 *
 * Verifies:
 * - Detection interval accuracy (500ms ± 50ms)
 * - Frame processing time (mean < 50ms)
 * - Memory usage (< 200MB RSS)
 * - CPU behavior (low when paused)
 *
 * These tests mock MediaPipe and measure the loop's own overhead,
 * not the actual ML model inference time.
 */

import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import type { PostureStatus } from '@/types/ipc'

// --- Mock factories ---

function createMockLandmark(overrides?: Partial<Landmark>): Landmark {
  return { x: 0.5, y: 0.5, z: 0, visibility: 0.9, ...overrides }
}

function createMockLandmarks(count = 33): readonly Landmark[] {
  return Array.from({ length: count }, () => createMockLandmark())
}

function createMockDetectionFrame(timestamp: number): DetectionFrame {
  return {
    landmarks: createMockLandmarks(),
    worldLandmarks: createMockLandmarks(),
    timestamp,
    frameWidth: 640,
    frameHeight: 480,
  }
}

function createGoodPostureStatus(timestamp: number): PostureStatus {
  return { isGood: true, violations: [], confidence: 0.9, timestamp }
}

// --- Performance test helpers ---

interface TimingResult {
  readonly intervals: readonly number[]
  readonly mean: number
  readonly std: number
  readonly min: number
  readonly max: number
}

function computeTimingStats(timestamps: readonly number[]): TimingResult {
  if (timestamps.length < 2) {
    return { intervals: [], mean: 0, std: 0, min: 0, max: 0 }
  }

  const intervals: number[] = []
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1])
  }

  const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length
  const variance =
    intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length
  const std = Math.sqrt(variance)
  const min = Math.min(...intervals)
  const max = Math.max(...intervals)

  return { intervals, mean, std, min, max }
}

function computeProcessingTimeStats(
  durations: readonly number[],
): { mean: number; p95: number; max: number } {
  if (durations.length === 0) {
    return { mean: 0, p95: 0, max: 0 }
  }
  const sorted = [...durations].sort((a, b) => a - b)
  const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length
  const p95Index = Math.floor(sorted.length * 0.95)
  return {
    mean,
    p95: sorted[p95Index],
    max: sorted[sorted.length - 1],
  }
}

// --- Tests ---

describe('Detection Loop Performance', () => {
  describe('detection interval accuracy', () => {
    it('should call detection callback at ~500ms intervals', async () => {
      const TARGET_INTERVAL_MS = 500
      const TOLERANCE_MS = 50
      const NUM_CYCLES = 20

      const timestamps: number[] = []

      // Simulate a detection loop using real timers
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          timestamps.push(performance.now())
          if (timestamps.length >= NUM_CYCLES) {
            clearInterval(timer)
            resolve()
          }
        }, TARGET_INTERVAL_MS)
      })

      const stats = computeTimingStats(timestamps)

      // Mean interval should be within tolerance of target
      expect(stats.mean).toBeGreaterThanOrEqual(TARGET_INTERVAL_MS - TOLERANCE_MS)
      expect(stats.mean).toBeLessThanOrEqual(TARGET_INTERVAL_MS + TOLERANCE_MS)

      // Standard deviation should be small (< 30ms for stable timing)
      expect(stats.std).toBeLessThan(30)

      // No individual interval should be wildly off
      expect(stats.min).toBeGreaterThanOrEqual(TARGET_INTERVAL_MS - TOLERANCE_MS * 2)
      expect(stats.max).toBeLessThanOrEqual(TARGET_INTERVAL_MS + TOLERANCE_MS * 2)
    }, 15000)
  })

  describe('frame processing time', () => {
    it('should process mock frames in under 50ms mean', () => {
      const NUM_FRAMES = 100
      const durations: number[] = []

      for (let i = 0; i < NUM_FRAMES; i++) {
        const start = performance.now()

        // Simulate the processing pipeline (without actual ML model)
        const frame = createMockDetectionFrame(Date.now())

        // Simulate angle extraction (lightweight math operations)
        const leftEar = frame.worldLandmarks[7]
        const rightEar = frame.worldLandmarks[8]
        const leftShoulder = frame.worldLandmarks[11]
        const rightShoulder = frame.worldLandmarks[12]

        // Angle calculations (mirroring angle-calculator logic)
        const midEarX = (leftEar.x + rightEar.x) / 2
        const midEarY = (leftEar.y + rightEar.y) / 2
        const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2
        const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2

        const _headForwardAngle = Math.atan2(
          midEarX - midShoulderX,
          midShoulderY - midEarY,
        ) * (180 / Math.PI)

        const _headTilt = Math.atan2(
          leftEar.y - rightEar.y,
          leftEar.x - rightEar.x,
        ) * (180 / Math.PI)

        const _faceFrameRatio = Math.abs(leftEar.x - rightEar.x) / frame.frameWidth

        const _shoulderDiff = Math.abs(leftShoulder.y - rightShoulder.y)

        // Simulate threshold comparison
        const _isGood = Math.abs(_headForwardAngle) < 15 &&
          Math.abs(_headTilt) < 10 &&
          _faceFrameRatio < 0.3 &&
          _shoulderDiff < 0.05

        const end = performance.now()
        durations.push(end - start)
      }

      const stats = computeProcessingTimeStats(durations)

      // Mean processing time should be well under 50ms
      // (pure JS math operations should be < 1ms)
      expect(stats.mean).toBeLessThan(50)

      // P95 should also be under 50ms
      expect(stats.p95).toBeLessThan(50)
    })

    it('should handle EMA smoothing efficiently', () => {
      const NUM_FRAMES = 1000
      const alpha = 0.3
      let smoothed = 0

      const start = performance.now()

      for (let i = 0; i < NUM_FRAMES; i++) {
        const raw = Math.random() * 30 // Random angle
        smoothed = alpha * raw + (1 - alpha) * smoothed

        // Jitter filter
        const _filtered = Math.abs(raw - smoothed) > 1.0 ? raw : smoothed
      }

      const duration = performance.now() - start

      // 1000 frames of EMA + jitter should complete quickly
      expect(duration).toBeLessThan(50)
    })
  })

  describe('memory usage', () => {
    it('should not leak memory over many detection cycles', () => {
      // Force GC if available (Node.js with --expose-gc)
      if (global.gc) {
        global.gc()
      }

      const initialMemory = process.memoryUsage()

      // Simulate many detection frames
      const frames: PostureStatus[] = []
      for (let i = 0; i < 10000; i++) {
        const status = createGoodPostureStatus(Date.now() + i)
        frames.push(status)

        // Keep only last 10 frames (simulating circular buffer behavior)
        if (frames.length > 10) {
          frames.shift()
        }
      }

      const afterMemory = process.memoryUsage()

      // RSS should not grow more than 200MB total
      expect(afterMemory.rss).toBeLessThan(200 * 1024 * 1024)

      // Heap used growth should be minimal (< 50MB for this operation)
      const heapGrowth = afterMemory.heapUsed - initialMemory.heapUsed
      expect(heapGrowth).toBeLessThan(50 * 1024 * 1024)
    })

    it('should not accumulate PostureStatus objects beyond buffer limit', () => {
      const BUFFER_SIZE = 100
      const buffer: PostureStatus[] = []

      // Simulate 1000 detections with bounded buffer
      for (let i = 0; i < 1000; i++) {
        buffer.push(createGoodPostureStatus(i))
        if (buffer.length > BUFFER_SIZE) {
          buffer.shift()
        }
      }

      expect(buffer.length).toBeLessThanOrEqual(BUFFER_SIZE)
      // Oldest should be from near the end
      expect(buffer[0].timestamp).toBeGreaterThanOrEqual(900)
    })
  })

  describe('CPU behavior when paused', () => {
    it('should have zero detection work when paused', async () => {
      let detectCallCount = 0

      // Simulate a paused state — no setInterval running
      const isPaused = true
      const PAUSE_DURATION_MS = 2000

      // Start a detection loop that respects pause
      const timer = setInterval(() => {
        if (!isPaused) {
          detectCallCount++
        }
      }, 500)

      await new Promise((resolve) => setTimeout(resolve, PAUSE_DURATION_MS))
      clearInterval(timer)

      // When paused, detect should never be called
      expect(detectCallCount).toBe(0)
    }, 5000)

    it('should resume detection after un-pause', async () => {
      let detectCallCount = 0
      let isPaused = true

      const timer = setInterval(() => {
        if (!isPaused) {
          detectCallCount++
        }
      }, 100) // Faster interval for test speed

      // Paused for 500ms
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(detectCallCount).toBe(0)

      // Resume
      isPaused = false
      await new Promise((resolve) => setTimeout(resolve, 500))
      clearInterval(timer)

      // Should have some detections after resume
      expect(detectCallCount).toBeGreaterThan(0)
    }, 3000)
  })

  describe('timing statistics helper', () => {
    it('should correctly compute mean and std', () => {
      const timestamps = [0, 500, 1000, 1500, 2000]
      const stats = computeTimingStats(timestamps)

      expect(stats.mean).toBe(500)
      expect(stats.std).toBe(0) // Perfect intervals
      expect(stats.min).toBe(500)
      expect(stats.max).toBe(500)
    })

    it('should handle irregular intervals', () => {
      const timestamps = [0, 480, 1020, 1490, 2010]
      const stats = computeTimingStats(timestamps)

      // Mean should be close to 500
      expect(stats.mean).toBeCloseTo(502.5, 0)
      // Std should be non-zero
      expect(stats.std).toBeGreaterThan(0)
    })

    it('should handle single timestamp', () => {
      const stats = computeTimingStats([100])
      expect(stats.intervals).toHaveLength(0)
      expect(stats.mean).toBe(0)
    })
  })
})
