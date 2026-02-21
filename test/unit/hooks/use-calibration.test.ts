import { renderHook, act } from '@testing-library/react'
import { useCalibration } from '@/hooks/useCalibration'
import type { IpcApi } from '@/types/ipc'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { createRef, type RefObject } from 'react'
import type { DetectionFrame } from '@/services/pose-detection/pose-types'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'

function createMockElectronAPI(
  overrides?: Partial<IpcApi>,
): IpcApi {
  return {
    getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
    setSettings: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue('paused'),
    requestCameraPermission: vi.fn().mockResolvedValue(true),
    startCalibration: vi.fn().mockResolvedValue(undefined),
    completeCalibration: vi.fn().mockResolvedValue(undefined),
    reportPostureStatus: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockReturnValue(() => {}),
    onPause: vi.fn().mockReturnValue(() => {}),
    onResume: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  }
}

function createMockVideoRef(): RefObject<HTMLVideoElement | null> {
  const ref = createRef<HTMLVideoElement | null>()
  // createRef returns { current: null }, which is fine for mock mode
  return ref
}

function createVideoRefWithElement(): RefObject<HTMLVideoElement | null> {
  const video = document.createElement('video')
  return { current: video }
}

const MOCK_ANGLES: PostureAngles = {
  headForwardAngle: 10,
  torsoAngle: 5,
  headTiltAngle: 2,
  faceFrameRatio: 0.15,
  shoulderDiff: 0.01,
}

function createMockFrame(): DetectionFrame {
  return {
    landmarks: [],
    worldLandmarks: [],
    timestamp: performance.now(),
    frameWidth: 640,
    frameHeight: 480,
  }
}

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

vi.mock('@/services/posture-analysis/angle-calculator', () => ({
  extractPostureAngles: vi.fn().mockReturnValue({
    headForwardAngle: 10,
    torsoAngle: 5,
    headTiltAngle: 2,
    faceFrameRatio: 0.15,
    shoulderDiff: 0.01,
  }),
}))

describe('useCalibration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockDetect.mockClear()
    mockInitialize.mockClear()
    mockDestroy.mockClear()
    mockIsReady.mockClear().mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as Record<string, unknown>).electronAPI
  })

  describe('initial state', () => {
    it('should start with idle status and zero progress', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('mock calibration (no electronAPI)', () => {
    it('should transition from idle to collecting on start', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      act(() => {
        result.current.startCalibration()
      })

      expect(result.current.status).toBe('collecting')
      expect(result.current.progress).toBe(0)
    })

    it('should update progress over time', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(result.current.status).toBe('collecting')
      expect(result.current.progress).toBeGreaterThan(0)
      expect(result.current.progress).toBeLessThan(1)
    })

    it('should complete after 3 seconds', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(3100)
      })

      expect(result.current.status).toBe('completed')
      expect(result.current.progress).toBe(1)
    })

    it('should not start if already collecting', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      act(() => {
        result.current.startCalibration()
      })

      expect(result.current.status).toBe('collecting')

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      const progressBefore = result.current.progress

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(result.current.progress).toBeGreaterThanOrEqual(progressBefore)
    })
  })

  describe('reset', () => {
    it('should reset from collecting to idle', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.status).toBe('collecting')

      act(() => {
        result.current.reset()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('should reset from completed to idle', () => {
      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(3100)
      })

      expect(result.current.status).toBe('completed')

      act(() => {
        result.current.reset()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
    })

    it('should reset from error to idle', async () => {
      window.electronAPI = createMockElectronAPI({
        startCalibration: vi
          .fn()
          .mockRejectedValue(new Error('Camera failed')),
      })

      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('摄像头未就绪')

      act(() => {
        result.current.reset()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('with electronAPI', () => {
    it('should set error when video ref is null', async () => {
      window.electronAPI = createMockElectronAPI()

      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('摄像头未就绪')
    })

    it('should set error status when startCalibration fails', async () => {
      window.electronAPI = createMockElectronAPI({
        startCalibration: vi
          .fn()
          .mockRejectedValue(new Error('Camera not found')),
      })

      const videoRef = createMockVideoRef()
      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('摄像头未就绪')
    })
  })

  describe('Electron calibration sample collection', () => {
    it('should collect samples over time with progress updates', async () => {
      const videoRef = createVideoRefWithElement()
      const mockCompleteCalibration = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        completeCalibration: mockCompleteCalibration,
      })

      mockDetect.mockReturnValue(createMockFrame())

      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      expect(result.current.status).toBe('collecting')

      // Advance a few intervals to collect some samples
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // Progress should be non-zero but less than 1
      expect(result.current.progress).toBeGreaterThan(0)
      expect(result.current.progress).toBeLessThan(1)
    })

    it('should complete after collecting all 30 samples', async () => {
      const videoRef = createVideoRefWithElement()
      const mockCompleteCalibration = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        completeCalibration: mockCompleteCalibration,
      })

      mockDetect.mockReturnValue(createMockFrame())

      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      // Advance enough time to collect all 30 samples (30 * 100ms = 3000ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500)
      })

      expect(result.current.status).toBe('completed')
      expect(result.current.progress).toBe(1)
    })

    it('should call completeCalibration with baseline data containing valid angles', async () => {
      const videoRef = createVideoRefWithElement()
      const mockCompleteCalibration = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        completeCalibration: mockCompleteCalibration,
      })

      mockDetect.mockReturnValue(createMockFrame())

      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      // Collect all samples
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3500)
      })

      expect(mockCompleteCalibration).toHaveBeenCalledTimes(1)
      const baselineData = mockCompleteCalibration.mock.calls[0][0]
      expect(baselineData).toHaveProperty('headForwardAngle')
      expect(baselineData).toHaveProperty('torsoAngle')
      expect(baselineData).toHaveProperty('headTiltAngle')
      expect(baselineData).toHaveProperty('faceFrameRatio')
      expect(baselineData).toHaveProperty('shoulderDiff')
      expect(baselineData).toHaveProperty('timestamp')
    })

    it('should initialize PoseDetector during electron calibration', async () => {
      const videoRef = createVideoRefWithElement()
      window.electronAPI = createMockElectronAPI()
      mockDetect.mockReturnValue(createMockFrame())

      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      expect(mockInitialize).toHaveBeenCalledTimes(1)
    })

    it('should skip frames where detect returns null', async () => {
      const videoRef = createVideoRefWithElement()
      const mockCompleteCalibration = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        completeCalibration: mockCompleteCalibration,
      })

      // Alternate between null and valid frames
      let callCount = 0
      mockDetect.mockImplementation(() => {
        callCount++
        return callCount % 2 === 0 ? createMockFrame() : null
      })

      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      // After 1500ms with half the frames null, should have ~7 samples
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })

      expect(result.current.progress).toBeGreaterThan(0)
      expect(result.current.progress).toBeLessThan(1)
    })

    it('should call electronAPI.startCalibration before collecting', async () => {
      const videoRef = createVideoRefWithElement()
      const mockStartCalibration = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        startCalibration: mockStartCalibration,
      })

      mockDetect.mockReturnValue(createMockFrame())

      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      expect(mockStartCalibration).toHaveBeenCalledTimes(1)
    })

    it('should progress gradually from 0 to ~0.5 at halfway and ~1.0 at completion (not jump from 0 to 1)', async () => {
      const videoRef = createVideoRefWithElement()
      const mockCompleteCalibration = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        completeCalibration: mockCompleteCalibration,
      })

      mockDetect.mockReturnValue(createMockFrame())

      const { result } = renderHook(() => useCalibration({ videoRef }))

      // Start calibration and let the async initialization complete
      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      expect(result.current.status).toBe('collecting')
      expect(result.current.progress).toBe(0)

      // Advance ~1500ms (about 15 samples out of 30) => progress ~0.5
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500)
      })

      expect(result.current.status).toBe('collecting')
      expect(result.current.progress).toBeGreaterThanOrEqual(0.4)
      expect(result.current.progress).toBeLessThanOrEqual(0.6)

      // Advance the rest (~1500ms more, total ~3000ms, 30 samples) => progress = 1.0
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1600)
      })

      expect(result.current.progress).toBe(1)
      expect(result.current.status).toBe('completed')

      // completeCalibration must have been called with valid CalibrationData
      expect(mockCompleteCalibration).toHaveBeenCalledTimes(1)
      const baseline = mockCompleteCalibration.mock.calls[0][0]
      expect(baseline).toHaveProperty('headForwardAngle')
      expect(baseline).toHaveProperty('torsoAngle')
      expect(baseline).toHaveProperty('headTiltAngle')
      expect(baseline).toHaveProperty('faceFrameRatio')
      expect(baseline).toHaveProperty('shoulderDiff')
      expect(baseline).toHaveProperty('timestamp')
      expect(typeof baseline.timestamp).toBe('number')
    })

    it('progress should increase monotonically from 0 to 1', async () => {
      const videoRef = createVideoRefWithElement()
      window.electronAPI = createMockElectronAPI()
      mockDetect.mockReturnValue(createMockFrame())

      const { result } = renderHook(() => useCalibration({ videoRef }))

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(50)
      })

      const progressValues: number[] = [result.current.progress]

      // Advance in small steps and record progress
      for (let i = 0; i < 30; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100)
        })
        progressValues.push(result.current.progress)
      }

      // Verify monotonic increase
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1])
      }

      // Should reach 1
      expect(progressValues[progressValues.length - 1]).toBe(1)
    })
  })

  describe('cleanup on unmount', () => {
    it('should clear interval when component unmounts during mock calibration', () => {
      const videoRef = createMockVideoRef()
      const { result, unmount } = renderHook(() => useCalibration({ videoRef }))

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.status).toBe('collecting')

      unmount()

      // Should not throw or cause issues when timers fire after unmount
      act(() => {
        vi.advanceTimersByTime(5000)
      })
    })
  })
})
