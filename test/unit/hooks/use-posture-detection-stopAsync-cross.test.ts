/**
 * Cross-testing: stopAsync camera release fix
 * Written by notification-dev to independently verify wizard-dev's implementation.
 * Covers: double-call safety, state transitions, generation counter interaction,
 *         paused-state behavior, and unmount during stopAsync.
 */
import { renderHook, act } from '@testing-library/react'
import type { PoseDetector } from '@/services/pose-detection/pose-detector'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import type { PostureStatus } from '@/types/ipc'
import {
  DEFAULT_SETTINGS,
  type CalibrationData,
  type DetectionSettings,
} from '@/types/settings'

// --- Mock modules ---

const mockCreatePoseDetector = vi.fn()
vi.mock('@/services/pose-detection/pose-detector', () => ({
  createPoseDetector: (...args: unknown[]) => mockCreatePoseDetector(...args),
}))

const mockAnalyzerInstance = {
  analyze: vi.fn(),
  analyzeDetailed: vi.fn(),
  updateCalibration: vi.fn(),
  updateSensitivity: vi.fn(),
  updateRuleToggles: vi.fn(),
  reset: vi.fn(),
}

vi.mock('@/services/posture-analysis/posture-analyzer', () => ({
  PostureAnalyzer: vi.fn().mockImplementation(function (this: unknown) {
    Object.assign(this as Record<string, unknown>, mockAnalyzerInstance)
  }),
}))

import { usePostureDetection } from '@/hooks/usePostureDetection'

// --- Helpers ---

function createLandmark(): Landmark {
  return { x: 0.5, y: 0.5, z: 0, visibility: 0.9 }
}

function createDetectionFrame(): DetectionFrame {
  return {
    landmarks: Array.from({ length: 33 }, createLandmark),
    worldLandmarks: Array.from({ length: 33 }, createLandmark),
    timestamp: Date.now(),
    frameWidth: 640,
    frameHeight: 480,
  }
}

function createMockDetector(overrides?: Partial<PoseDetector>): PoseDetector {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn().mockReturnValue(createDetectionFrame()),
    destroy: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),
    ...overrides,
  }
}

function createMockStream(): MediaStream {
  const track = { stop: vi.fn(), kind: 'video', enabled: true }
  return {
    getTracks: vi.fn().mockReturnValue([track]),
    getVideoTracks: vi.fn().mockReturnValue([track]),
    getAudioTracks: vi.fn().mockReturnValue([]),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    active: true,
    id: 'mock-stream',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream
}

function createMockVideo(): HTMLVideoElement {
  return {
    srcObject: null,
    videoWidth: 640,
    videoHeight: 480,
    readyState: 4,
    playsInline: false,
    muted: false,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    remove: vi.fn(),
    style: {} as CSSStyleDeclaration,
  } as unknown as HTMLVideoElement
}

const CALIBRATION: CalibrationData = {
  headForwardAngle: 10,
  torsoAngle: 5,
  headTiltAngle: 0,
  faceFrameRatio: 0.15,
  shoulderDiff: 0,
  timestamp: Date.now(),
}

const DETECTION: DetectionSettings = { ...DEFAULT_SETTINGS.detection }

// --- Setup ---

let mockDetector: PoseDetector
let mockStream: MediaStream
let mockVideo: HTMLVideoElement

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()

  mockDetector = createMockDetector()
  mockCreatePoseDetector.mockReturnValue(mockDetector)

  const status: PostureStatus = {
    isGood: true,
    violations: [],
    confidence: 0.9,
    timestamp: Date.now(),
  }
  mockAnalyzerInstance.analyzeDetailed.mockReturnValue({
    status,
    angles: {
      headForwardAngle: 10,
      torsoAngle: 5,
      headTiltAngle: 0,
      faceFrameRatio: 0.15,
      shoulderDiff: 0,
    },
    deviations: {
      headForward: 0,
      torsoSlouch: 0,
      headTilt: 0,
      faceFrameRatio: 0.15,
      shoulderDiff: 0,
    },
  })

  mockStream = createMockStream()
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    writable: true,
    configurable: true,
  })

  mockVideo = createMockVideo()
  const origCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'video') return mockVideo as unknown as HTMLElement
    return origCreate(tag)
  })
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)

  Object.defineProperty(window, 'electronAPI', {
    value: {
      getSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
      setSettings: vi.fn().mockResolvedValue(undefined),
      getStatus: vi.fn().mockResolvedValue('paused'),
      requestCameraPermission: vi.fn().mockResolvedValue(true),
      startCalibration: vi.fn().mockResolvedValue(undefined),
      completeCalibration: vi.fn().mockResolvedValue(undefined),
      reportPostureStatus: vi.fn().mockResolvedValue(undefined),
      onStatusChange: vi.fn().mockReturnValue(() => {}),
      onPause: vi.fn().mockReturnValue(() => {}),
      onResume: vi.fn().mockReturnValue(() => {}),
    },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
  delete (window as Record<string, unknown>).electronAPI
  vi.restoreAllMocks()
})

/** Helper: start detection and reach 'detecting' state */
async function startDetecting(
  result: { current: ReturnType<typeof usePostureDetection> },
): Promise<void> {
  await act(async () => {
    await result.current.start(CALIBRATION, DETECTION)
  })
  expect(result.current.state).toBe('detecting')
}

// --- Tests ---

describe('stopAsync - cross-test', () => {
  describe('double call safety', () => {
    it('second stopAsync resolves immediately (no extra 300ms delay)', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      // First call: should wait 300ms because stream was active
      let firstResolved = false
      let secondResolved = false

      await act(async () => {
        const p1 = result.current.stopAsync().then(() => {
          firstResolved = true
        })
        // After stop() inside stopAsync, stream is already null
        // so second call should see hadStream=false and resolve without delay
        const p2 = result.current.stopAsync().then(() => {
          secondResolved = true
        })

        // Before advancing timers, only p2 should resolve (no stream)
        await vi.advanceTimersByTimeAsync(0)
        expect(secondResolved).toBe(true)
        expect(firstResolved).toBe(false)

        // Advance past the 300ms delay for p1
        await vi.advanceTimersByTimeAsync(300)
        await p1
        await p2
      })

      expect(firstResolved).toBe(true)
      expect(secondResolved).toBe(true)
      expect(result.current.state).toBe('idle')
    })
  })

  describe('state transitions', () => {
    it('stopAsync from detecting state transitions to idle', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      await act(async () => {
        const p = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p
      })

      expect(result.current.state).toBe('idle')
      expect(result.current.lastStatus).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('stopAsync from paused state transitions to idle with delay (stream was active during pause)', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      // Pause releases camera, so streamRef becomes null
      await act(async () => {
        result.current.pause()
      })
      expect(result.current.state).toBe('paused')

      // Since pause already released the stream, stopAsync should not delay
      await act(async () => {
        const p = result.current.stopAsync()
        // No need to advance timers — hadStream is false after pause
        await p
      })

      expect(result.current.state).toBe('idle')
    })

    it('stopAsync from idle state is a no-op (resolves immediately)', async () => {
      const { result } = renderHook(() => usePostureDetection())
      expect(result.current.state).toBe('idle')

      await act(async () => {
        await result.current.stopAsync()
      })

      expect(result.current.state).toBe('idle')
    })

    it('stopAsync from initializing state cancels in-flight start', async () => {
      // Make initialize hang
      let resolveInit: (() => void) | null = null
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveInit = resolve
          }),
      )

      const { result } = renderHook(() => usePostureDetection())

      let startPromise: Promise<void> | null = null
      act(() => {
        startPromise = result.current.start(CALIBRATION, DETECTION)
      })

      // Flush microtasks past camera/video to reach initialize()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(result.current.state).toBe('initializing')

      // stopAsync should cancel the in-flight start via generation counter
      await act(async () => {
        const p = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p
      })

      expect(result.current.state).toBe('idle')

      // Resolve the hanging init — start should detect generation mismatch
      await act(async () => {
        resolveInit?.()
        await startPromise
      })

      // Should remain idle (start was cancelled)
      expect(result.current.state).toBe('idle')
      expect(mockDetector.destroy).toHaveBeenCalled()
    })
  })

  describe('generation counter interaction', () => {
    it('stopAsync increments generation counter (prevents stale start from continuing)', async () => {
      // We verify this indirectly: start() after stopAsync() should work normally
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      // stopAsync
      await act(async () => {
        const p = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p
      })
      expect(result.current.state).toBe('idle')

      // Start again should succeed (no stale generation interference)
      await act(async () => {
        await result.current.start(CALIBRATION, DETECTION)
      })
      expect(result.current.state).toBe('detecting')
    })
  })

  describe('resource cleanup', () => {
    it('stopAsync releases camera stream tracks', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      await act(async () => {
        const p = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p
      })

      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })

    it('stopAsync destroys PoseDetector', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      await act(async () => {
        const p = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p
      })

      expect(mockDetector.destroy).toHaveBeenCalled()
    })

    it('stopAsync removes video element', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      await act(async () => {
        const p = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p
      })

      expect(mockVideo.remove).toHaveBeenCalled()
    })

    it('stopAsync clears detection loop (no more detect calls)', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      await act(async () => {
        const p = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p
      })

      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      expect(mockDetector.detect).not.toHaveBeenCalled()
    })
  })

  describe('interaction with start after stopAsync', () => {
    it('start() called after stopAsync completes should succeed', async () => {
      const { result } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      // stopAsync — wait for full completion
      await act(async () => {
        const stopP = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await stopP
      })

      expect(result.current.state).toBe('idle')

      // Create a fresh stream and detector for the second start
      const secondStream = createMockStream()
      const secondDetector = createMockDetector()
      ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(
        secondStream,
      )
      mockCreatePoseDetector.mockReturnValue(secondDetector)

      // Start should succeed
      await act(async () => {
        await result.current.start(CALIBRATION, DETECTION)
      })

      expect(result.current.state).toBe('detecting')
    })
  })

  describe('unmount during stopAsync', () => {
    it('unmount during stopAsync delay does not cause errors', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())
      await startDetecting(result)

      // Start stopAsync but don't await
      let stopPromise: Promise<void> | null = null
      act(() => {
        stopPromise = result.current.stopAsync()
      })

      // Unmount while the 300ms timer is pending
      unmount()

      // Advance timers — should not throw even though component is unmounted
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
        await stopPromise
      })

      // No error thrown — test passes if we reach here
    })
  })
})
