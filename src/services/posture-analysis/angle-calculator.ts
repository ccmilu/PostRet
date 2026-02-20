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

export function headTiltAngle(worldLandmarks: readonly Landmark[]): number {
  const leftEar = worldLandmarks[PoseLandmarkIndex.LEFT_EAR]
  const rightEar = worldLandmarks[PoseLandmarkIndex.RIGHT_EAR]

  // Use right-to-left direction so dx is positive when ears are in natural position
  // (leftEar.x < rightEar.x in MediaPipe mirrored coords is not guaranteed,
  // but rightEar.x - leftEar.x gives positive dx for standard facing-camera pose)
  const dy = leftEar.y - rightEar.y
  const dx = rightEar.x - leftEar.x

  return toDegrees(Math.atan2(dy, dx))
}

export function faceToFrameRatio(
  worldLandmarks: readonly Landmark[],
  frameWidth: number
): number {
  if (frameWidth === 0) {
    return 0
  }

  const leftEar = worldLandmarks[PoseLandmarkIndex.LEFT_EAR]
  const rightEar = worldLandmarks[PoseLandmarkIndex.RIGHT_EAR]

  return Math.abs(leftEar.x - rightEar.x) / frameWidth
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
  frameWidth: number
): PostureAngles {
  return {
    headForwardAngle: headForwardAngle(worldLandmarks),
    torsoAngle: torsoAngle(worldLandmarks),
    headTiltAngle: headTiltAngle(worldLandmarks),
    faceFrameRatio: faceToFrameRatio(worldLandmarks, frameWidth),
    shoulderDiff: shoulderAsymmetry(worldLandmarks),
  }
}
