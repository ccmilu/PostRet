import type { PostureRule } from '@/types/ipc'

export interface PostureAngles {
  readonly headForwardAngle: number
  readonly torsoAngle: number
  readonly headTiltAngle: number
  readonly faceFrameRatio: number
  readonly faceY: number
  readonly noseToEarAvg: number
  readonly shoulderDiff: number
}

export interface AngleDeviations {
  readonly headForward: number
  readonly torsoSlouch: number
  readonly headTilt: number
  readonly faceFrameRatio: number
  readonly faceYDelta: number
  readonly noseToEarAvg: number
  readonly shoulderDiff: number
}

export type RuleResult = {
  readonly rule: PostureRule
  readonly severity: number
  readonly message: string
} | null
