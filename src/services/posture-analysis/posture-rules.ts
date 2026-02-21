import type { PostureViolation } from '@/types/ipc'
import type { RuleToggles } from '@/types/settings'
import type { AngleDeviations, RuleResult } from './posture-types'
import type { RuleThresholds } from './thresholds'

/**
 * Compute severity as a linear value clamped to [0, 1].
 * At the threshold boundary severity starts at 0 and reaches 1
 * when deviation is double the threshold.
 */
function computeSeverity(deviation: number, threshold: number): number {
  if (threshold === 0) return 1
  const excess = deviation - threshold
  return Math.min(1, Math.max(0, excess / threshold))
}

// Weights for three-signal forward head / too-close scoring.
// noseToEarAvg has the best category separation (5.99σ); faceFrameRatio and
// ear-shoulder angle serve as auxiliary signals.
const FH_WEIGHT_NTE = 0.6
const FH_WEIGHT_FFR = 0.2
const FH_WEIGHT_ANGLE = 0.2

export interface ForwardHeadSignals {
  readonly nteDelta: number
  readonly ffrDelta: number
  readonly angleDelta: number
}

/**
 * Three-signal forward head / too-close rule.
 * Combined score = w_nte * (nteDelta / nteThreshold)
 *                + w_ffr * (ffrDelta / ffrThreshold)
 *                + w_angle * (angleDelta / angleThreshold)
 * Triggers when combined score > 1.0.
 *
 * In front-facing camera setups, "leaning forward" and "too close" are
 * equivalent (both mean face moving closer to camera). This rule covers both.
 */
export function forwardHeadRule(
  signals: ForwardHeadSignals,
  angleThreshold: number,
  ffrThreshold: number,
  nteThreshold: number,
): RuleResult {
  const nteScore = nteThreshold > 0 ? Math.max(0, signals.nteDelta) / nteThreshold : 0
  const ffrScore = ffrThreshold > 0 ? Math.max(0, signals.ffrDelta) / ffrThreshold : 0
  const angleScore = angleThreshold > 0 ? Math.max(0, signals.angleDelta) / angleThreshold : 0
  const combinedScore = FH_WEIGHT_NTE * nteScore + FH_WEIGHT_FFR * ffrScore + FH_WEIGHT_ANGLE * angleScore

  if (combinedScore <= 1.0) return null

  // Severity: 0 at the trigger point, 1 when score reaches 2.0
  const severity = Math.min(1, Math.max(0, combinedScore - 1.0))
  return {
    rule: 'FORWARD_HEAD',
    severity,
    message: 'Head is leaning forward / too close',
  }
}

export function slouchRule(deviation: number, threshold: number): RuleResult {
  if (deviation <= threshold) return null
  return {
    rule: 'SLOUCH',
    severity: computeSeverity(deviation, threshold),
    message: 'Slouching detected',
  }
}

export function headTiltRule(deviation: number, threshold: number): RuleResult {
  const abs = Math.abs(deviation)
  if (abs <= threshold) return null
  return {
    rule: 'HEAD_TILT',
    severity: computeSeverity(abs, threshold),
    message: 'Head is tilted',
  }
}

export function shoulderAsymmetryRule(deviation: number, threshold: number): RuleResult {
  const abs = Math.abs(deviation)
  if (abs <= threshold) return null
  return {
    rule: 'SHOULDER_ASYMMETRY',
    severity: computeSeverity(abs, threshold),
    message: 'Shoulders are uneven',
  }
}

export function evaluateAllRules(
  deviations: AngleDeviations,
  thresholds: RuleThresholds,
  toggles: RuleToggles,
): readonly PostureViolation[] {
  const results: PostureViolation[] = []

  // forwardHead now covers both "leaning forward" and "too close" scenarios.
  // The tooClose toggle is treated as an alias for forwardHead.
  if (toggles.forwardHead || toggles.tooClose) {
    const fhResult = forwardHeadRule(
      {
        nteDelta: deviations.noseToEarAvg,
        ffrDelta: deviations.faceFrameRatio,
        angleDelta: deviations.headForward,
      },
      thresholds.forwardHead,
      thresholds.forwardHeadFFR,
      thresholds.forwardHeadNTE,
    )
    if (fhResult !== null) results.push(fhResult)
  }

  if (toggles.slouch) {
    const r = slouchRule(deviations.torsoSlouch, thresholds.slouch)
    if (r !== null) results.push(r)
  }

  if (toggles.headTilt) {
    const r = headTiltRule(deviations.headTilt, thresholds.headTilt)
    if (r !== null) results.push(r)
  }

  if (toggles.shoulderAsymmetry) {
    const r = shoulderAsymmetryRule(deviations.shoulderDiff, thresholds.shoulderAsymmetry)
    if (r !== null) results.push(r)
  }

  return results
}
