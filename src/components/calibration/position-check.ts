import type { Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'

export type PositionStatus =
  | 'no_face'
  | 'too_far'
  | 'too_close'
  | 'off_center'
  | 'good'

export interface PositionCheckResult {
  readonly status: PositionStatus
  readonly message: string
}

const FACE_RATIO_TOO_CLOSE = 0.35
const FACE_RATIO_TOO_FAR = 0.08
const CENTER_TOLERANCE = 0.25
const VISIBILITY_THRESHOLD = 0.5

/**
 * Check face position from normalized landmarks.
 * Returns status and user-facing message.
 */
export function checkFacePosition(
  landmarks: readonly Landmark[] | null,
  frameWidth: number,
): PositionCheckResult {
  if (!landmarks || landmarks.length === 0) {
    return { status: 'no_face', message: '未检测到人脸，请确保脸部在摄像头画面中' }
  }

  const leftEar = landmarks[PoseLandmarkIndex.LEFT_EAR]
  const rightEar = landmarks[PoseLandmarkIndex.RIGHT_EAR]
  const nose = landmarks[PoseLandmarkIndex.NOSE]

  if (
    !leftEar || !rightEar || !nose ||
    leftEar.visibility < VISIBILITY_THRESHOLD ||
    rightEar.visibility < VISIBILITY_THRESHOLD ||
    nose.visibility < VISIBILITY_THRESHOLD
  ) {
    return { status: 'no_face', message: '未检测到人脸，请确保脸部在摄像头画面中' }
  }

  // Face-to-frame ratio using normalized landmarks (ear distance in normalized coords)
  const faceRatio = Math.abs(leftEar.x - rightEar.x)

  if (faceRatio < FACE_RATIO_TOO_FAR) {
    return { status: 'too_far', message: '请靠近摄像头一些' }
  }

  if (faceRatio > FACE_RATIO_TOO_CLOSE) {
    return { status: 'too_close', message: '距离太近，请稍微后退一些' }
  }

  // Check if face is roughly centered (nose position)
  const noseX = nose.x
  const noseY = nose.y
  if (
    Math.abs(noseX - 0.5) > CENTER_TOLERANCE ||
    Math.abs(noseY - 0.5) > CENTER_TOLERANCE
  ) {
    return { status: 'off_center', message: '请将脸部移到画面中央' }
  }

  return { status: 'good', message: '位置合适！' }
}
