import type { CalibrationData } from '@/types/settings'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'

const ANGLE_KEYS: ReadonlyArray<keyof PostureAngles> = [
  'headForwardAngle',
  'torsoAngle',
  'headTiltAngle',
  'faceFrameRatio',
  'faceY',
  'shoulderDiff',
] as const

const MAX_DRIFT_BY_KEY: Record<keyof PostureAngles, number> = {
  headForwardAngle: 8,
  torsoAngle: 8,
  headTiltAngle: 8,
  faceFrameRatio: 0.1,
  faceY: 0.1,
  shoulderDiff: 8,
}

export class AdaptiveBaseline {
  private readonly originalBaseline: CalibrationData
  private currentBaseline: CalibrationData
  private goodPostureDuration: number

  private static readonly DRIFT_THRESHOLD = 30
  private static readonly LEARNING_RATE = 0.001

  constructor(originalBaseline: CalibrationData) {
    this.originalBaseline = { ...originalBaseline }
    this.currentBaseline = { ...originalBaseline }
    this.goodPostureDuration = 0
  }

  update(
    isGoodPosture: boolean,
    currentAngles: PostureAngles,
    deltaTime: number,
  ): CalibrationData {
    if (!isGoodPosture) {
      this.goodPostureDuration = 0
      return { ...this.currentBaseline }
    }

    const previousDuration = this.goodPostureDuration
    this.goodPostureDuration += deltaTime

    if (this.goodPostureDuration <= AdaptiveBaseline.DRIFT_THRESHOLD) {
      return { ...this.currentBaseline }
    }

    const effectiveDriftTime =
      previousDuration >= AdaptiveBaseline.DRIFT_THRESHOLD
        ? deltaTime
        : this.goodPostureDuration - AdaptiveBaseline.DRIFT_THRESHOLD

    this.currentBaseline = this.applyDrift(currentAngles, effectiveDriftTime)
    return { ...this.currentBaseline }
  }

  reset(): void {
    this.currentBaseline = { ...this.originalBaseline }
    this.goodPostureDuration = 0
  }

  getCurrentBaseline(): CalibrationData {
    return { ...this.currentBaseline }
  }

  getGoodPostureDuration(): number {
    return this.goodPostureDuration
  }

  private applyDrift(
    currentAngles: PostureAngles,
    deltaTime: number,
  ): CalibrationData {
    const updated = { ...this.currentBaseline }

    for (const key of ANGLE_KEYS) {
      const currentValue = this.currentBaseline[key]
      const targetValue = currentAngles[key]
      const originalValue = this.originalBaseline[key]
      const maxDrift = MAX_DRIFT_BY_KEY[key]

      const drifted =
        currentValue +
        (targetValue - currentValue) * AdaptiveBaseline.LEARNING_RATE * deltaTime

      const clampedDrift = clamp(
        drifted - originalValue,
        -maxDrift,
        maxDrift,
      )

      ;(updated as unknown as Record<string, number>)[key] = originalValue + clampedDrift
    }

    return updated
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
