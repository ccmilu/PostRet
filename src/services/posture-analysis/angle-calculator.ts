import type { Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import { vectorAngle, toDegrees, midpoint } from '@/utils/math'
import type { PostureAngles } from './posture-types'

const VERTICAL_UP = { x: 0, y: -1, z: 0 } as const
const VERTICAL_DOWN = { x: 0, y: 1, z: 0 } as const

export function headForwardAngle(worldLandmarks: readonly Landmark[]): number {
  const leftEar = worldLandmarks[PoseLandmarkIndex.LEFT_EAR]
  const rightEar = worldLandmarks[PoseLandmarkIndex.RIGHT_EAR]
  const leftShoulder = worldLandmarks[PoseLandmarkIndex.LEFT_SHOULDER]
  const rightShoulder = worldLandmarks[PoseLandmarkIndex.RIGHT_SHOULDER]

  const earMid = midpoint(leftEar, rightEar)
  const shoulderMid = midpoint(leftShoulder, rightShoulder)

  const earToShoulder = {
    x: earMid.x - shoulderMid.x,
    y: earMid.y - shoulderMid.y,
    z: earMid.z - shoulderMid.z,
  }

  return toDegrees(vectorAngle(earToShoulder, VERTICAL_UP))
}

export function torsoAngle(worldLandmarks: readonly Landmark[]): number {
  const leftShoulder = worldLandmarks[PoseLandmarkIndex.LEFT_SHOULDER]
  const rightShoulder = worldLandmarks[PoseLandmarkIndex.RIGHT_SHOULDER]
  const leftHip = worldLandmarks[PoseLandmarkIndex.LEFT_HIP]
  const rightHip = worldLandmarks[PoseLandmarkIndex.RIGHT_HIP]

  const shoulderMid = midpoint(leftShoulder, rightShoulder)
  const hipMid = midpoint(leftHip, rightHip)

  const shoulderToHip = {
    x: hipMid.x - shoulderMid.x,
    y: hipMid.y - shoulderMid.y,
    z: hipMid.z - shoulderMid.z,
  }

  return toDegrees(vectorAngle(shoulderToHip, VERTICAL_DOWN))
}

export function headTiltAngle(normalizedLandmarks: readonly Landmark[]): number {
  const leftEar = normalizedLandmarks[PoseLandmarkIndex.LEFT_EAR]
  const rightEar = normalizedLandmarks[PoseLandmarkIndex.RIGHT_EAR]

  // In MediaPipe's non-mirrored output, the person's left ear appears on the
  // right side of the frame (higher x), so leftEar.x > rightEar.x.
  // Using dx = leftEar.x - rightEar.x gives positive dx for upright posture,
  // making atan2 return ~0 degrees when ears are level.
  // Positive result = left ear lower (tilting left), negative = tilting right.
  const dy = leftEar.y - rightEar.y
  const dx = leftEar.x - rightEar.x

  return toDegrees(Math.atan2(dy, dx))
}

export function faceToFrameRatio(
  normalizedLandmarks: readonly Landmark[],
): number {
  const leftEar = normalizedLandmarks[PoseLandmarkIndex.LEFT_EAR]
  const rightEar = normalizedLandmarks[PoseLandmarkIndex.RIGHT_EAR]

  // Normalized landmarks have x in [0, 1] relative to frame width,
  // so |leftEar.x - rightEar.x| directly gives face-to-frame ratio.
  return Math.abs(leftEar.x - rightEar.x)
}

export function faceY(normalizedLandmarks: readonly Landmark[]): number {
  return normalizedLandmarks[PoseLandmarkIndex.NOSE].y
}

export function shoulderAsymmetry(worldLandmarks: readonly Landmark[]): number {
  const leftShoulder = worldLandmarks[PoseLandmarkIndex.LEFT_SHOULDER]
  const rightShoulder = worldLandmarks[PoseLandmarkIndex.RIGHT_SHOULDER]

  const dx = Math.abs(rightShoulder.x - leftShoulder.x)
  const dy = Math.abs(leftShoulder.y - rightShoulder.y)
  return toDegrees(Math.atan2(dy, dx))
}

export function extractPostureAngles(
  worldLandmarks: readonly Landmark[],
  normalizedLandmarks: readonly Landmark[],
): PostureAngles {
  return {
    headForwardAngle: headForwardAngle(worldLandmarks),
    torsoAngle: torsoAngle(worldLandmarks),
    headTiltAngle: headTiltAngle(normalizedLandmarks),
    faceFrameRatio: faceToFrameRatio(normalizedLandmarks),
    faceY: faceY(normalizedLandmarks),
    shoulderDiff: shoulderAsymmetry(worldLandmarks),
  }
}
