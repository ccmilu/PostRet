export interface RuleThresholds {
  readonly forwardHead: number
  readonly slouch: number
  readonly headTilt: number
  readonly tooClose: number
  readonly shoulderAsymmetry: number
}

export const DEFAULT_THRESHOLDS: RuleThresholds = {
  forwardHead: 15,
  slouch: 20,
  headTilt: 12,
  tooClose: 0.35,
  shoulderAsymmetry: 10,
}

export function getScaledThresholds(sensitivity: number): RuleThresholds {
  const clamped = Math.max(0, Math.min(1, sensitivity))
  const scale = 2 - 1.5 * clamped

  return {
    forwardHead: DEFAULT_THRESHOLDS.forwardHead * scale,
    slouch: DEFAULT_THRESHOLDS.slouch * scale,
    headTilt: DEFAULT_THRESHOLDS.headTilt * scale,
    tooClose: DEFAULT_THRESHOLDS.tooClose * scale,
    shoulderAsymmetry: DEFAULT_THRESHOLDS.shoulderAsymmetry * scale,
  }
}
