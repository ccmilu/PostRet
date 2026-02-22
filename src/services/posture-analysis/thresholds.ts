export interface RuleThresholds {
  readonly forwardHead: number
  readonly forwardHeadFFR: number
  readonly forwardHeadNTE: number
  readonly slouch: number
  readonly headTilt: number
  readonly shoulderAsymmetry: number
}

export const DEFAULT_THRESHOLDS: RuleThresholds = {
  forwardHead: 8,
  forwardHeadFFR: 0.006,
  forwardHeadNTE: 0.003,
  slouch: 20,
  headTilt: 12,
  shoulderAsymmetry: 10,
}

export interface CustomThresholdOverrides {
  readonly forwardHead?: number
  readonly headTilt?: number
  readonly tooClose?: number
  readonly shoulderAsymmetry?: number
}

export function getScaledThresholds(
  sensitivity: number,
  customOverrides?: CustomThresholdOverrides,
): RuleThresholds {
  const clamped = Math.max(0, Math.min(1, sensitivity))
  const scale = 2 - 1.5 * clamped

  const scaled: RuleThresholds = {
    forwardHead: DEFAULT_THRESHOLDS.forwardHead * scale,
    forwardHeadFFR: DEFAULT_THRESHOLDS.forwardHeadFFR * scale,
    forwardHeadNTE: DEFAULT_THRESHOLDS.forwardHeadNTE * scale,
    slouch: DEFAULT_THRESHOLDS.slouch * scale,
    headTilt: DEFAULT_THRESHOLDS.headTilt * scale,
    shoulderAsymmetry: DEFAULT_THRESHOLDS.shoulderAsymmetry * scale,
  }

  if (!customOverrides) return scaled

  // Custom overrides replace the scaled value for that specific rule.
  // forwardHead override also proportionally adjusts FFR and NTE sub-thresholds.
  const fhOverride = customOverrides.forwardHead ?? customOverrides.tooClose
  return {
    forwardHead: fhOverride ?? scaled.forwardHead,
    forwardHeadFFR: fhOverride !== undefined
      ? DEFAULT_THRESHOLDS.forwardHeadFFR * (fhOverride / DEFAULT_THRESHOLDS.forwardHead)
      : scaled.forwardHeadFFR,
    forwardHeadNTE: fhOverride !== undefined
      ? DEFAULT_THRESHOLDS.forwardHeadNTE * (fhOverride / DEFAULT_THRESHOLDS.forwardHead)
      : scaled.forwardHeadNTE,
    slouch: scaled.slouch,
    headTilt: customOverrides.headTilt ?? scaled.headTilt,
    shoulderAsymmetry: customOverrides.shoulderAsymmetry ?? scaled.shoulderAsymmetry,
  }
}
