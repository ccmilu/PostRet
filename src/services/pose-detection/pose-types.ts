export const PoseLandmarkIndex = {
  NOSE: 0,
  LEFT_EYE_INNER: 1,
  LEFT_EYE: 2,
  LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4,
  RIGHT_EYE: 5,
  RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_PINKY: 17,
  RIGHT_PINKY: 18,
  LEFT_INDEX: 19,
  RIGHT_INDEX: 20,
  LEFT_THUMB: 21,
  RIGHT_THUMB: 22,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const

export type PoseLandmarkIndexType = typeof PoseLandmarkIndex[keyof typeof PoseLandmarkIndex]

export const TOTAL_LANDMARKS = 33

export interface Landmark {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly visibility: number
}

export interface DetectionFrame {
  readonly landmarks: readonly Landmark[]
  readonly worldLandmarks: readonly Landmark[]
  readonly timestamp: number
  readonly frameWidth: number
  readonly frameHeight: number
}

export interface PoseDetectorConfig {
  readonly modelPath: string
  readonly numPoses: number
  readonly minPoseDetectionConfidence: number
  readonly minPosePresenceConfidence: number
  readonly minTrackingConfidence: number
}

export const DEFAULT_POSE_DETECTOR_CONFIG: PoseDetectorConfig = {
  modelPath: '',
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
}

export const POSTURE_LANDMARKS = {
  HEAD_FORWARD: [
    PoseLandmarkIndex.LEFT_EAR,
    PoseLandmarkIndex.RIGHT_EAR,
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
  ],
  SLOUCH: [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
  ],
  HEAD_TILT: [
    PoseLandmarkIndex.LEFT_EAR,
    PoseLandmarkIndex.RIGHT_EAR,
  ],
  TOO_CLOSE: [
    PoseLandmarkIndex.LEFT_EAR,
    PoseLandmarkIndex.RIGHT_EAR,
  ],
  SHOULDER_ASYMMETRY: [
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
  ],
} as const
