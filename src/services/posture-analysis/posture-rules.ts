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

export function forwardHeadRule(deviation: number, threshold: number): RuleResult {
  if (deviation <= threshold) return null
  return {
    rule: 'FORWARD_HEAD',
    severity: computeSeverity(deviation, threshold),
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
    { enabled: toggles.forwardHead, evaluate: () => forwardHeadRule(deviations.headForward, thresholds.forwardHead) },
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
