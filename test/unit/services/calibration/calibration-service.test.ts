import { describe, it, expect, beforeEach } from 'vitest'
import { CalibrationService } from '@/services/calibration/calibration-service'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'
import { DEFAULT_CALIBRATION_CONFIG } from '@/services/calibration/calibration-types'

// Helper: create a PostureAngles sample with specified values
function createSample(overrides: Partial<PostureAngles> = {}): PostureAngles {
  return {
    headForwardAngle: 5.0,
    torsoAngle: 3.0,
    headTiltAngle: 1.0,
    faceFrameRatio: 0.2,
    shoulderDiff: 0.5,
    ...overrides,
  }
}

describe('CalibrationService', () => {
  let service: CalibrationService

  beforeEach(() => {
    service = new CalibrationService()
  })

  describe('constructor', () => {
    it('uses DEFAULT_CALIBRATION_CONFIG when no config provided', () => {
      const progress = service.getProgress()
      expect(progress.totalSamples).toBe(DEFAULT_CALIBRATION_CONFIG.totalSamples)
      expect(progress.totalSamples).toBe(30)
    })

    it('accepts partial config overrides', () => {
      const custom = new CalibrationService({ totalSamples: 10 })
      const progress = custom.getProgress()
      expect(progress.totalSamples).toBe(10)
    })
  })

  describe('getProgress', () => {
    it('returns initial state with zero progress', () => {
      const progress = service.getProgress()
      expect(progress.progress).toBe(0)
      expect(progress.complete).toBe(false)
      expect(progress.sampleCount).toBe(0)
      expect(progress.totalSamples).toBe(30)
    })

    it('returns a new object each call (immutability)', () => {
      const a = service.getProgress()
      const b = service.getProgress()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('addSample', () => {
    it('increments progress after adding a sample', () => {
      const progress = service.addSample(createSample())
      expect(progress.sampleCount).toBe(1)
      expect(progress.progress).toBeCloseTo(1 / 30, 5)
      expect(progress.complete).toBe(false)
    })

    it('progress increases from 0 to 1 over totalSamples adds', () => {
      const custom = new CalibrationService({ totalSamples: 5 })
      for (let i = 1; i <= 5; i++) {
        const progress = custom.addSample(createSample())
        expect(progress.progress).toBeCloseTo(i / 5, 5)
        expect(progress.sampleCount).toBe(i)
      }
    })

    it('marks complete=true after collecting totalSamples', () => {
      const custom = new CalibrationService({ totalSamples: 3 })
      custom.addSample(createSample())
      custom.addSample(createSample())
      const final = custom.addSample(createSample())
      expect(final.complete).toBe(true)
      expect(final.progress).toBe(1)
      expect(final.sampleCount).toBe(3)
    })

    it('returns a new CalibrationProgress object each call', () => {
      const a = service.addSample(createSample())
      const b = service.addSample(createSample())
      expect(a).not.toBe(b)
      expect(a.sampleCount).toBe(1)
      expect(b.sampleCount).toBe(2)
    })

    it('still accepts samples after reaching totalSamples', () => {
      const custom = new CalibrationService({ totalSamples: 2 })
      custom.addSample(createSample())
      custom.addSample(createSample())
      // Adding beyond totalSamples should not throw
      const extra = custom.addSample(createSample())
      expect(extra.sampleCount).toBe(3)
      expect(extra.complete).toBe(true)
      // progress capped at 1
      expect(extra.progress).toBe(1)
    })
  })

  describe('computeBaseline', () => {
    it('computes average of samples within ±0.1° accuracy', () => {
      const custom = new CalibrationService({ totalSamples: 3 })
      custom.addSample(createSample({ headForwardAngle: 4.0, torsoAngle: 2.0, headTiltAngle: 0.5, faceFrameRatio: 0.18, shoulderDiff: 0.3 }))
      custom.addSample(createSample({ headForwardAngle: 6.0, torsoAngle: 4.0, headTiltAngle: 1.5, faceFrameRatio: 0.22, shoulderDiff: 0.7 }))
      custom.addSample(createSample({ headForwardAngle: 5.0, torsoAngle: 3.0, headTiltAngle: 1.0, faceFrameRatio: 0.20, shoulderDiff: 0.5 }))

      const result = custom.computeBaseline()
      expect(result.baseline.headForwardAngle).toBeCloseTo(5.0, 1)
      expect(result.baseline.torsoAngle).toBeCloseTo(3.0, 1)
      expect(result.baseline.headTiltAngle).toBeCloseTo(1.0, 1)
      expect(result.baseline.faceFrameRatio).toBeCloseTo(0.2, 1)
      expect(result.baseline.shoulderDiff).toBeCloseTo(0.5, 1)
    })

    it('includes a valid timestamp in baseline', () => {
      const custom = new CalibrationService({ totalSamples: 1 })
      custom.addSample(createSample())
      const before = Date.now()
      const result = custom.computeBaseline()
      const after = Date.now()
      expect(result.baseline.timestamp).toBeGreaterThanOrEqual(before)
      expect(result.baseline.timestamp).toBeLessThanOrEqual(after)
    })

    it('computes standard deviation of samples', () => {
      const custom = new CalibrationService({ totalSamples: 3 })
      // All same values → stdDev should be 0
      custom.addSample(createSample({ headForwardAngle: 5.0 }))
      custom.addSample(createSample({ headForwardAngle: 5.0 }))
      custom.addSample(createSample({ headForwardAngle: 5.0 }))

      const result = custom.computeBaseline()
      expect(result.sampleStdDev.headForwardAngle).toBeCloseTo(0, 5)
    })

    it('computes non-zero stdDev for varied samples', () => {
      const custom = new CalibrationService({ totalSamples: 3 })
      custom.addSample(createSample({ headForwardAngle: 3.0 }))
      custom.addSample(createSample({ headForwardAngle: 5.0 }))
      custom.addSample(createSample({ headForwardAngle: 7.0 }))

      const result = custom.computeBaseline()
      // stdDev of [3,5,7] = sqrt(((3-5)^2 + (5-5)^2 + (7-5)^2)/3) = sqrt(8/3) ≈ 1.633
      expect(result.sampleStdDev.headForwardAngle).toBeGreaterThan(1.5)
      expect(result.sampleStdDev.headForwardAngle).toBeLessThan(1.7)
    })

    it('throws when no samples have been collected', () => {
      expect(() => service.computeBaseline()).toThrow()
    })

    it('can compute baseline before reaching totalSamples', () => {
      const custom = new CalibrationService({ totalSamples: 30 })
      custom.addSample(createSample({ headForwardAngle: 4.0 }))
      custom.addSample(createSample({ headForwardAngle: 6.0 }))

      // Should not throw with partial samples
      const result = custom.computeBaseline()
      expect(result.baseline.headForwardAngle).toBeCloseTo(5.0, 1)
    })

    it('returns a new result object each call (immutability)', () => {
      const custom = new CalibrationService({ totalSamples: 1 })
      custom.addSample(createSample())
      const a = custom.computeBaseline()
      const b = custom.computeBaseline()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('reset', () => {
    it('resets progress to zero', () => {
      service.addSample(createSample())
      service.addSample(createSample())
      service.reset()

      const progress = service.getProgress()
      expect(progress.progress).toBe(0)
      expect(progress.sampleCount).toBe(0)
      expect(progress.complete).toBe(false)
    })

    it('clears samples so computeBaseline throws', () => {
      service.addSample(createSample())
      service.reset()
      expect(() => service.computeBaseline()).toThrow()
    })

    it('preserves config after reset', () => {
      const custom = new CalibrationService({ totalSamples: 10 })
      custom.addSample(createSample())
      custom.reset()
      expect(custom.getProgress().totalSamples).toBe(10)
    })
  })

  describe('high-jitter input stability', () => {
    it('produces a stable baseline from high-variance samples', () => {
      const custom = new CalibrationService({ totalSamples: 20 })
      // Generate 20 samples with high jitter around headForwardAngle=5
      const jitterValues: number[] = []
      for (let i = 0; i < 20; i++) {
        // Spread: 5 ± 3 (range 2-8)
        const value = 5 + (i % 2 === 0 ? 3 : -3)
        jitterValues.push(value)
        custom.addSample(createSample({ headForwardAngle: value }))
      }

      const result = custom.computeBaseline()
      // Mean should be close to 5
      expect(result.baseline.headForwardAngle).toBeCloseTo(5.0, 1)

      // Standard deviation of alternating [8, 2, 8, 2, ...] = 3.0
      // The result stdDev should be < 50% of input stdDev is a test about
      // the service's output being stable (the average is stable)
      // stdDev of the samples = 3.0, the baseline is a single value (the mean)
      // so the "stability" is about the stdDev being reported correctly
      expect(result.sampleStdDev.headForwardAngle).toBeLessThan(3.1)
      expect(result.sampleStdDev.headForwardAngle).toBeGreaterThan(2.9)
    })
  })

  describe('does not mutate input', () => {
    it('addSample does not mutate the input PostureAngles', () => {
      const sample = createSample()
      const copy = { ...sample }
      service.addSample(sample)
      expect(sample).toEqual(copy)
    })
  })
})
