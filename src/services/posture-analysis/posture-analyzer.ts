import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import type { PostureStatus } from '@/types/ipc'
import type { CalibrationData, RuleToggles } from '@/types/settings'
import type { AngleDeviations, PostureAngles } from './posture-types'
import { extractPostureAngles } from './angle-calculator'
import { getScaledThresholds, type CustomThresholdOverrides } from './thresholds'
import { evaluateAllRules } from './posture-rules'
import { EMAFilter, JitterFilter } from '@/utils/smoothing'
import type { ScreenAngleReference } from '@/services/calibration/screen-angle-estimator'
import {
  extractScreenAngleSignals,
  estimateAngleChange,
  estimateAngleChangeMulti,
  compensateAngles,
} from '@/services/calibration/screen-angle-estimator'
import type { ScreenAngleCalibrationPoint } from '@/types/settings'
import { AdaptiveBaseline } from '@/services/calibration/adaptive-baseline'

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

const EMA_ALPHA = 0.5

const JITTER_THRESHOLDS = {
  headForward: 1.0,
  torso: 1.0,
  headTilt: 1.0,
  faceFrameRatio: 0.02,
  faceY: 0.02,
  noseToEarAvg: 0.005,
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
  readonly faceYEma: EMAFilter
  readonly faceYJitter: JitterFilter
  readonly noseToEarAvgEma: EMAFilter
  readonly noseToEarAvgJitter: JitterFilter
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
    faceYEma: new EMAFilter(EMA_ALPHA),
    faceYJitter: new JitterFilter(JITTER_THRESHOLDS.faceY),
    noseToEarAvgEma: new EMAFilter(EMA_ALPHA),
    noseToEarAvgJitter: new JitterFilter(JITTER_THRESHOLDS.noseToEarAvg),
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
  filters.faceYEma.reset()
  filters.faceYJitter.reset()
  filters.noseToEarAvgEma.reset()
  filters.noseToEarAvgJitter.reset()
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

export interface AnalyzerOptions {
  readonly screenAngleReference?: ScreenAngleReference
  readonly screenAngleReferences?: readonly ScreenAngleCalibrationPoint[]
  readonly debugMode?: boolean
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
  private customThresholds: CustomThresholdOverrides | undefined
  private filters: SmoothingFilters
  private screenAngleReference: ScreenAngleReference | null
  private screenAngleReferences: readonly ScreenAngleCalibrationPoint[]
  private adaptiveBaseline: AdaptiveBaseline
  private lastTimestamp: number
  private debugMode: boolean

  constructor(
    calibration: CalibrationData,
    sensitivity: number,
    ruleToggles: RuleToggles,
    options?: AnalyzerOptions
  ) {
    this.calibration = calibration
    this.sensitivity = sensitivity
    this.ruleToggles = ruleToggles
    this.customThresholds = undefined
    this.filters = createFilters()
    this.screenAngleReference = options?.screenAngleReference ?? null
    this.screenAngleReferences = options?.screenAngleReferences
      ?? calibration.screenAngleReferences
      ?? []
    this.adaptiveBaseline = new AdaptiveBaseline(calibration)
    this.lastTimestamp = 0
    this.debugMode = options?.debugMode ?? false
  }

  analyzeDetailed(frame: DetectionFrame): AnalyzeResult {
    const confidence = computeConfidence(frame.worldLandmarks)

    // Step 1: Visibility filter
    if (hasLowVisibility(frame.worldLandmarks)) {
      const zeroAngles: PostureAngles = {
        headForwardAngle: 0,
        torsoAngle: 0,
        headTiltAngle: 0,
        faceFrameRatio: 0,
        faceY: 0,
        noseToEarAvg: 0,
        shoulderDiff: 0,
      }
      const zeroDeviations: AngleDeviations = {
        headForward: 0,
        torsoSlouch: 0,
        headTilt: 0,
        faceFrameRatio: 0,
        faceYDelta: 0,
        noseToEarAvg: 0,
        shoulderDiff: 0,
      }
      return {
        status: { isGood: true, violations: [], confidence, timestamp: frame.timestamp },
        angles: zeroAngles,
        deviations: zeroDeviations,
      }
    }

    // Step 2: Angle extraction
    const rawAngles = extractPostureAngles(frame.worldLandmarks, frame.landmarks)

    // Step 2.5: Screen angle compensation
    const compensatedAngles = this.applyScreenAngleCompensation(rawAngles, frame.landmarks)

    // Step 3: Time smoothing (EMA + jitter)
    const smoothedHeadForward = this.filters.headForwardJitter.update(
      this.filters.headForwardEma.update(compensatedAngles.headForwardAngle)
    )
    const smoothedTorso = this.filters.torsoJitter.update(
      this.filters.torsoEma.update(compensatedAngles.torsoAngle)
    )
    const smoothedHeadTilt = this.filters.headTiltJitter.update(
      this.filters.headTiltEma.update(compensatedAngles.headTiltAngle)
    )
    const smoothedFaceRatio = this.filters.faceRatioJitter.update(
      this.filters.faceRatioEma.update(compensatedAngles.faceFrameRatio)
    )
    const smoothedFaceY = this.filters.faceYJitter.update(
      this.filters.faceYEma.update(compensatedAngles.faceY)
    )
    const smoothedNoseToEarAvg = this.filters.noseToEarAvgJitter.update(
      this.filters.noseToEarAvgEma.update(compensatedAngles.noseToEarAvg)
    )
    const smoothedShoulderDiff = this.filters.shoulderJitter.update(
      this.filters.shoulderEma.update(compensatedAngles.shoulderDiff)
    )

    const smoothedAngles: PostureAngles = {
      headForwardAngle: smoothedHeadForward,
      torsoAngle: smoothedTorso,
      headTiltAngle: smoothedHeadTilt,
      faceFrameRatio: smoothedFaceRatio,
      faceY: smoothedFaceY,
      noseToEarAvg: smoothedNoseToEarAvg,
      shoulderDiff: smoothedShoulderDiff,
    }

    // Step 4: Adaptive baseline update + comparison
    const deltaTime = this.computeDeltaTime(frame.timestamp)
    const currentBaseline = this.adaptiveBaseline.getCurrentBaseline()

    const deviations: AngleDeviations = {
      headForward: smoothedHeadForward - currentBaseline.headForwardAngle,
      torsoSlouch: smoothedTorso - currentBaseline.torsoAngle,
      headTilt: smoothedHeadTilt - currentBaseline.headTiltAngle,
      faceFrameRatio: smoothedFaceRatio - currentBaseline.faceFrameRatio,
      faceYDelta: smoothedFaceY - currentBaseline.faceY,
      noseToEarAvg: smoothedNoseToEarAvg - (currentBaseline.noseToEarAvg ?? 0),
      shoulderDiff: Math.abs(smoothedShoulderDiff - currentBaseline.shoulderDiff),
    }

    // Step 5: Rule evaluation
    const scaledThresholds = getScaledThresholds(this.sensitivity, this.customThresholds)
    const violations = evaluateAllRules(deviations, scaledThresholds, this.ruleToggles)

    const isGood = violations.length === 0

    // Debug logging for diagnostics
    // Enable via: window.__POSTURE_DEBUG = true  (in DevTools console)
    const debugEnabled = this.debugMode
      || (typeof globalThis !== 'undefined'
        && (globalThis as Record<string, unknown>).__POSTURE_DEBUG === true)
    if (debugEnabled) {
      const nteDelta = deviations.noseToEarAvg
      const ffrDelta = deviations.faceFrameRatio
      const angleDelta = deviations.headForward
      const nteThresh = scaledThresholds.forwardHeadNTE
      const ffrThresh = scaledThresholds.forwardHeadFFR
      const angleThresh = scaledThresholds.forwardHead
      const nteScore = nteThresh > 0 ? Math.max(0, nteDelta) / nteThresh : 0
      const ffrScore = ffrThresh > 0 ? Math.max(0, ffrDelta) / ffrThresh : 0
      const angleScore = angleThresh > 0 ? Math.max(0, angleDelta) / angleThresh : 0
      const fhCombined = 0.6 * nteScore + 0.2 * ffrScore + 0.2 * angleScore

      console.log(
        `[PostureDebug] ` +
        `nte: ${smoothedNoseToEarAvg.toFixed(4)} base: ${(currentBaseline.noseToEarAvg ?? 0).toFixed(4)} d: ${nteDelta.toFixed(4)} | ` +
        `ffr: ${smoothedFaceRatio.toFixed(4)} base: ${currentBaseline.faceFrameRatio.toFixed(4)} d: ${ffrDelta.toFixed(4)} | ` +
        `FH: ${fhCombined.toFixed(2)} (nte=${nteScore.toFixed(2)} ffr=${ffrScore.toFixed(2)} angle=${angleScore.toFixed(2)}) | ` +
        `[${violations.map(v => v.rule).join(',')}]`
      )
    }

    // Step 5.5: Update adaptive baseline after evaluation
    this.adaptiveBaseline.update(isGood, smoothedAngles, deltaTime)

    // Step 6: Output
    const status: PostureStatus = {
      isGood,
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
    this.adaptiveBaseline = new AdaptiveBaseline(calibration)
  }

  updateScreenAngleReference(reference: ScreenAngleReference | null): void {
    this.screenAngleReference = reference
  }

  updateScreenAngleReferences(references: readonly ScreenAngleCalibrationPoint[]): void {
    this.screenAngleReferences = references
  }

  updateSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity
  }

  updateRuleToggles(ruleToggles: RuleToggles): void {
    this.ruleToggles = ruleToggles
  }

  updateCustomThresholds(overrides: CustomThresholdOverrides | undefined): void {
    this.customThresholds = overrides
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled
  }

  reset(): void {
    resetFilters(this.filters)
    this.adaptiveBaseline.reset()
    this.lastTimestamp = 0
  }

  private applyScreenAngleCompensation(
    angles: PostureAngles,
    landmarks: readonly Landmark[]
  ): PostureAngles {
    const currentSignals = extractScreenAngleSignals(landmarks)

    // Prefer multi-reference interpolation if available
    if (this.screenAngleReferences.length > 0) {
      const pitchDelta = estimateAngleChangeMulti(currentSignals, this.screenAngleReferences)
      return compensateAngles(angles, pitchDelta)
    }

    // Fall back to single reference
    if (this.screenAngleReference === null) {
      return angles
    }

    const pitchDelta = estimateAngleChange(currentSignals, this.screenAngleReference)
    return compensateAngles(angles, pitchDelta)
  }

  private computeDeltaTime(timestamp: number): number {
    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp
      return 0
    }

    const delta = (timestamp - this.lastTimestamp) / 1000
    this.lastTimestamp = timestamp
    return Math.max(0, delta)
  }
}
