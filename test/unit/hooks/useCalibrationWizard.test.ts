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
  CalibrationService: vi.fn().mockImplementation(() => ({
    addSample: mockAddSample,
    computeBaseline: mockComputeBaseline,
    reset: vi.fn(),
  })),
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
    it('starts at step 1', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      expect(result.current.step).toBe(1)
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
    it('transitions from step 1 to step 2 via goToStep2', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      expect(result.current.step).toBe(2)
    })

    it('transitions from step 2 back to step 1 via goBackToStep1', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })
      expect(result.current.step).toBe(2)

      await act(async () => {
        result.current.goBackToStep1()
      })
      expect(result.current.step).toBe(1)
    })

    it('transitions from step 2 to step 3 via goToStep3', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      await act(async () => {
        result.current.goToStep3()
      })

      expect(result.current.step).toBe(3)
    })

    it('resets to step 1 via recalibrate', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })
      expect(result.current.step).toBe(2)

      await act(async () => {
        result.current.recalibrate()
      })
      expect(result.current.step).toBe(1)
      expect(result.current.progress).toBe(0)
    })
  })

  describe('step 2 - position check', () => {
    it('resets position state when entering step 2', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      await act(async () => {
        result.current.goToStep2()
      })

      expect(result.current.positionResult.status).toBe('no_face')
      expect(result.current.canContinue).toBe(false)
    })

    it('starts position checking timer when entering step 2', async () => {
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

  describe('step 3 - mock collection', () => {
    it('auto-advances to step 4 after mock collection completes', async () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibrationWizard({ videoRef }))

      // Go to step 2 then step 3
      await act(async () => {
        result.current.goToStep2()
      })
      await act(async () => {
        result.current.goToStep3()
      })

      expect(result.current.step).toBe(3)

      // Advance through mock collection (3 seconds)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500)
      })

      expect(result.current.step).toBe(4)
      expect(result.current.progress).toBe(1)
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

      // Advance 1.5 seconds (half of 3s mock duration)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
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
        await vi.advanceTimersByTimeAsync(3500)
      })

      expect(result.current.step).toBe(4)

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
