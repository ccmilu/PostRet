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

// Weights for multi-signal forward head scoring.
// Front-facing cameras compress z-axis depth, making ear-shoulder angle alone
// unreliable. faceFrameRatio change (head moving closer to camera) is the
// primary signal; ear-shoulder angle serves as auxiliary confirmation.
const FH_WEIGHT_FFR = 0.6
const FH_WEIGHT_ANGLE = 0.4

export interface ForwardHeadSignals {
  readonly ffrDelta: number
  readonly angleDelta: number
}

/**
 * Multi-signal forward head rule.
 * Combined score = w_ffr * (ffrDelta / ffrThreshold) + w_angle * (angleDelta / angleThreshold)
 * Triggers when combined score > 1.0.
 */
export function forwardHeadRule(
  signals: ForwardHeadSignals,
  angleThreshold: number,
  ffrThreshold: number,
): RuleResult {
  const ffrScore = ffrThreshold > 0 ? Math.max(0, signals.ffrDelta) / ffrThreshold : 0
  const angleScore = angleThreshold > 0 ? Math.max(0, signals.angleDelta) / angleThreshold : 0
  const combinedScore = FH_WEIGHT_FFR * ffrScore + FH_WEIGHT_ANGLE * angleScore

  if (combinedScore <= 1.0) return null

  // Severity: 0 at the trigger point, 1 when score reaches 2.0
  const severity = Math.min(1, Math.max(0, combinedScore - 1.0))
  return {
    rule: 'FORWARD_HEAD',
    severity,
    message: 'Head is leaning forward',
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

export function tooCloseRule(deviation: number, threshold: number): RuleResult {
  if (deviation <= threshold) return null
  return {
    rule: 'TOO_CLOSE',
    severity: computeSeverity(deviation, threshold),
    message: 'Too close to screen',
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

  const ruleChecks: Array<{
    enabled: boolean
    evaluate: () => RuleResult
  }> = [
    { enabled: toggles.forwardHead, evaluate: () => forwardHeadRule(
      { ffrDelta: deviations.faceFrameRatio, angleDelta: deviations.headForward },
      thresholds.forwardHead, thresholds.forwardHeadFFR,
    ) },
    { enabled: toggles.slouch, evaluate: () => slouchRule(deviations.torsoSlouch, thresholds.slouch) },
    { enabled: toggles.headTilt, evaluate: () => headTiltRule(deviations.headTilt, thresholds.headTilt) },
    { enabled: toggles.tooClose, evaluate: () => tooCloseRule(deviations.faceFrameRatio, thresholds.tooClose) },
    { enabled: toggles.shoulderAsymmetry, evaluate: () => shoulderAsymmetryRule(deviations.shoulderDiff, thresholds.shoulderAsymmetry) },
  ]

  for (const check of ruleChecks) {
    if (!check.enabled) continue
    const result = check.evaluate()
    if (result !== null) {
      results.push(result)
    }
  }

  return results
}
