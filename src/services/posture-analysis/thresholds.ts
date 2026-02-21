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
  forwardHeadFFR: 0.02,
  forwardHeadNTE: 0.009,
  slouch: 20,
  headTilt: 12,
  shoulderAsymmetry: 10,
}

export function getScaledThresholds(sensitivity: number): RuleThresholds {
  const clamped = Math.max(0, Math.min(1, sensitivity))
  const scale = 2 - 1.5 * clamped

  return {
    forwardHead: DEFAULT_THRESHOLDS.forwardHead * scale,
    forwardHeadFFR: DEFAULT_THRESHOLDS.forwardHeadFFR * scale,
    forwardHeadNTE: DEFAULT_THRESHOLDS.forwardHeadNTE * scale,
    slouch: DEFAULT_THRESHOLDS.slouch * scale,
    headTilt: DEFAULT_THRESHOLDS.headTilt * scale,
    shoulderAsymmetry: DEFAULT_THRESHOLDS.shoulderAsymmetry * scale,
  }
}
