import type { Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'

export interface ScreenAngleSignals {
  readonly faceY: number
  readonly noseChinRatio: number
  readonly eyeMouthRatio: number
}

export interface ScreenAngleReference {
  readonly faceY: number
  readonly noseChinRatio: number
  readonly eyeMouthRatio: number
}

const FACE_Y_SCALE = 45
const NOSE_CHIN_SCALE = 30
const EYE_MOUTH_SCALE = 20

const HEAD_FORWARD_COMPENSATION = 0.8

export function extractScreenAngleSignals(
  landmarks: readonly Landmark[]
): ScreenAngleSignals {
  const nose = landmarks[PoseLandmarkIndex.NOSE]
  const leftEye = landmarks[PoseLandmarkIndex.LEFT_EYE]
  const rightEye = landmarks[PoseLandmarkIndex.RIGHT_EYE]
  const leftEar = landmarks[PoseLandmarkIndex.LEFT_EAR]
  const rightEar = landmarks[PoseLandmarkIndex.RIGHT_EAR]
  const mouthLeft = landmarks[PoseLandmarkIndex.MOUTH_LEFT]
  const mouthRight = landmarks[PoseLandmarkIndex.MOUTH_RIGHT]

  const earSpan = Math.abs(leftEar.x - rightEar.x)

  const mouthMidY = (mouthLeft.y + mouthRight.y) / 2
  const eyeMidY = (leftEye.y + rightEye.y) / 2

  const noseChinDist = mouthMidY - nose.y
  const eyeMouthDist = mouthMidY - eyeMidY

  const safeEarSpan = earSpan === 0 ? 1 : earSpan

  return {
    faceY: nose.y,
    noseChinRatio: noseChinDist / safeEarSpan,
    eyeMouthRatio: eyeMouthDist / safeEarSpan,
  }
}

export function calibrateScreenAngle(
  signals: ScreenAngleSignals
): ScreenAngleReference {
  return {
    faceY: signals.faceY,
    noseChinRatio: signals.noseChinRatio,
    eyeMouthRatio: signals.eyeMouthRatio,
  }
}

export function estimateAngleChange(
  current: ScreenAngleSignals,
  reference: ScreenAngleReference
): number {
  const faceYDelta = current.faceY - reference.faceY
  const noseChinDelta = current.noseChinRatio - reference.noseChinRatio
  const eyeMouthDelta = current.eyeMouthRatio - reference.eyeMouthRatio

  return (
    faceYDelta * FACE_Y_SCALE +
    noseChinDelta * NOSE_CHIN_SCALE +
    eyeMouthDelta * EYE_MOUTH_SCALE
  )
}

export function compensateAngles(
  angles: PostureAngles,
  pitchDelta: number
): PostureAngles {
  return {
    ...angles,
    headForwardAngle: angles.headForwardAngle - pitchDelta * HEAD_FORWARD_COMPENSATION,
  }
}
