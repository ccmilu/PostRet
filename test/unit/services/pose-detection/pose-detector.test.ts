import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock MediaPipe
const mockClose = vi.fn()
const mockDetectForVideo = vi.fn()
const mockCreateFromOptions = vi.fn()
const mockForVisionTasks = vi.fn()

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: (...args: unknown[]) => mockForVisionTasks(...args),
  },
  PoseLandmarker: {
    createFromOptions: (...args: unknown[]) => mockCreateFromOptions(...args),
  },
}))

// Mock model-loader
vi.mock('@/services/pose-detection/model-loader', () => ({
  getModelPath: () => '/models/pose_landmarker_full.task',
  getWasmPath: () => '/wasm',
}))

import { createPoseDetector } from '@/services/pose-detection/pose-detector'
import { TOTAL_LANDMARKS } from '@/services/pose-detection/pose-types'

function makeMockLandmarks(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    x: i * 0.01,
    y: i * 0.02,
    z: i * 0.001,
    visibility: 0.9,
  }))
}

function makeMockVideoElement(width = 640, height = 480) {
  return {
    videoWidth: width,
    videoHeight: height,
  } as unknown as HTMLVideoElement
}

describe('pose-detector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const mockPoseLandmarker = {
      detectForVideo: mockDetectForVideo,
      close: mockClose,
    }
    mockForVisionTasks.mockResolvedValue({})
    mockCreateFromOptions.mockResolvedValue(mockPoseLandmarker)
  })

  describe('createPoseDetector', () => {
    it('returns an object with PoseDetector interface methods', () => {
      const detector = createPoseDetector()
      expect(typeof detector.initialize).toBe('function')
      expect(typeof detector.detect).toBe('function')
      expect(typeof detector.destroy).toBe('function')
      expect(typeof detector.isReady).toBe('function')
    })
  })

  describe('isReady', () => {
    it('returns false before initialization', () => {
      const detector = createPoseDetector()
      expect(detector.isReady()).toBe(false)
    })

    it('returns true after successful initialization', async () => {
      const detector = createPoseDetector()
      await detector.initialize()
      expect(detector.isReady()).toBe(true)
    })
  })

  describe('initialize', () => {
    it('calls FilesetResolver.forVisionTasks with WASM path', async () => {
      const detector = createPoseDetector()
      await detector.initialize()
      expect(mockForVisionTasks).toHaveBeenCalledWith('/wasm')
    })

    it('calls PoseLandmarker.createFromOptions with correct config', async () => {
      const detector = createPoseDetector({
        numPoses: 2,
        minPoseDetectionConfidence: 0.7,
      })
      await detector.initialize()
      expect(mockCreateFromOptions).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          runningMode: 'VIDEO',
          numPoses: 2,
          minPoseDetectionConfidence: 0.7,
        }),
      )
    })

    it('uses default model path when config.modelPath is empty', async () => {
      const detector = createPoseDetector()
      await detector.initialize()
      expect(mockCreateFromOptions).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          baseOptions: expect.objectContaining({
            modelAssetPath: '/models/pose_landmarker_full.task',
          }),
        }),
      )
    })

    it('uses custom model path when provided', async () => {
      const detector = createPoseDetector({ modelPath: '/custom/model.task' })
      await detector.initialize()
      expect(mockCreateFromOptions).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          baseOptions: expect.objectContaining({
            modelAssetPath: '/custom/model.task',
          }),
        }),
      )
    })

    it('throws error with message when FilesetResolver fails with Error', async () => {
      mockForVisionTasks.mockRejectedValue(new Error('WASM load failed'))
      const detector = createPoseDetector()
      await expect(detector.initialize()).rejects.toThrow('PoseDetector 初始化失败: WASM load failed')
      expect(detector.isReady()).toBe(false)
    })

    it('throws error when PoseLandmarker.createFromOptions fails', async () => {
      mockCreateFromOptions.mockRejectedValue(new Error('Model load failed'))
      const detector = createPoseDetector()
      await expect(detector.initialize()).rejects.toThrow('PoseDetector 初始化失败: Model load failed')
      expect(detector.isReady()).toBe(false)
    })

    it('produces human-readable error when Event object is thrown', async () => {
      // Simulate what happens when WASM onerror fires — throws an Event-like object
      const eventLikeError = { type: 'error', target: { src: 'https://example.com/wasm/vision.js' } }
      mockForVisionTasks.mockRejectedValue(eventLikeError)
      const detector = createPoseDetector()
      await expect(detector.initialize()).rejects.toThrow('资源加载失败 (error): https://example.com/wasm/vision.js')
    })

    it('produces human-readable error when Event object without target.src is thrown', async () => {
      const eventLikeError = { type: 'error' }
      mockForVisionTasks.mockRejectedValue(eventLikeError)
      const detector = createPoseDetector()
      await expect(detector.initialize()).rejects.toThrow('资源加载失败 (error)')
    })

    it('produces human-readable error when ErrorEvent with message is thrown', async () => {
      const errorEvent = { type: 'error', message: 'Script error.' }
      mockForVisionTasks.mockRejectedValue(errorEvent)
      const detector = createPoseDetector()
      await expect(detector.initialize()).rejects.toThrow('PoseDetector 初始化失败: Script error.')
    })

    it('produces fallback error for opaque [object Event] strings', async () => {
      // Object whose String() produces [object Event]
      const opaqueObj = { toString: () => '[object Event]' }
      mockForVisionTasks.mockRejectedValue(opaqueObj)
      const detector = createPoseDetector()
      await expect(detector.initialize()).rejects.toThrow('WASM 或模型文件加载失败，请检查网络连接和文件路径')
    })
  })

  describe('detect', () => {
    it('returns null when not initialized', () => {
      const detector = createPoseDetector()
      const video = makeMockVideoElement()
      expect(detector.detect(video, 1000)).toBeNull()
    })

    it('correctly converts MediaPipe result to DetectionFrame', async () => {
      const landmarks33 = makeMockLandmarks(33)
      const worldLandmarks33 = makeMockLandmarks(33)
      mockDetectForVideo.mockReturnValue({
        landmarks: [landmarks33],
        worldLandmarks: [worldLandmarks33],
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement(1280, 720)
      const result = detector.detect(video, 5000)

      expect(result).not.toBeNull()
      expect(result!.landmarks.length).toBe(TOTAL_LANDMARKS)
      expect(result!.worldLandmarks.length).toBe(TOTAL_LANDMARKS)
      expect(result!.timestamp).toBe(5000)
      expect(result!.frameWidth).toBe(1280)
      expect(result!.frameHeight).toBe(720)
    })

    it('returns null when no person detected (empty landmarks)', async () => {
      mockDetectForVideo.mockReturnValue({
        landmarks: [],
        worldLandmarks: [],
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      expect(detector.detect(video, 1000)).toBeNull()
    })

    it('returns null when landmarks is null/undefined', async () => {
      mockDetectForVideo.mockReturnValue({
        landmarks: null,
        worldLandmarks: null,
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      expect(detector.detect(video, 1000)).toBeNull()
    })

    it('returns null when fewer than 33 landmarks detected', async () => {
      mockDetectForVideo.mockReturnValue({
        landmarks: [makeMockLandmarks(20)],
        worldLandmarks: [makeMockLandmarks(20)],
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      expect(detector.detect(video, 1000)).toBeNull()
    })

    it('returns null and does not crash when detectForVideo throws', async () => {
      mockDetectForVideo.mockImplementation(() => {
        throw new Error('Detection failed')
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      expect(detector.detect(video, 1000)).toBeNull()
    })

    it('defaults visibility to 0 when undefined', async () => {
      const landmarksNoVisibility = Array.from({ length: 33 }, (_, i) => ({
        x: i * 0.01,
        y: i * 0.02,
        z: i * 0.001,
        // no visibility property
      }))
      mockDetectForVideo.mockReturnValue({
        landmarks: [landmarksNoVisibility],
        worldLandmarks: [landmarksNoVisibility],
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      const result = detector.detect(video, 1000)

      expect(result).not.toBeNull()
      for (const lm of result!.landmarks) {
        expect(lm.visibility).toBe(0)
      }
    })

    it('copies visibility from normalizedLandmarks to worldLandmarks', async () => {
      // Simulate MediaPipe behavior: worldLandmarks have visibility=0,
      // but normalizedLandmarks (result.landmarks) have real visibility values
      const normalizedLandmarks = Array.from({ length: 33 }, (_, i) => ({
        x: i * 0.01,
        y: i * 0.02,
        z: i * 0.001,
        visibility: 0.85 + i * 0.001,
      }))
      const worldLandmarksNoVis = Array.from({ length: 33 }, (_, i) => ({
        x: i * 0.1,
        y: i * 0.2,
        z: i * 0.01,
        visibility: 0, // worldLandmarks often have 0 visibility at runtime
      }))
      mockDetectForVideo.mockReturnValue({
        landmarks: [normalizedLandmarks],
        worldLandmarks: [worldLandmarksNoVis],
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      const result = detector.detect(video, 1000)

      expect(result).not.toBeNull()
      // worldLandmarks should use xyz from world data but visibility from normalized
      for (let i = 0; i < 33; i++) {
        expect(result!.worldLandmarks[i].x).toBe(worldLandmarksNoVis[i].x)
        expect(result!.worldLandmarks[i].y).toBe(worldLandmarksNoVis[i].y)
        expect(result!.worldLandmarks[i].visibility).toBeCloseTo(
          normalizedLandmarks[i].visibility,
          5
        )
      }
    })

    it('uses landmarks as worldLandmarks when worldLandmarks is missing', async () => {
      const landmarks33 = makeMockLandmarks(33)
      mockDetectForVideo.mockReturnValue({
        landmarks: [landmarks33],
        worldLandmarks: undefined,
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      const result = detector.detect(video, 1000)

      expect(result).not.toBeNull()
      expect(result!.worldLandmarks.length).toBe(33)
      // worldLandmarks should fallback to landmarks values
      expect(result!.worldLandmarks[0].x).toBe(result!.landmarks[0].x)
    })

    it('uses landmarks as worldLandmarks when worldLandmarks[0] is missing', async () => {
      const landmarks33 = makeMockLandmarks(33)
      mockDetectForVideo.mockReturnValue({
        landmarks: [landmarks33],
        worldLandmarks: [],
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      const result = detector.detect(video, 1000)

      expect(result).not.toBeNull()
      // When worldLandmarks[0] is falsy, falls back to landmarks
      expect(result!.worldLandmarks.length).toBe(33)
    })
  })

  describe('destroy', () => {
    it('calls poseLandmarker.close() and resets ready state', async () => {
      const detector = createPoseDetector()
      await detector.initialize()
      expect(detector.isReady()).toBe(true)

      detector.destroy()
      expect(mockClose).toHaveBeenCalled()
      expect(detector.isReady()).toBe(false)
    })

    it('detect returns null after destroy', async () => {
      mockDetectForVideo.mockReturnValue({
        landmarks: [makeMockLandmarks(33)],
        worldLandmarks: [makeMockLandmarks(33)],
      })

      const detector = createPoseDetector()
      await detector.initialize()

      const video = makeMockVideoElement()
      expect(detector.detect(video, 1000)).not.toBeNull()

      detector.destroy()
      expect(detector.detect(video, 2000)).toBeNull()
    })

    it('does not throw when called before initialization', () => {
      const detector = createPoseDetector()
      expect(() => detector.destroy()).not.toThrow()
    })

    it('does not throw when called twice', async () => {
      const detector = createPoseDetector()
      await detector.initialize()
      detector.destroy()
      expect(() => detector.destroy()).not.toThrow()
    })
  })
})
