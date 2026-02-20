import { describe, it, expect } from 'vitest'
import {
  forwardHeadRule,
  slouchRule,
  headTiltRule,
  tooCloseRule,
  shoulderAsymmetryRule,
  evaluateAllRules,
} from '../../../../src/services/posture-analysis/posture-rules'
import type { AngleDeviations } from '../../../../src/services/posture-analysis/posture-types'
import type { RuleThresholds } from '../../../../src/services/posture-analysis/thresholds'
import type { RuleToggles } from '../../../../src/types/settings'

const DEFAULT_THRESHOLDS: RuleThresholds = {
  forwardHead: 15,
  slouch: 20,
  headTilt: 12,
  tooClose: 0.35,
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
    shoulderDiff: 0,
    ...overrides,
  }
}

// ─── forwardHeadRule ───

describe('forwardHeadRule', () => {
  it('should return null when deviation is below threshold', () => {
    expect(forwardHeadRule(10, 15)).toBeNull()
  })

  it('should return null when deviation equals zero', () => {
    expect(forwardHeadRule(0, 15)).toBeNull()
  })

  it('should return null when deviation is negative (within threshold)', () => {
    expect(forwardHeadRule(-5, 15)).toBeNull()
  })

  it('should return severity 1 when threshold is 0 and deviation > 0', () => {
    const result = forwardHeadRule(1, 0)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe(1)
  })

  it('should return null when deviation equals threshold (boundary)', () => {
    expect(forwardHeadRule(15, 15)).toBeNull()
  })

  it('should return violation when deviation exceeds threshold', () => {
    const result = forwardHeadRule(25, 15)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('FORWARD_HEAD')
  })

  it('should have severity between 0 and 1', () => {
    const result = forwardHeadRule(20, 15)
    expect(result).not.toBeNull()
    expect(result!.severity).toBeGreaterThanOrEqual(0)
    expect(result!.severity).toBeLessThanOrEqual(1)
  })

  it('should have severity that increases with larger deviation', () => {
    const mild = forwardHeadRule(16, 15)
    const severe = forwardHeadRule(30, 15)
    expect(mild).not.toBeNull()
    expect(severe).not.toBeNull()
    expect(severe!.severity).toBeGreaterThan(mild!.severity)
  })

  it('should cap severity at 1 for extreme deviations', () => {
    const result = forwardHeadRule(200, 15)
    expect(result).not.toBeNull()
    expect(result!.severity).toBe(1)
  })

  it('should include a non-empty message', () => {
    const result = forwardHeadRule(20, 15)
    expect(result).not.toBeNull()
    expect(result!.message).toBeTruthy()
    expect(result!.message.length).toBeGreaterThan(0)
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

// ─── tooCloseRule ───

describe('tooCloseRule', () => {
  it('should return null when deviation is below threshold', () => {
    expect(tooCloseRule(0.1, 0.35)).toBeNull()
  })

  it('should return null when deviation equals threshold (boundary)', () => {
    expect(tooCloseRule(0.35, 0.35)).toBeNull()
  })

  it('should return violation when deviation exceeds threshold', () => {
    const result = tooCloseRule(0.5, 0.35)
    expect(result).not.toBeNull()
    expect(result!.rule).toBe('TOO_CLOSE')
  })

  it('should have severity between 0 and 1', () => {
    const result = tooCloseRule(0.4, 0.35)
    expect(result).not.toBeNull()
    expect(result!.severity).toBeGreaterThanOrEqual(0)
    expect(result!.severity).toBeLessThanOrEqual(1)
  })

  it('should cap severity at 1', () => {
    const result = tooCloseRule(10, 0.35)
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

  it('should detect forward head violation', () => {
    const deviations = makeDeviations({ headForward: 20 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('FORWARD_HEAD')
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

  it('should detect too close violation', () => {
    const deviations = makeDeviations({ faceFrameRatio: 0.5 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('TOO_CLOSE')
  })

  it('should detect shoulder asymmetry violation', () => {
    const deviations = makeDeviations({ shoulderDiff: 15 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(1)
    expect(result[0].rule).toBe('SHOULDER_ASYMMETRY')
  })

  it('should detect multiple violations simultaneously', () => {
    const deviations = makeDeviations({
      headForward: 20,
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
      headForward: 20,
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
      headForward: 20,
      torsoSlouch: 30,
      headTilt: 15,
      faceFrameRatio: 0.5,
      shoulderDiff: 15,
    })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(5)
    for (const violation of result) {
      expect(violation.severity).toBeGreaterThanOrEqual(0)
      expect(violation.severity).toBeLessThanOrEqual(1)
    }
  })

  it('should produce PostureViolation objects with rule, severity, and message', () => {
    const deviations = makeDeviations({ headForward: 20 })
    const result = evaluateAllRules(deviations, DEFAULT_THRESHOLDS, ALL_ENABLED)
    expect(result).toHaveLength(1)
    expect(result[0]).toHaveProperty('rule')
    expect(result[0]).toHaveProperty('severity')
    expect(result[0]).toHaveProperty('message')
    expect(typeof result[0].rule).toBe('string')
    expect(typeof result[0].severity).toBe('number')
    expect(typeof result[0].message).toBe('string')
  })
})
