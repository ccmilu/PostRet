import { renderHook, act } from '@testing-library/react'
import type { IpcApi, PostureStatus, AppStatus } from '@/types/ipc'
import {
  DEFAULT_SETTINGS,
  type CalibrationData,
  type DetectionSettings,
} from '@/types/settings'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import type { PoseDetector } from '@/services/pose-detection/pose-detector'

// --- Mock modules ---

const mockCreatePoseDetector = vi.fn()
vi.mock('@/services/pose-detection/pose-detector', () => ({
  createPoseDetector: (...args: unknown[]) => mockCreatePoseDetector(...args),
}))

const mockPostureAnalyzerInstance = {
  analyze: vi.fn(),
  analyzeDetailed: vi.fn(),
  updateCalibration: vi.fn(),
  updateSensitivity: vi.fn(),
  updateRuleToggles: vi.fn(),
  updateCustomThresholds: vi.fn(),
  reset: vi.fn(),
}

vi.mock('@/services/posture-analysis/posture-analyzer', () => ({
  PostureAnalyzer: vi.fn().mockImplementation(function (this: unknown) {
    Object.assign(this as Record<string, unknown>, mockPostureAnalyzerInstance)
  }),
}))

// Import the hook — vi.mock is hoisted before imports
import { usePostureDetection } from '@/hooks/usePostureDetection'

// --- Test helpers ---

function createMockLandmark(overrides?: Partial<Landmark>): Landmark {
  return { x: 0.5, y: 0.5, z: 0, visibility: 0.9, ...overrides }
}

function createMockLandmarks(count = 33): readonly Landmark[] {
  return Array.from({ length: count }, () => createMockLandmark())
}

function createMockDetectionFrame(overrides?: Partial<DetectionFrame>): DetectionFrame {
  return {
    landmarks: createMockLandmarks(),
    worldLandmarks: createMockLandmarks(),
    timestamp: Date.now(),
    frameWidth: 640,
    frameHeight: 480,
    ...overrides,
  }
}

function createMockPostureStatus(overrides?: Partial<PostureStatus>): PostureStatus {
  return {
    isGood: true,
    violations: [],
    confidence: 0.9,
    timestamp: Date.now(),
    ...overrides,
  }
}

function createMockPoseDetector(overrides?: Partial<PoseDetector>): PoseDetector {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    detect: vi.fn().mockReturnValue(createMockDetectionFrame()),
    destroy: vi.fn(),
    isReady: vi.fn().mockReturnValue(true),
    ...overrides,
  }
}

function createMockMediaStream(): MediaStream {
  const mockTrack = {
    stop: vi.fn(),
    kind: 'video',
    enabled: true,
  }
  return {
    getTracks: vi.fn().mockReturnValue([mockTrack]),
    getVideoTracks: vi.fn().mockReturnValue([mockTrack]),
    getAudioTracks: vi.fn().mockReturnValue([]),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    active: true,
    id: 'mock-stream-id',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream
}

function createMockVideoElement(): HTMLVideoElement {
  return {
    srcObject: null,
    videoWidth: 640,
    videoHeight: 480,
    readyState: 4, // HAVE_ENOUGH_DATA — video ready
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

const MOCK_CALIBRATION: CalibrationData = {
  headForwardAngle: 10,
  torsoAngle: 5,
  headTiltAngle: 0,
  faceFrameRatio: 0.15,
  shoulderDiff: 0,
  timestamp: Date.now(),
}

const MOCK_DETECTION_SETTINGS: DetectionSettings = {
  ...DEFAULT_SETTINGS.detection,
}

function createMockElectronAPI(overrides?: Partial<IpcApi>): IpcApi {
  return {
    getSettings: vi.fn().mockResolvedValue({
      ...DEFAULT_SETTINGS,
      calibration: MOCK_CALIBRATION,
    }),
    setSettings: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue('paused' as AppStatus),
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

// --- Tests ---

describe('usePostureDetection', () => {
  let mockDetector: PoseDetector
  let mockStream: MediaStream
  let mockVideo: HTMLVideoElement

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()

    // Setup mock detector
    mockDetector = createMockPoseDetector()
    mockCreatePoseDetector.mockReturnValue(mockDetector)

    // Setup mock PostureAnalyzer
    mockPostureAnalyzerInstance.analyze.mockReturnValue(createMockPostureStatus())
    mockPostureAnalyzerInstance.analyzeDetailed.mockReturnValue({
      status: createMockPostureStatus(),
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
    mockPostureAnalyzerInstance.updateCalibration.mockReturnValue(undefined)
    mockPostureAnalyzerInstance.updateSensitivity.mockReturnValue(undefined)
    mockPostureAnalyzerInstance.updateRuleToggles.mockReturnValue(undefined)
    mockPostureAnalyzerInstance.reset.mockReturnValue(undefined)

    // Setup mock MediaStream
    mockStream = createMockMediaStream()

    // Mock getUserMedia — always use defineProperty since jsdom may not have mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      writable: true,
      configurable: true,
    })

    // Mock document.createElement for video element
    const originalCreateElement = document.createElement.bind(document)
    mockVideo = createMockVideoElement()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return mockVideo as unknown as HTMLElement
      }
      return originalCreateElement(tag)
    })

    // Setup body.appendChild as no-op (the hook appends video to body)
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)

    // Setup electronAPI
    window.electronAPI = createMockElectronAPI()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as Record<string, unknown>).electronAPI
    vi.restoreAllMocks()
  })

  // ==============================
  // 1. 初始化
  // ==============================
  describe('initialization', () => {
    it('should have idle state before start', () => {
      const { result } = renderHook(() => usePostureDetection())

      expect(result.current.state).toBe('idle')
      expect(result.current.lastStatus).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('should request camera on start', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: expect.anything() }),
      )
    })

    it('should initialize PoseDetector after camera access', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(mockCreatePoseDetector).toHaveBeenCalled()
      expect(mockDetector.initialize).toHaveBeenCalled()
    })

    it('should transition to detecting state after successful initialization', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('detecting')
    })

    it('should create PostureAnalyzer with calibration and detection settings', async () => {
      const { PostureAnalyzer: MockedAnalyzer } = await import(
        '@/services/posture-analysis/posture-analyzer'
      )

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(MockedAnalyzer).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
        MOCK_DETECTION_SETTINGS.sensitivity,
        MOCK_DETECTION_SETTINGS.rules,
      )
    })
  })

  // ==============================
  // 2. 检测循环
  // ==============================
  describe('detection loop', () => {
    it('should run detection at configured interval (default 500ms)', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      const initialCalls = (mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect((mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBeGreaterThan(initialCalls)
    })

    it('should call detect → analyzeDetailed → reportPostureStatus chain', async () => {
      const mockFrame = createMockDetectionFrame()
      const mockStatus = createMockPostureStatus({ isGood: false })
      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockReturnValue(mockFrame)
      mockPostureAnalyzerInstance.analyzeDetailed.mockReturnValue({
        status: mockStatus,
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

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(mockDetector.detect).toHaveBeenCalled()
      expect(mockPostureAnalyzerInstance.analyzeDetailed).toHaveBeenCalled()
      expect(window.electronAPI.reportPostureStatus).toHaveBeenCalled()
    })

    it('should update lastStatus with the latest PostureStatus', async () => {
      const badPosture = createMockPostureStatus({
        isGood: false,
        violations: [
          { rule: 'FORWARD_HEAD', severity: 0.7, message: 'Head too far forward' },
        ],
      })
      mockPostureAnalyzerInstance.analyzeDetailed.mockReturnValue({
        status: badPosture,
        angles: {
          headForwardAngle: 25,
          torsoAngle: 5,
          headTiltAngle: 0,
          faceFrameRatio: 0.15,
          shoulderDiff: 0,
        },
        deviations: {
          headForward: 15,
          torsoSlouch: 0,
          headTilt: 0,
          faceFrameRatio: 0.15,
          shoulderDiff: 0,
        },
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(result.current.lastStatus).toBeTruthy()
      expect(result.current.lastStatus?.isGood).toBe(false)
      expect(result.current.lastStatus?.violations).toHaveLength(1)
      expect(result.current.lastStatus?.violations[0].rule).toBe('FORWARD_HEAD')
    })

    it('should update lastAngles and lastDeviations from analyzeDetailed result', async () => {
      const expectedAngles = {
        headForwardAngle: 22,
        torsoAngle: 8,
        headTiltAngle: 3.5,
        faceFrameRatio: 0.18,
        shoulderDiff: 2.1,
      }
      const expectedDeviations = {
        headForward: 12,
        torsoSlouch: 3,
        headTilt: 3.5,
        faceFrameRatio: 0.03,
        shoulderDiff: 2.1,
      }
      mockPostureAnalyzerInstance.analyzeDetailed.mockReturnValue({
        status: createMockPostureStatus({ isGood: false }),
        angles: expectedAngles,
        deviations: expectedDeviations,
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(result.current.lastAngles).toEqual(expectedAngles)
      expect(result.current.lastDeviations).toEqual(expectedDeviations)
    })

    it('should not update data when detect returns null (e.g. low visibility)', async () => {
      // First tick: return valid data
      const validResult = {
        status: createMockPostureStatus({ isGood: true }),
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
      }
      mockPostureAnalyzerInstance.analyzeDetailed.mockReturnValue(validResult)

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      // First detection tick: valid data
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(result.current.lastAngles).toEqual(validResult.angles)

      // Now make detect return null (simulating low visibility frames)
      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockReturnValue(null)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // Data should still be the previous valid result, not reset to null
      expect(result.current.lastAngles).toEqual(validResult.angles)
      expect(result.current.lastDeviations).toEqual(validResult.deviations)
    })

    it('should run multiple detection cycles', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500) // 5 intervals at 500ms
      })

      expect((mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBeGreaterThanOrEqual(4)
    })

    it('should skip frame when detect returns null', async () => {
      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockReturnValue(null)

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // analyzeDetailed should not be called if detect returns null
      expect(mockPostureAnalyzerInstance.analyzeDetailed).not.toHaveBeenCalled()
      // State should still be detecting (no error)
      expect(result.current.state).toBe('detecting')
    })

    it('should not detect when video readyState is insufficient', async () => {
      // Override readyState to be too low
      Object.defineProperty(mockVideo, 'readyState', { value: 0, writable: true })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // detect should not be called when video isn't ready
      expect(mockDetector.detect).not.toHaveBeenCalled()
    })
  })

  // ==============================
  // 3. 暂停/恢复
  // ==============================
  describe('pause and resume', () => {
    it('should stop detection loop on pause()', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        result.current.pause()
      })

      expect(result.current.state).toBe('paused')

      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      // detect should not be called while paused
      expect(mockDetector.detect).not.toHaveBeenCalled()
    })

    it('should release camera stream on pause (camera LED off)', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      // Camera should be active at this point
      const tracks = mockStream.getTracks()
      expect(tracks[0].stop).not.toHaveBeenCalled()

      await act(async () => {
        result.current.pause()
      })

      // Camera tracks should be stopped
      expect(tracks[0].stop).toHaveBeenCalled()
      // Video element should be removed
      expect(mockVideo.remove).toHaveBeenCalled()
    })

    it('should reset analyzer filters on pause', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        result.current.pause()
      })

      expect(mockPostureAnalyzerInstance.reset).toHaveBeenCalled()
    })

    it('should re-acquire camera and resume detection loop on resume()', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        result.current.pause()
      })

      expect(result.current.state).toBe('paused')

      // getUserMedia should have been called once during start
      const startCalls = (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length

      await act(async () => {
        await result.current.resume()
      })

      // getUserMedia should have been called again for resume
      expect((navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBe(startCalls + 1)

      expect(result.current.state).toBe('detecting')

      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect((mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBeGreaterThan(0)
    })

    it('should transition to no-camera state when resume fails to acquire camera', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        result.current.pause()
      })

      // Make camera unavailable for resume
      navigator.mediaDevices.getUserMedia = vi
        .fn()
        .mockRejectedValue(new DOMException('Camera in use', 'NotReadableError'))

      await act(async () => {
        await result.current.resume()
      })

      expect(result.current.state).toBe('no-camera')
      expect(result.current.error).toBeTruthy()
    })

    it('should not pause if not currently detecting', async () => {
      const { result } = renderHook(() => usePostureDetection())

      // state is 'idle', pause should be a no-op
      await act(async () => {
        result.current.pause()
      })

      expect(result.current.state).toBe('idle')
    })

    it('should not resume if not currently paused', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      // state is 'detecting', resume should be a no-op
      await act(async () => {
        await result.current.resume()
      })

      expect(result.current.state).toBe('detecting')
    })

    it('should respond to IPC onPause event', async () => {
      let pauseCallback: (() => void) | null = null
      window.electronAPI = createMockElectronAPI({
        onPause: vi.fn().mockImplementation((cb: () => void) => {
          pauseCallback = cb
          return () => {}
        }),
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('detecting')

      await act(async () => {
        pauseCallback?.()
      })

      expect(result.current.state).toBe('paused')
    })

    it('should respond to IPC onResume event', async () => {
      let pauseCallback: (() => void) | null = null
      let resumeCallback: (() => void) | null = null
      window.electronAPI = createMockElectronAPI({
        onPause: vi.fn().mockImplementation((cb: () => void) => {
          pauseCallback = cb
          return () => {}
        }),
        onResume: vi.fn().mockImplementation((cb: () => void) => {
          resumeCallback = cb
          return () => {}
        }),
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        pauseCallback?.()
      })

      expect(result.current.state).toBe('paused')

      // Resume is async (re-acquires camera), so we need to flush promises
      await act(async () => {
        resumeCallback?.()
        // Flush microtask queue so the async resume() completes
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.state).toBe('detecting')
    })
  })

  // ==============================
  // 4. 校准基准线
  // ==============================
  describe('calibration baseline', () => {
    it('should pass calibration data to PostureAnalyzer on start', async () => {
      const { PostureAnalyzer: MockedAnalyzer } = await import(
        '@/services/posture-analysis/posture-analyzer'
      )

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(MockedAnalyzer).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
        expect.any(Number),
        expect.any(Object),
      )
    })

    it('should update baseline when updateCalibration is called', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      const newCalibration: CalibrationData = {
        ...MOCK_CALIBRATION,
        headForwardAngle: 15,
        timestamp: Date.now(),
      }

      await act(async () => {
        result.current.updateCalibration(newCalibration)
      })

      expect(mockPostureAnalyzerInstance.updateCalibration).toHaveBeenCalledWith(newCalibration)
    })
  })

  // ==============================
  // 5. 设置更新
  // ==============================
  describe('detection settings update', () => {
    it('should update sensitivity and rules via updateDetectionSettings', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      const newSettings: DetectionSettings = {
        ...MOCK_DETECTION_SETTINGS,
        sensitivity: 0.9,
      }

      await act(async () => {
        result.current.updateDetectionSettings(newSettings)
      })

      expect(mockPostureAnalyzerInstance.updateSensitivity).toHaveBeenCalledWith(0.9)
      expect(mockPostureAnalyzerInstance.updateRuleToggles).toHaveBeenCalledWith(newSettings.rules)
    })

    it('should restart detection loop with new interval', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      const newSettings: DetectionSettings = {
        ...MOCK_DETECTION_SETTINGS,
        intervalMs: 200,
      }

      await act(async () => {
        result.current.updateDetectionSettings(newSettings)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      // With 200ms interval over 1000ms, should have ~5 calls
      expect((mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBeGreaterThanOrEqual(4)
    })
  })

  // ==============================
  // 6. 清理
  // ==============================
  describe('cleanup on unmount', () => {
    it('should release media stream on unmount', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      unmount()

      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })

    it('should destroy detector on unmount', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      unmount()

      expect(mockDetector.destroy).toHaveBeenCalled()
    })

    it('should clear interval timer on unmount', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      unmount()

      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      expect(mockDetector.detect).not.toHaveBeenCalled()
    })

    it('should clean up IPC listeners on unmount', async () => {
      const unsubPause = vi.fn()
      const unsubResume = vi.fn()
      window.electronAPI = createMockElectronAPI({
        onPause: vi.fn().mockReturnValue(unsubPause),
        onResume: vi.fn().mockReturnValue(unsubResume),
      })

      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      unmount()

      expect(unsubPause).toHaveBeenCalled()
      expect(unsubResume).toHaveBeenCalled()
    })

    it('should remove video element from DOM on unmount', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      unmount()

      expect(mockVideo.remove).toHaveBeenCalled()
    })

    it('should handle stop() explicitly', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('detecting')

      await act(async () => {
        result.current.stop()
      })

      expect(result.current.state).toBe('idle')
      expect(result.current.lastStatus).toBeNull()
      expect(mockDetector.destroy).toHaveBeenCalled()

      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })

    it('stopAsync() should call stop() and wait for camera release delay', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('detecting')

      // stopAsync returns a promise that resolves after the delay
      await act(async () => {
        const promise = result.current.stopAsync()
        // Advance past the 300ms camera release delay
        await vi.advanceTimersByTimeAsync(300)
        await promise
      })

      expect(result.current.state).toBe('idle')
      expect(mockDetector.destroy).toHaveBeenCalled()
      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })

    it('stopAsync() should resolve immediately when no stream was active', async () => {
      const { result } = renderHook(() => usePostureDetection())

      // state is 'idle', no stream active
      await act(async () => {
        const promise = result.current.stopAsync()
        // Should not need to advance timers — no delay when no stream
        await promise
      })

      expect(result.current.state).toBe('idle')
    })

    it('stopAsync() called twice in succession should be safe', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('detecting')

      // Call stopAsync twice — second call should see no stream and resolve immediately
      await act(async () => {
        const p1 = result.current.stopAsync()
        const p2 = result.current.stopAsync()
        await vi.advanceTimersByTimeAsync(300)
        await p1
        await p2
      })

      expect(result.current.state).toBe('idle')
    })

    it('stopAsync() should abort in-flight start() during initialization', async () => {
      // Make initialize take a long time
      let resolveInit: (() => void) | null = null
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolveInit = resolve
        })
      })

      const { result } = renderHook(() => usePostureDetection())

      // Fire start() — it will block at detector.initialize()
      let startPromise: Promise<void> | null = null
      act(() => {
        startPromise = result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.state).toBe('initializing')

      // Call stopAsync while start is in-flight
      await act(async () => {
        const stopPromise = result.current.stopAsync()
        // Advance past camera release delay
        await vi.advanceTimersByTimeAsync(300)
        await stopPromise
      })

      expect(result.current.state).toBe('idle')

      // Resolve init and let start() finish — should detect abort via generation counter
      await act(async () => {
        resolveInit?.()
        await startPromise
      })

      expect(result.current.state).toBe('idle')
      expect(mockDetector.destroy).toHaveBeenCalled()
    })
  })

  // ==============================
  // 7. 错误处理
  // ==============================
  describe('error handling', () => {
    it('should set no-camera state when getUserMedia is rejected', async () => {
      navigator.mediaDevices.getUserMedia = vi
        .fn()
        .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('no-camera')
      expect(result.current.error).toBeTruthy()
    })

    it('should set error state when PoseDetector initialization fails', async () => {
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('WASM load failed'),
      )

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('error')
      expect(result.current.error).toContain('WASM load failed')
    })

    it('should set error with generic message for non-Error rejections', async () => {
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockRejectedValue('some string')

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('error')
      expect(result.current.error).toBeTruthy()
    })

    it('should release resources on initialization error', async () => {
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('init failed'),
      )

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      expect(result.current.state).toBe('error')
      // Stream tracks should have been cleaned up
      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })

    it('should abort in-flight start() when stop() is called during initialization', async () => {
      // Make initialize take a long time so we can call stop() mid-init
      let resolveInit: (() => void) | null = null
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolveInit = resolve
        })
      })

      const { result } = renderHook(() => usePostureDetection())

      // Fire start() — it will progress through camera/video (resolved instantly)
      // and then block at detector.initialize()
      let startPromise: Promise<void> | null = null
      act(() => {
        startPromise = result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      // Flush microtasks so start() progresses past the resolved promises
      // (camera, video.play) and reaches the deferred detector.initialize()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // Confirm we're in initializing state and the detector was created
      expect(result.current.state).toBe('initializing')
      expect(mockCreatePoseDetector).toHaveBeenCalled()

      // Now call stop() while start() is still awaiting detector.initialize()
      act(() => {
        result.current.stop()
      })

      expect(result.current.state).toBe('idle')

      // Resolve the init and await the start promise within act
      await act(async () => {
        resolveInit?.()
        await startPromise
      })

      // State must remain 'idle' — the aborted start() should not override it
      expect(result.current.state).toBe('idle')
      // Detector created during the aborted start should be destroyed
      expect(mockDetector.destroy).toHaveBeenCalled()
    })

    it('should abort in-flight start() when stop() is called during camera acquisition', async () => {
      // Make getUserMedia take a long time
      let resolveCamera: ((stream: MediaStream) => void) | null = null
      navigator.mediaDevices.getUserMedia = vi.fn().mockImplementation(() => {
        return new Promise<MediaStream>((resolve) => {
          resolveCamera = resolve
        })
      })

      const { result } = renderHook(() => usePostureDetection())

      // Fire start() without awaiting — it will suspend at getUserMedia
      let startPromise: Promise<void> | null = null
      act(() => {
        startPromise = result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      // Stop while camera is being acquired (before resolving getUserMedia)
      act(() => {
        result.current.stop()
      })

      expect(result.current.state).toBe('idle')

      // Resolve the camera and await the start promise within act
      await act(async () => {
        resolveCamera?.(mockStream)
        await startPromise
      })

      // State must remain 'idle'
      expect(result.current.state).toBe('idle')
      // The stream obtained after stop should be cleaned up
      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })

    it('should prevent concurrent starts', async () => {
      // Make initialize take a long time
      let resolveInit: (() => void) | null = null
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockImplementation(() => {
        return new Promise<void>((resolve) => {
          resolveInit = resolve
        })
      })

      const { result } = renderHook(() => usePostureDetection())

      // Start first — goes to 'initializing'
      const firstStart = act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      // Tick to let the state update to 'initializing'
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10)
      })

      // Second start should be a no-op since state is 'initializing'
      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      // createPoseDetector should have been called only once
      expect(mockCreatePoseDetector).toHaveBeenCalledTimes(1)

      // Resolve the init so the test can clean up
      resolveInit?.()
      await firstStart
    })
  })

  // ==============================
  // 8. 无 electronAPI
  // ==============================
  describe('without electronAPI', () => {
    it('should still detect locally without reporting to main process', async () => {
      delete (window as Record<string, unknown>).electronAPI

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start(MOCK_CALIBRATION, MOCK_DETECTION_SETTINGS)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // Detection should work
      expect(mockDetector.detect).toHaveBeenCalled()
      // lastStatus should be set
      expect(result.current.lastStatus).toBeTruthy()
    })

    it('should not register IPC listeners when electronAPI is absent', () => {
      delete (window as Record<string, unknown>).electronAPI

      renderHook(() => usePostureDetection())

      // No crash, and no onPause/onResume registered
      // (would have thrown if trying to call undefined.onPause)
    })
  })
})
