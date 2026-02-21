import { renderHook, act } from '@testing-library/react'
import { useCalibrationWizard } from '@/hooks/useCalibrationWizard'
import type { PoseDetector } from '@/services/pose-detection/pose-detector'

// Mock PoseDetector
const mockDetect = vi.fn()
const mockInitialize = vi.fn().mockResolvedValue(undefined)
const mockDestroy = vi.fn()
const mockIsReady = vi.fn().mockReturnValue(true)

vi.mock('@/services/pose-detection/pose-detector', () => ({
  createPoseDetector: () => ({
    initialize: mockInitialize,
    detect: mockDetect,
    destroy: mockDestroy,
    isReady: mockIsReady,
  }),
}))

// Mock CalibrationService
const mockAddSample = vi.fn()
const mockComputeBaseline = vi.fn()

vi.mock('@/services/calibration/calibration-service', () => ({
  CalibrationService: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.addSample = mockAddSample
    this.computeBaseline = mockComputeBaseline
    this.reset = vi.fn()
    this.startAngleCollection = vi.fn()
    this.completeCurrentAngle = vi.fn()
    this.computeMultiAngleBaseline = vi.fn().mockReturnValue({ baseline: {} })
  }),
}))

// Mock angle-calculator
vi.mock('@/services/posture-analysis/angle-calculator', () => ({
  extractPostureAngles: vi.fn().mockReturnValue({
    headForwardAngle: 10,
    torsoAngle: 5,
    headTiltAngle: 0,
    faceFrameRatio: 0.15,
    shoulderDiff: 0,
  }),
}))

// Mock screen-angle-estimator
vi.mock('@/services/calibration/screen-angle-estimator', () => ({
  extractScreenAngleSignals: vi.fn().mockReturnValue({
    faceY: 0.5,
    noseChinRatio: 0.3,
    eyeMouthRatio: 0.2,
  }),
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mockDetect.mockReturnValue(null)
  mockInitialize.mockResolvedValue(undefined)
  mockIsReady.mockReturnValue(true)

  // Mock electronAPI as undefined (non-Electron environment)
  Object.defineProperty(window, 'electronAPI', {
    value: undefined,
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function createMockVideoRef() {
  const video = document.createElement('video')
  Object.defineProperty(video, 'readyState', { value: 4, writable: true })
  Object.defineProperty(video, 'videoWidth', { value: 640, writable: true })
  Object.defineProperty(video, 'videoHeight', { value: 480, writable: true })
  return { current: video }
}

describe('useCalibrationWizard', () => {
  describe('initial state', () => {
    it('starts at welcome step', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      expect(result.current.step).toBe('welcome')
      expect(result.current.stepNumber).toBe(1)
      expect(result.current.progress).toBe(0)
      expect(result.current.error).toBeNull()
      expect(result.current.canContinue).toBe(false)
    })

    it('has default position result as no_face', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      expect(result.current.positionResult.status).toBe('no_face')
    })
  })

  describe('step transitions', () => {
    it('transitions from welcome to position-check via goToStep2', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      expect(result.current.step).toBe('position-check')
      expect(result.current.stepNumber).toBe(2)
    })

    it('transitions from position-check back to welcome via goBackToStep1', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })
      expect(result.current.step).toBe('position-check')

      await act(async () => {
        result.current.goBackToStep1()
      })
      expect(result.current.step).toBe('welcome')
      expect(result.current.stepNumber).toBe(1)
    })

    it('transitions from position-check to angle-instruction via goToStep3', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      await act(async () => {
        result.current.goToStep3()
      })

      expect(result.current.step).toBe('angle-instruction')
      expect(result.current.stepNumber).toBe(3)
    })

    it('resets to welcome via recalibrate', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })
      expect(result.current.step).toBe('position-check')

      await act(async () => {
        result.current.recalibrate()
      })
      expect(result.current.step).toBe('welcome')
      expect(result.current.stepNumber).toBe(1)
      expect(result.current.progress).toBe(0)
    })
  })

  describe('step 2 - position check', () => {
    it('resets position state when entering position-check', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      expect(result.current.positionResult.status).toBe('no_face')
      expect(result.current.canContinue).toBe(false)
    })

    it('starts position checking timer when entering position-check', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      // Position check should attempt to detect
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600) // 2 intervals
      })

      // mockDetect is called by the interval
      expect(mockDetect).toHaveBeenCalled()
    })

    it('sets canContinue to true after face is good for 1.5s', async () => {
      // Return good face detection result with proper ear positions
      // faceRatio = |0.425 - 0.575| = 0.15 (between 0.08 and 0.35)
      // nose at center (0.5, 0.5)
      const landmarks = Array.from({ length: 33 }, () => ({
        x: 0.5, y: 0.5, z: 0, visibility: 0.9,
      }))
      // LEFT_EAR = index 7, RIGHT_EAR = index 8, NOSE = index 0
      landmarks[7] = { x: 0.425, y: 0.45, z: 0, visibility: 0.9 }
      landmarks[8] = { x: 0.575, y: 0.45, z: 0, visibility: 0.9 }
      landmarks[0] = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 }

      mockDetect.mockReturnValue({
        landmarks,
        worldLandmarks: landmarks,
        timestamp: performance.now(),
        frameWidth: 640,
        frameHeight: 480,
      })

      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      // Advance past initialization and several intervals + hold time
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      expect(result.current.canContinue).toBe(true)
    })
  })

  describe('mock collection flow (multi-angle)', () => {
    it('goToStep3 goes to angle-instruction, startAngleCollect starts collection', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      // Go to step 2 then step 3
      await act(async () => {
        result.current.goToStep2()
      })
      await act(async () => {
        result.current.goToStep3()
      })

      expect(result.current.step).toBe('angle-instruction')
      expect(result.current.angleIndex).toBe(0)
      expect(result.current.currentAngleLabel).toBe(90)

      // Start collecting for first angle
      await act(async () => {
        result.current.startAngleCollect()
      })

      expect(result.current.step).toBe('collect')
    })

    it('auto-advances to confirm after all 3 angles complete', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      // Go to step 2 then step 3
      await act(async () => {
        result.current.goToStep2()
      })
      await act(async () => {
        result.current.goToStep3()
      })

      // Angle 1 (90 degrees)
      await act(async () => {
        result.current.startAngleCollect()
      })
      expect(result.current.step).toBe('collect')

      // Complete angle 1 mock collection (2s)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      // Should go to angle-instruction for next angle
      expect(result.current.step).toBe('angle-instruction')
      expect(result.current.angleIndex).toBe(1)

      // Angle 2 (110 degrees)
      await act(async () => {
        result.current.startAngleCollect()
      })
      expect(result.current.step).toBe('collect')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      expect(result.current.step).toBe('angle-instruction')
      expect(result.current.angleIndex).toBe(2)

      // Angle 3 (130 degrees)
      await act(async () => {
        result.current.startAngleCollect()
      })
      expect(result.current.step).toBe('collect')

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500)
      })

      // After all 3 angles, should go to confirm
      expect(result.current.step).toBe('confirm')
      expect(result.current.stepNumber).toBe(4)
    })

    it('progress increases during mock collection', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })
      await act(async () => {
        result.current.goToStep3()
      })
      await act(async () => {
        result.current.startAngleCollect()
      })

      // Advance 1 second (half of 2s mock duration)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      expect(result.current.progress).toBeGreaterThan(0)
      expect(result.current.progress).toBeLessThan(1)
    })
  })

  describe('step 4 - confirm', () => {
    it('confirm cleans up resources', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })
      await act(async () => {
        result.current.goToStep3()
      })
      await act(async () => {
        result.current.startAngleCollect()
      })

      // Complete all 3 angles
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2500)
        })
        if (i < 2) {
          await act(async () => {
            result.current.startAngleCollect()
          })
        }
      }

      expect(result.current.step).toBe('confirm')

      await act(async () => {
        result.current.confirm()
      })

      // Detector should be destroyed
      expect(mockDestroy).toHaveBeenCalled()
    })
  })

  describe('cleanup on unmount', () => {
    it('destroys detector on unmount', async () => {
      const videoRef = createMockVideoRef()
      const { result, unmount } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      unmount()

      expect(mockDestroy).toHaveBeenCalled()
    })
  })

  describe('detector reuse', () => {
    it('reuses existing detector when going step2 -> step1 -> step2', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      // First go to step 2 (initializes detector)
      await act(async () => {
        result.current.goToStep2()
      })
      expect(mockInitialize).toHaveBeenCalledTimes(1)

      // Go back to step 1
      await act(async () => {
        result.current.goBackToStep1()
      })

      // Go to step 2 again — should reuse the detector
      await act(async () => {
        result.current.goToStep2()
      })

      // isReady returns true, so init should not be called again
      expect(mockInitialize).toHaveBeenCalledTimes(1)
    })
  })

  describe('position check with no video', () => {
    it('skips detection when video readyState < 2', async () => {
      const video = document.createElement('video')
      Object.defineProperty(video, 'readyState', { value: 0, writable: true })
      const videoRef = { current: video }

      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      // detect should not have been called because readyState < 2
      expect(mockDetect).not.toHaveBeenCalled()
      expect(result.current.positionResult.status).toBe('no_face')
    })

    it('skips detection when videoRef is null', async () => {
      const videoRef = { current: null }

      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect(mockDetect).not.toHaveBeenCalled()
    })
  })

  describe('position check resets canContinue on bad position', () => {
    it('resets canContinue when face goes from good to bad', async () => {
      // Start with good detection
      const goodLandmarks = Array.from({ length: 33 }, () => ({
        x: 0.5, y: 0.5, z: 0, visibility: 0.9,
      }))
      goodLandmarks[7] = { x: 0.425, y: 0.45, z: 0, visibility: 0.9 }
      goodLandmarks[8] = { x: 0.575, y: 0.45, z: 0, visibility: 0.9 }

      mockDetect.mockReturnValue({
        landmarks: goodLandmarks,
        worldLandmarks: goodLandmarks,
        timestamp: performance.now(),
        frameWidth: 640,
        frameHeight: 480,
      })

      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      // Hold good position
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })
      expect(result.current.canContinue).toBe(true)

      // Now face disappears
      mockDetect.mockReturnValue(null)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect(result.current.canContinue).toBe(false)
      expect(result.current.positionResult.status).toBe('no_face')
    })
  })

  describe('generation counter prevents stale updates', () => {
    it('ignores stale position check results after going back', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })
      expect(result.current.step).toBe('position-check')

      // Go back to step 1 (increments generation)
      await act(async () => {
        result.current.goBackToStep1()
      })
      expect(result.current.step).toBe('welcome')

      // Stale timer ticks should not affect state
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      // Step should still be welcome
      expect(result.current.step).toBe('welcome')
    })
  })

  describe('error handling', () => {
    it('sets error when detector initialization fails', async () => {
      mockInitialize.mockRejectedValue(new Error('WASM 加载失败'))

      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      // Wait for async init to settle
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.error).toContain('WASM 加载失败')
    })
  })
})
