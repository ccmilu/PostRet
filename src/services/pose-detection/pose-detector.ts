import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import {
  DetectionFrame,
  Landmark,
  PoseDetectorConfig,
  DEFAULT_POSE_DETECTOR_CONFIG,
  TOTAL_LANDMARKS,
} from './pose-types'
import { getModelPath, getWasmPath } from './model-loader'

/**
 * Extract a human-readable message from various error types.
 * MediaPipe WASM/model loading failures often throw Event objects
 * (e.g. from onerror handlers) which serialize as "[object Event]".
 */
function formatInitError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  // DOM Event objects (e.g. from script/fetch onerror)
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>

    // ErrorEvent has a `message` property
    if (typeof obj.message === 'string' && obj.message.length > 0) {
      return obj.message
    }

    // Event from a failed resource load (script, fetch)
    if (typeof obj.type === 'string') {
      const target = obj.target as Record<string, unknown> | undefined
      const src = target?.src ?? target?.href ?? ''
      return src
        ? `资源加载失败 (${obj.type}): ${String(src)}`
        : `资源加载失败 (${obj.type})`
    }
  }

  // Fallback for strings and other primitives
  const str = String(error)
  if (str === '[object Object]' || str === '[object Event]') {
    return 'WASM 或模型文件加载失败，请检查网络连接和文件路径'
  }
  return str
}

export interface PoseDetector {
  /** 初始化 PoseLandmarker（加载模型和 WASM） */
  initialize(): Promise<void>

  /** 对视频帧运行姿态检测 */
  detect(videoElement: HTMLVideoElement, timestamp: number): DetectionFrame | null

  /** 释放资源 */
  destroy(): void

  /** 检查是否已初始化 */
  isReady(): boolean
}

/**
 * 创建 PoseDetector 实例
 */
export function createPoseDetector(
  config?: Partial<PoseDetectorConfig>,
): PoseDetector {
  const fullConfig = { ...DEFAULT_POSE_DETECTOR_CONFIG, ...config }
  let poseLandmarker: PoseLandmarker | null = null
  let ready = false

  return {
    async initialize(): Promise<void> {
      try {
        const wasmPath = getWasmPath()
        const vision = await FilesetResolver.forVisionTasks(wasmPath)

        const modelPath = fullConfig.modelPath || getModelPath()

        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: fullConfig.numPoses,
          minPoseDetectionConfidence: fullConfig.minPoseDetectionConfidence,
          minPosePresenceConfidence: fullConfig.minPosePresenceConfidence,
          minTrackingConfidence: fullConfig.minTrackingConfidence,
        })

        ready = true
      } catch (error) {
        ready = false
        throw new Error(
          `PoseDetector 初始化失败: ${formatInitError(error)}`,
        )
      }
    },

    detect(
      videoElement: HTMLVideoElement,
      timestamp: number,
    ): DetectionFrame | null {
      if (!poseLandmarker || !ready) {
        return null
      }

      try {
        const result = poseLandmarker.detectForVideo(videoElement, timestamp)

        if (!result.landmarks || result.landmarks.length === 0) {
          return null
        }

        const rawLandmarks = result.landmarks[0]
        const rawWorldLandmarks = result.worldLandmarks?.[0]

        if (!rawLandmarks || rawLandmarks.length < TOTAL_LANDMARKS) {
          return null
        }

        const landmarks: readonly Landmark[] = rawLandmarks.map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          visibility: lm.visibility ?? 0,
        }))

        const worldLandmarks: readonly Landmark[] = rawWorldLandmarks
          ? rawWorldLandmarks.map((lm) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z,
              visibility: lm.visibility ?? 0,
            }))
          : landmarks

        return {
          landmarks,
          worldLandmarks,
          timestamp,
          frameWidth: videoElement.videoWidth,
          frameHeight: videoElement.videoHeight,
        }
      } catch (error) {
        console.warn('姿态检测异常:', error)
        return null
      }
    },

    destroy(): void {
      if (poseLandmarker) {
        poseLandmarker.close()
        poseLandmarker = null
      }
      ready = false
    },

    isReady(): boolean {
      return ready
    },
  }
}
