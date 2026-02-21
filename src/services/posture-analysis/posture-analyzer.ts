import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import type { PostureStatus } from '@/types/ipc'
import type { CalibrationData, RuleToggles } from '@/types/settings'
import type { AngleDeviations, PostureAngles } from './posture-types'
import { extractPostureAngles } from './angle-calculator'
import { getScaledThresholds } from './thresholds'
import { evaluateAllRules } from './posture-rules'
import { EMAFilter, JitterFilter } from '@/utils/smoothing'

// Landmarks essential for the primary posture checks (head-forward, head-tilt,
// too-close, shoulder-asymmetry).  LEFT_HIP / RIGHT_HIP are intentionally
// excluded because the slouch rule is disabled by default and hips are rarely
// visible in a typical desk-webcam setup — including them caused
// hasLowVisibility to discard almost every frame, producing all-zero readings.
const CRITICAL_LANDMARKS = [
  PoseLandmarkIndex.LEFT_EAR,
  PoseLandmarkIndex.RIGHT_EAR,
  PoseLandmarkIndex.LEFT_SHOULDER,
  PoseLandmarkIndex.RIGHT_SHOULDER,
] as const

const EMA_ALPHA = 0.3

const JITTER_THRESHOLDS = {
  headForward: 1.0,
  torso: 1.0,
  headTilt: 1.0,
  faceFrameRatio: 0.02,
  shoulderDiff: 1.0,
} as const

interface SmoothingFilters {
  readonly headForwardEma: EMAFilter
  readonly headForwardJitter: JitterFilter
  readonly torsoEma: EMAFilter
  readonly torsoJitter: JitterFilter
  readonly headTiltEma: EMAFilter
  readonly headTiltJitter: JitterFilter
  readonly faceRatioEma: EMAFilter
  readonly faceRatioJitter: JitterFilter
  readonly shoulderEma: EMAFilter
  readonly shoulderJitter: JitterFilter
}

function createFilters(): SmoothingFilters {
  return {
    headForwardEma: new EMAFilter(EMA_ALPHA),
    headForwardJitter: new JitterFilter(JITTER_THRESHOLDS.headForward),
    torsoEma: new EMAFilter(EMA_ALPHA),
    torsoJitter: new JitterFilter(JITTER_THRESHOLDS.torso),
    headTiltEma: new EMAFilter(EMA_ALPHA),
    headTiltJitter: new JitterFilter(JITTER_THRESHOLDS.headTilt),
    faceRatioEma: new EMAFilter(EMA_ALPHA),
    faceRatioJitter: new JitterFilter(JITTER_THRESHOLDS.faceFrameRatio),
    shoulderEma: new EMAFilter(EMA_ALPHA),
    shoulderJitter: new JitterFilter(JITTER_THRESHOLDS.shoulderDiff),
  }
}

function resetFilters(filters: SmoothingFilters): void {
  filters.headForwardEma.reset()
  filters.headForwardJitter.reset()
  filters.torsoEma.reset()
  filters.torsoJitter.reset()
  filters.headTiltEma.reset()
  filters.headTiltJitter.reset()
  filters.faceRatioEma.reset()
  filters.faceRatioJitter.reset()
  filters.shoulderEma.reset()
  filters.shoulderJitter.reset()
}

function computeConfidence(worldLandmarks: readonly Landmark[]): number {
  let sum = 0
  for (const idx of CRITICAL_LANDMARKS) {
    sum += worldLandmarks[idx].visibility
  }
  return sum / CRITICAL_LANDMARKS.length
}

function hasLowVisibility(worldLandmarks: readonly Landmark[]): boolean {
  let lowCount = 0
  for (const idx of CRITICAL_LANDMARKS) {
    if (worldLandmarks[idx].visibility < 0.5) {
      lowCount++
    }
  }
  // Discard frame only when more than half of critical landmarks are invisible
  return lowCount > CRITICAL_LANDMARKS.length / 2
}

export interface AnalyzeResult {
  readonly status: PostureStatus
  readonly angles: PostureAngles
  readonly deviations: AngleDeviations
}

export class PostureAnalyzer {
  private calibration: CalibrationData
  private sensitivity: number
  private ruleToggles: RuleToggles
  private filters: SmoothingFilters

  constructor(
    calibration: CalibrationData,
    sensitivity: number,
    ruleToggles: RuleToggles
  ) {
    this.calibration = calibration
    this.sensitivity = sensitivity
    this.ruleToggles = ruleToggles
    this.filters = createFilters()
  }

  /**
   * Analyze a detection frame and return posture status, smoothed angles,
   * and deviations from baseline. The legacy `analyze` method is kept for
   * backward compatibility; prefer `analyzeDetailed` for richer output.
   */
  analyzeDetailed(frame: DetectionFrame): AnalyzeResult {
    const confidence = computeConfidence(frame.worldLandmarks)

    // Step 1: Visibility filter
    if (hasLowVisibility(frame.worldLandmarks)) {
      const zeroAngles: PostureAngles = {
        headForwardAngle: 0,
        torsoAngle: 0,
        headTiltAngle: 0,
        faceFrameRatio: 0,
        shoulderDiff: 0,
      }
      const zeroDeviations: AngleDeviations = {
        headForward: 0,
        torsoSlouch: 0,
        headTilt: 0,
        faceFrameRatio: 0,
        shoulderDiff: 0,
      }
      return {
        status: { isGood: true, violations: [], confidence, timestamp: frame.timestamp },
        angles: zeroAngles,
        deviations: zeroDeviations,
      }
    }

    // Step 2: Angle extraction
    const rawAngles = extractPostureAngles(frame.worldLandmarks, frame.frameWidth)

    // Step 3: Time smoothing (EMA + jitter)
    const smoothedHeadForward = this.filters.headForwardJitter.update(
      this.filters.headForwardEma.update(rawAngles.headForwardAngle)
    )
    const smoothedTorso = this.filters.torsoJitter.update(
      this.filters.torsoEma.update(rawAngles.torsoAngle)
    )
    const smoothedHeadTilt = this.filters.headTiltJitter.update(
      this.filters.headTiltEma.update(rawAngles.headTiltAngle)
    )
    const smoothedFaceRatio = this.filters.faceRatioJitter.update(
      this.filters.faceRatioEma.update(rawAngles.faceFrameRatio)
    )
    const smoothedShoulderDiff = this.filters.shoulderJitter.update(
      this.filters.shoulderEma.update(rawAngles.shoulderDiff)
    )

    const smoothedAngles: PostureAngles = {
      headForwardAngle: smoothedHeadForward,
      torsoAngle: smoothedTorso,
      headTiltAngle: smoothedHeadTilt,
      faceFrameRatio: smoothedFaceRatio,
      shoulderDiff: smoothedShoulderDiff,
    }

    // Step 4: Baseline comparison
    const deviations: AngleDeviations = {
      headForward: smoothedHeadForward - this.calibration.headForwardAngle,
      torsoSlouch: smoothedTorso - this.calibration.torsoAngle,
      headTilt: smoothedHeadTilt - this.calibration.headTiltAngle,
      faceFrameRatio: smoothedFaceRatio,
      shoulderDiff: Math.abs(smoothedShoulderDiff - this.calibration.shoulderDiff),
    }

    // Step 5: Rule evaluation
    const scaledThresholds = getScaledThresholds(this.sensitivity)
    const violations = evaluateAllRules(deviations, scaledThresholds, this.ruleToggles)

    // Step 6: Output
    const status: PostureStatus = {
      isGood: violations.length === 0,
      violations,
      confidence,
      timestamp: frame.timestamp,
    }

    return { status, angles: smoothedAngles, deviations }
  }

  analyze(frame: DetectionFrame): PostureStatus {
    return this.analyzeDetailed(frame).status
  }

  updateCalibration(calibration: CalibrationData): void {
    this.calibration = calibration
  }

  updateSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity
  }

  updateRuleToggles(ruleToggles: RuleToggles): void {
    this.ruleToggles = ruleToggles
  }

  reset(): void {
    resetFilters(this.filters)
  }
}
