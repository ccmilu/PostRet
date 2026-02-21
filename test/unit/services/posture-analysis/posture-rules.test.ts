import { describe, it, expect } from 'vitest'
import {
  forwardHeadRule,
  slouchRule,
  headTiltRule,
  shoulderAsymmetryRule,
  evaluateAllRules,
} from '../../../../src/services/posture-analysis/posture-rules'
import type { ForwardHeadSignals } from '../../../../src/services/posture-analysis/posture-rules'
import type { AngleDeviations } from '../../../../src/services/posture-analysis/posture-types'
import type { RuleThresholds } from '../../../../src/services/posture-analysis/thresholds'
import type { RuleToggles } from '../../../../src/types/settings'

const DEFAULT_THRESHOLDS: RuleThresholds = {
  forwardHead: 10,
  forwardHeadFFR: 0.05,
  forwardHeadNTE: 0.02,
  slouch: 20,
  headTilt: 12,
  shoulderAsymmetry: 10,
}

const ALL_ENABLED: RuleToggles = {
  forwardHead: true,
  slouch: true,
  headTilt: true,
  tooClose: true,
  shoulderAsymmetry: true,
}

const ALL_DISABLED: RuleToggles = {
  forwardHead: false,
  slouch: false,
  headTilt: false,
  tooClose: false,
  shoulderAsymmetry: false,
}

function makeDeviations(overrides: Partial<AngleDeviations> = {}): AngleDeviations {
  return {
    headForward: 0,
    torsoSlouch: 0,
    headTilt: 0,
    faceFrameRatio: 0,
    faceYDelta: 0,
    noseToEarAvg: 0,
    shoulderDiff: 0,
    ...overrides,
  }
}

// ─── forwardHeadRule (multi-signal) ───

describe('forwardHeadRule', () => {
  const angleThresh = 10
  const ffrThresh = 0.05
  const nteThresh = 0.02

  function makeSignals(overrides: Partial<ForwardHeadSignals> = {}): ForwardHeadSignals {
    return { nteDelta: 0, ffrDelta: 0, angleDelta: 0, ...overrides }
  }

  it('should return null when all signals are below threshold', () => {
    expect(forwardHeadRule(makeSignals({ nteDelta: 0.005, ffrDelta: 0.02, angleDelta: 5 }), angleThresh, ffrThresh, nteThresh)).toBeNull()
  })

  it('should return null when all signals are zero', () => {
    expect(forwardHeadRule(makeSignals(), angleThresh, ffrThresh, nteThresh)).toBeNull()
  })

  it('should return null when signals are negative', () => {
    expect(forwardHeadRule(makeSignals({ nteDelta: -0.01, ffrDelta: -0.03, angleDelta: -5 }), angleThresh, ffrThresh, nteThresh)).toBeNull()
  })

  it('should return violation when NTE alone exceeds threshold (w=0.6)', () => {
    // nteScore = 0.04/0.02 = 2.0, combined = 0.6*2.0 = 1.2 > 1.0
    const result = forwardHeadRule(makeSignals({ nteDelta: 0.04 }), angleThresh, ffrThresh, nteThresh)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('FORWARD_HEAD')
  })

  it('should return violation when angle alone exceeds threshold (w=0.2)', () => {
    // angleScore = 60/10 = 6.0, combined = 0.2*6.0 = 1.2 > 1.0
    const result = forwardHeadRule(makeSignals({ angleDelta: 60 }), angleThresh, ffrThresh, nteThresh)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('FORWARD_HEAD')
  })

  it('should return violation when combined signals exceed threshold', () => {
    // nteScore = 0.03/0.02 = 1.5, ffrScore = 0.06/0.05 = 1.2, angleScore = 8/10 = 0.8
    // combined = 0.6*1.5 + 0.2*1.2 + 0.2*0.8 = 0.9 + 0.24 + 0.16 = 1.3 > 1.0
    const result = forwardHeadRule(makeSignals({ nteDelta: 0.03, ffrDelta: 0.06, angleDelta: 8 }), angleThresh, ffrThresh, nteThresh)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('FORWARD_HEAD')
  })

  it('should return null when combined score is exactly 1.0 (boundary)', () => {
    // nteScore = 0.02/0.02 = 1.0, ffrScore = 0.05/0.05 = 1.0, angleScore = 10/10 = 1.0
    // combined = 0.6*1.0 + 0.2*1.0 + 0.2*1.0 = 1.0, not > 1.0
    expect(forwardHeadRule(makeSignals({ nteDelta: 0.02, ffrDelta: 0.05, angleDelta: 10 }), angleThresh, ffrThresh, nteThresh)).toBeNull()
  })

  it('should have severity between 0 and 1', () => {
    // nteScore = 0.04/0.02 = 2.0, combined = 0.6*2.0 + 0.2*(0.08/0.05) + 0.2*(12/10) = 1.2+0.32+0.24 = 1.76
    const result = forwardHeadRule(makeSignals({ nteDelta: 0.04, ffrDelta: 0.08, angleDelta: 12 }), angleThresh, ffrThresh, nteThresh)
    expect(result).not.toBeNull()
    expect(result!.severity).toBeGreaterThanOrEqual(0)
    expect(result!.severity).toBeLessThanOrEqual(1)
  })

  it('should have severity that increases with larger signals', () => {
    const mild = forwardHeadRule(makeSignals({ nteDelta: 0.04, ffrDelta: 0.02, angleDelta: 5 }), angleThresh, ffrThresh, nteThresh)
    const severe = forwardHeadRule(makeSignals({ nteDelta: 0.08, ffrDelta: 0.15, angleDelta: 20 }), angleThresh, ffrThresh, nteThresh)
    expect(mild).not.toBeNull()
    expect(severe).not.toBeNull()
    expect(severe!.severity).toBeGreaterThan(mild!.severity)
  })

  it('should cap severity at 1 for extreme signals', () => {
    const result = forwardHeadRule(makeSignals({ nteDelta: 1.0, ffrDelta: 1.0, angleDelta: 100 }), angleThresh, ffrThresh, nteThresh)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe(1)
  })

  it('should include a non-empty message', () => {
    const result = forwardHeadRule(makeSignals({ nteDelta: 0.04 }), angleThresh, ffrThresh, nteThresh)
    expect(result).not.toBeNull()
    expect(result!.message).toBeTruthy()
    expect(result!.message.length).toBeGreaterThan(0)
  })

  it('should clamp negative signals to zero', () => {
    // Only positive deviations (getting closer / leaning forward) should contribute
    const result = forwardHeadRule(makeSignals({ nteDelta: -0.05, ffrDelta: -0.10, angleDelta: -20 }), angleThresh, ffrThresh, nteThresh)
    expect(result).toBeNull()
  })
})

// ─── slouchRule ───

describe('slouchRule', () => {
  it('should return null when deviation is below threshold', () => {
    expect(slouchRule(10, 20)).toBeNull()
  })

  it('should return null when deviation equals threshold (boundary)', () => {
    expect(slouchRule(20, 20)).toBeNull()
  })

  it('should return violation when deviation exceeds threshold', () => {
    const result = slouchRule(30, 20)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('SLOUCH')
  })

  it('should have severity between 0 and 1', () => {
    const result = slouchRule(25, 20)
    expect(result).not.toBeNull()
    expect(result!.severity).toBeGreaterThanOrEqual(0)
    expect(result!.severity).toBeLessThanOrEqual(1)
  })

  it('should have severity that increases with larger deviation', () => {
    const mild = slouchRule(21, 20)
    const severe = slouchRule(40, 20)
    expect(mild).not.toBeNull()
    expect(severe).not.toBeNull()
    expect(severe!.severity).toBeGreaterThan(mild!.severity)
  })

  it('should cap severity at 1', () => {
    const result = slouchRule(200, 20)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe(1)
  })

  it('should include a non-empty message', () => {
    const result = slouchRule(25, 20)
    expect(result).not.toBeNull()
    expect(result!.message).toBeTruthy()
  })
})

// ─── headTiltRule ───

describe('headTiltRule', () => {
  it('should return null when deviation is below threshold', () => {
    expect(headTiltRule(5, 12)).toBeNull()
  })

  it('should return null when deviation equals threshold (boundary)', () => {
    expect(headTiltRule(12, 12)).toBeNull()
  })

  it('should return violation when deviation exceeds threshold', () => {
    const result = headTiltRule(20, 12)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('HEAD_TILT')
  })

  it('should use absolute value of deviation (negative tilt)', () => {
    const result = headTiltRule(-15, 12)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('HEAD_TILT')
  })

  it('should return null for small negative deviation within threshold', () => {
    expect(headTiltRule(-5, 12)).toBeNull()
  })

  it('should have severity between 0 and 1', () => {
    const result = headTiltRule(15, 12)
    expect(result).not.toBeNull()
    expect(result!.severity).toBeGreaterThanOrEqual(0)
    expect(result!.severity).toBeLessThanOrEqual(1)
  })

  it('should cap severity at 1', () => {
    const result = headTiltRule(200, 12)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe(1)
  })
})

// ─── shoulderAsymmetryRule ───

describe('shoulderAsymmetryRule', () => {
  it('should return null when deviation is below threshold', () => {
    expect(shoulderAsymmetryRule(5, 10)).toBeNull()
  })

  it('should return null when deviation equals threshold (boundary)', () => {
    expect(shoulderAsymmetryRule(10, 10)).toBeNull()
  })

  it('should return violation when deviation exceeds threshold', () => {
    const result = shoulderAsymmetryRule(15, 10)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('SHOULDER_ASYMMETRY')
  })

  it('should use absolute value of deviation', () => {
    const result = shoulderAsymmetryRule(-15, 10)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('SHOULDER_ASYMMETRY')
  })

  it('should have severity between 0 and 1', () => {
    const result = shoulderAsymmetryRule(12, 10)
    expect(result).not.toBeNull()
    expect(result!.severity).toBeGreaterThanOrEqual(0)
    expect(result!.severity).toBeLessThanOrEqual(1)
  })

  it('should cap severity at 1', () => {
    const result = shoulderAsymmetryRule(200, 10)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe(1)
  })
})

// ─── evaluateAllRules ───

describe('evaluateAllRules', () => {
  it('should return empty array when all deviations are within thresholds', () => {
    const deviations = makeDeviations()
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toEqual([])
  })

  it('should detect forward head violation (via NTE signal)', () => {
    // nteDelta=0.04, nteScore = 0.04/0.02 = 2.0, combined = 0.6*2.0 = 1.2 > 1.0
    const deviations = makeDeviations({ noseToEarAvg: 0.04, faceFrameRatio: 0.02, headForward: 5 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    const fhViolations = result.filter(v => v.rule === 'FORWARD_HEAD')
    expect(fhViolations).toHaveLength(1)
  })

  it('should detect forward head violation (via combined signals)', () => {
    // nteDelta=0.03, nteScore=1.5; ffrDelta=0.06, ffrScore=1.2; angleDelta=8, angleScore=0.8
    // combined = 0.6*1.5 + 0.2*1.2 + 0.2*0.8 = 0.9+0.24+0.16 = 1.3 > 1.0
    const deviations = makeDeviations({ noseToEarAvg: 0.03, faceFrameRatio: 0.06, headForward: 8 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    const fhViolations = result.filter(v => v.rule === 'FORWARD_HEAD')
    expect(fhViolations).toHaveLength(1)
  })

  it('should detect slouch violation', () => {
    const deviations = makeDeviations({ torsoSlouch: 25 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('SLOUCH')
  })

  it('should detect head tilt violation', () => {
    const deviations = makeDeviations({ headTilt: 15 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('HEAD_TILT')
  })

  it('should detect shoulder asymmetry violation', () => {
    const deviations = makeDeviations({ shoulderDiff: 15 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('SHOULDER_ASYMMETRY')
  })

  it('should detect multiple violations simultaneously', () => {
    const deviations = makeDeviations({
      noseToEarAvg: 0.04, // NTE alone triggers FH: 0.6 * (0.04/0.02) = 1.2 > 1.0
      headForward: 30,
      torsoSlouch: 30,
      headTilt: 15,
    })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(3)
    const rules = result.map(v => v.rule)
    expect(rules).toContain('FORWARD_HEAD')
    expect(rules).toContain('SLOUCH')
    expect(rules).toContain('HEAD_TILT')
  })

  it('should skip disabled rules', () => {
    const deviations = makeDeviations({
      headForward: 30,
      torsoSlouch: 30,
    })
    const toggles: RuleToggles = {
      ...ALL_ENABLED,
      forwardHead: false,
    }
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, toggles)
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('SLOUCH')
  })

  it('should return empty array when all rules are disabled', () => {
    const deviations = makeDeviations({
      headForward: 100,
      torsoSlouch: 100,
      headTilt: 100,
      faceFrameRatio: 10,
      shoulderDiff: 100,
    })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_DISABLED)
    expect(result).toEqual([])
  })

  it('should have all violations with severity between 0 and 1', () => {
    const deviations = makeDeviations({
      noseToEarAvg: 0.04, // NTE triggers FH: 0.6*(0.04/0.02) = 1.2 > 1.0
      headForward: 30,
      torsoSlouch: 30,
      headTilt: 15,
      faceFrameRatio: 0.5,
      shoulderDiff: 15,
    })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result.length).toBeGreaterThanOrEqual(4)
    for (const violation of result) {
      expect(violation.severity).toBeGreaterThanOrEqual(0)
      expect(violation.severity).toBeLessThanOrEqual(1)
    }
  })

  it('should produce PostureViolation objects with rule, severity, and message', () => {
    // Use NTE signal to trigger forward head
    const deviations = makeDeviations({ noseToEarAvg: 0.04, faceFrameRatio: 0.10, headForward: 8 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    const fhViolations = result.filter(v => v.rule === 'FORWARD_HEAD')
    expect(fhViolations).toHaveLength(1)
    expect(fhViolations[0]).toHaveProperty('rule')
    expect(fhViolations[0]).toHaveProperty('severity')
    expect(fhViolations[0]).toHaveProperty('message')
    expect(typeof fhViolations[0].rule).toBe('string')
    expect(typeof fhViolations[0].severity).toBe('number')
    expect(typeof fhViolations[0].message).toBe('string')
  })
})
