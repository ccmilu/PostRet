import { renderHook, act } from '@testing-library/react'
import type { IpcApi, PostureStatus, AppStatus } from '@/types/ipc'
import { DEFAULT_SETTINGS, type CalibrationData, type PostureSettings } from '@/types/settings'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import type { PoseDetector } from '@/services/pose-detection/pose-detector'
import type { PostureAnalyzer } from '@/services/posture-analysis/posture-analyzer'

// --- Mock modules ---

const mockCreatePoseDetector = vi.fn()
vi.mock('@/services/pose-detection/pose-detector', () => ({
  createPoseDetector: (...args: unknown[]) => mockCreatePoseDetector(...args),
}))

const mockPostureAnalyzerInstance = {
  analyze: vi.fn(),
  updateCalibration: vi.fn(),
  updateSensitivity: vi.fn(),
  updateRuleToggles: vi.fn(),
  reset: vi.fn(),
}

vi.mock('@/services/posture-analysis/posture-analyzer', () => ({
  PostureAnalyzer: vi.fn().mockImplementation(() => mockPostureAnalyzerInstance),
}))

// Import the hook after mocking
// eslint-disable-next-line @typescript-eslint/no-require-imports
let usePostureDetection: typeof import('@/hooks/usePostureDetection').usePostureDetection

// --- Test helpers ---

function createMockLandmark(overrides?: Partial<Landmark>): Landmark {
  return {
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
    ...overrides,
  }
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
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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
  let originalGetUserMedia: typeof navigator.mediaDevices.getUserMedia
  let originalCreateElement: typeof document.createElement

  beforeEach(async () => {
    vi.useFakeTimers()

    // Reset all mocks
    vi.clearAllMocks()

    // Setup mock detector
    mockDetector = createMockPoseDetector()
    mockCreatePoseDetector.mockReturnValue(mockDetector)

    // Setup mock PostureAnalyzer
    mockPostureAnalyzerInstance.analyze.mockReturnValue(createMockPostureStatus())
    mockPostureAnalyzerInstance.updateCalibration.mockReturnValue(undefined)
    mockPostureAnalyzerInstance.updateSensitivity.mockReturnValue(undefined)
    mockPostureAnalyzerInstance.updateRuleToggles.mockReturnValue(undefined)
    mockPostureAnalyzerInstance.reset.mockReturnValue(undefined)

    // Setup mock MediaStream
    mockStream = createMockMediaStream()

    // Mock getUserMedia
    originalGetUserMedia = navigator.mediaDevices?.getUserMedia
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
        writable: true,
        configurable: true,
      })
    } else {
      navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream)
    }

    // Mock document.createElement for video element
    originalCreateElement = document.createElement.bind(document)
    const mockVideo = createMockVideoElement()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return mockVideo as unknown as HTMLElement
      }
      return originalCreateElement(tag)
    })

    // Setup electronAPI
    window.electronAPI = createMockElectronAPI()

    // Dynamic import to pick up mocks
    const mod = await import('@/hooks/usePostureDetection')
    usePostureDetection = mod.usePostureDetection
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as Record<string, unknown>).electronAPI

    if (originalGetUserMedia && navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = originalGetUserMedia
    }
    vi.restoreAllMocks()
  })

  // ==============================
  // 1. 初始化
  // ==============================
  describe('initialization', () => {
    it('should have idle status before start', () => {
      const { result } = renderHook(() => usePostureDetection())

      expect(result.current.status).toBe('idle')
      expect(result.current.currentPosture).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('should request camera permission on start', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: expect.anything() }),
      )
    })

    it('should initialize PoseDetector after camera access', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(mockCreatePoseDetector).toHaveBeenCalled()
      expect(mockDetector.initialize).toHaveBeenCalled()
    })

    it('should transition to detecting status after successful initialization', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(result.current.status).toBe('detecting')
    })

    it('should load settings and apply calibration baseline', async () => {
      const settingsWithCalibration: PostureSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
      }
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockResolvedValue(settingsWithCalibration),
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(result.current.status).toBe('detecting')
    })
  })

  // ==============================
  // 2. 检测循环
  // ==============================
  describe('detection loop', () => {
    it('should run detection at configured interval (default 500ms)', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      // Initial detection call may happen right away
      const initialCalls = (mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect((mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBeGreaterThan(initialCalls)
    })

    it('should call detect → analyze → reportPostureStatus chain', async () => {
      const mockFrame = createMockDetectionFrame()
      const mockStatus = createMockPostureStatus({ isGood: false })
      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockReturnValue(mockFrame)
      mockPostureAnalyzerInstance.analyze.mockReturnValue(mockStatus)

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // detect was called
      expect(mockDetector.detect).toHaveBeenCalled()

      // analyze was called with the frame
      expect(mockPostureAnalyzerInstance.analyze).toHaveBeenCalled()

      // reportPostureStatus was called with the analysis result
      expect(window.electronAPI.reportPostureStatus).toHaveBeenCalled()
    })

    it('should update currentPosture with the latest PostureStatus', async () => {
      const badPosture = createMockPostureStatus({
        isGood: false,
        violations: [
          { rule: 'FORWARD_HEAD', severity: 0.7, message: 'Head too far forward' },
        ],
      })
      mockPostureAnalyzerInstance.analyze.mockReturnValue(badPosture)

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      expect(result.current.currentPosture).toBeTruthy()
      expect(result.current.currentPosture?.isGood).toBe(false)
      expect(result.current.currentPosture?.violations).toHaveLength(1)
      expect(result.current.currentPosture?.violations[0].rule).toBe('FORWARD_HEAD')
    })

    it('should run multiple detection cycles', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      // Reset call counts after initialization
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
        await result.current.start()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // analyze should not be called if detect returns null
      expect(mockPostureAnalyzerInstance.analyze).not.toHaveBeenCalled()
      // Status should still be detecting (no error)
      expect(result.current.status).toBe('detecting')
    })
  })

  // ==============================
  // 3. 暂停/恢复
  // ==============================
  describe('pause and resume', () => {
    it('should stop detection loop on pause()', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      await act(async () => {
        result.current.pause()
      })

      expect(result.current.status).toBe('paused')

      // Reset call count
      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      // detect should not be called while paused
      expect(mockDetector.detect).not.toHaveBeenCalled()
    })

    it('should resume detection loop on resume()', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      await act(async () => {
        result.current.pause()
      })

      expect(result.current.status).toBe('paused')

      await act(async () => {
        result.current.resume()
      })

      expect(result.current.status).toBe('detecting')

      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockClear()

      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      expect((mockDetector.detect as ReturnType<typeof vi.fn>).mock.calls.length)
        .toBeGreaterThan(0)
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
        await result.current.start()
      })

      expect(result.current.status).toBe('detecting')

      // Simulate IPC pause event
      await act(async () => {
        pauseCallback?.()
      })

      expect(result.current.status).toBe('paused')
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
        await result.current.start()
      })

      // Pause first
      await act(async () => {
        pauseCallback?.()
      })

      expect(result.current.status).toBe('paused')

      // Resume via IPC
      await act(async () => {
        resumeCallback?.()
      })

      expect(result.current.status).toBe('detecting')
    })
  })

  // ==============================
  // 4. 校准基准线
  // ==============================
  describe('calibration baseline', () => {
    it('should load calibration from settings on start', async () => {
      const settingsWithCalibration: PostureSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
      }
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockResolvedValue(settingsWithCalibration),
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      // PostureAnalyzer should have been constructed or updated with calibration data
      expect(result.current.status).toBe('detecting')
    })

    it('should handle missing calibration gracefully', async () => {
      const settingsNoCalibration: PostureSettings = {
        ...DEFAULT_SETTINGS,
        calibration: null,
      }
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockResolvedValue(settingsNoCalibration),
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      // Should still work without calibration data (using defaults)
      expect(result.current.status).toBe('detecting')
    })

    it('should update baseline when calibration changes', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      const newCalibration: CalibrationData = {
        ...MOCK_CALIBRATION,
        headForwardAngle: 15,
        timestamp: Date.now(),
      }

      await act(async () => {
        result.current.updateCalibration(newCalibration)
      })

      // Analyzer should have been updated
      expect(mockPostureAnalyzerInstance.updateCalibration).toHaveBeenCalledWith(newCalibration)
    })
  })

  // ==============================
  // 5. 清理
  // ==============================
  describe('cleanup on unmount', () => {
    it('should release media stream on unmount', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      unmount()

      // All tracks should be stopped
      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })

    it('should destroy detector on unmount', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      unmount()

      expect(mockDetector.destroy).toHaveBeenCalled()
    })

    it('should clear interval timer on unmount', async () => {
      const { result, unmount } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      unmount()

      // After unmount, advancing timers should not cause detect calls
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
        await result.current.start()
      })

      unmount()

      expect(unsubPause).toHaveBeenCalled()
      expect(unsubResume).toHaveBeenCalled()
    })

    it('should handle stop() explicitly', async () => {
      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(result.current.status).toBe('detecting')

      await act(async () => {
        result.current.stop()
      })

      expect(result.current.status).toBe('idle')
      expect(mockDetector.destroy).toHaveBeenCalled()

      // Stream tracks should be stopped
      const tracks = mockStream.getTracks()
      for (const track of tracks) {
        expect(track.stop).toHaveBeenCalled()
      }
    })
  })

  // ==============================
  // 6. 错误处理
  // ==============================
  describe('error handling', () => {
    it('should set no-camera status when getUserMedia is rejected', async () => {
      navigator.mediaDevices.getUserMedia = vi
        .fn()
        .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(result.current.status).toBe('no-camera')
      expect(result.current.error).toBeTruthy()
    })

    it('should set error status when PoseDetector initialization fails', async () => {
      ;(mockDetector.initialize as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('WASM load failed'),
      )

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toContain('WASM load failed')
    })

    it('should skip frame and continue when detection throws', async () => {
      let callCount = 0
      ;(mockDetector.detect as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          throw new Error('GPU context lost')
        }
        return createMockDetectionFrame()
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      // Advance through several intervals — some will throw, later ones succeed
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000)
      })

      // Should still be detecting (not in error state)
      expect(result.current.status).toBe('detecting')
    })

    it('should skip frame when analyze throws', async () => {
      mockPostureAnalyzerInstance.analyze.mockImplementationOnce(() => {
        throw new Error('Unexpected angle')
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // Should continue detecting despite analyze error
      expect(result.current.status).toBe('detecting')
    })

    it('should handle getUserMedia not available gracefully', async () => {
      const origMediaDevices = navigator.mediaDevices
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true,
      })

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      expect(result.current.status).toBe('no-camera')

      // Restore
      Object.defineProperty(navigator, 'mediaDevices', {
        value: origMediaDevices,
        writable: true,
        configurable: true,
      })
    })
  })

  // ==============================
  // 7. 不报告 when electronAPI not available
  // ==============================
  describe('without electronAPI', () => {
    it('should still detect locally without reporting to main process', async () => {
      delete (window as Record<string, unknown>).electronAPI

      const { result } = renderHook(() => usePostureDetection())

      await act(async () => {
        await result.current.start()
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })

      // Detection should work
      expect(mockDetector.detect).toHaveBeenCalled()
      // currentPosture should be set
      expect(result.current.currentPosture).toBeTruthy()
    })
  })
})
