import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import {
  DetectionFrame,
  Landmark,
  PoseDetectorConfig,
  DEFAULT_POSE_DETECTOR_CONFIG,
  TOTAL_LANDMARKS,
} from './pose-types'
import { getModelPath, getWasmPath } from './model-loader'

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
          `PoseDetector 初始化失败: ${error instanceof Error ? error.message : String(error)}`,
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
