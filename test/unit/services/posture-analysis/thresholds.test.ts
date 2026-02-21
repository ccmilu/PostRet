import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  getScaledThresholds,
} from '../../../../src/services/posture-analysis/thresholds'

describe('getScaledThresholds', () => {
  it('should return thresholds × 2.0 when sensitivity is 0', () => {
    const result = getScaledThresholds(0)

    expect(result.forwardHead).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHead * 2)
    expect(result.forwardHeadFFR).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadFFR * 2)
    expect(result.forwardHeadNTE).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadNTE * 2)
    expect(result.slouch).toBeCloseTo(DEFAULT_THRESHOLDS.slouch * 2)
    expect(result.headTilt).toBeCloseTo(DEFAULT_THRESHOLDS.headTilt * 2)
    expect(result.shoulderAsymmetry).toBeCloseTo(DEFAULT_THRESHOLDS.shoulderAsymmetry * 2)
  })

  it('should return thresholds × 1.25 when sensitivity is 0.5', () => {
    const result = getScaledThresholds(0.5)

    expect(result.forwardHead).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHead * 1.25)
    expect(result.forwardHeadFFR).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadFFR * 1.25)
    expect(result.forwardHeadNTE).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadNTE * 1.25)
    expect(result.slouch).toBeCloseTo(DEFAULT_THRESHOLDS.slouch * 1.25)
    expect(result.headTilt).toBeCloseTo(DEFAULT_THRESHOLDS.headTilt * 1.25)
    expect(result.shoulderAsymmetry).toBeCloseTo(DEFAULT_THRESHOLDS.shoulderAsymmetry * 1.25)
  })

  it('should return thresholds × 0.5 when sensitivity is 1', () => {
    const result = getScaledThresholds(1)

    expect(result.forwardHead).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHead * 0.5)
    expect(result.forwardHeadFFR).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadFFR * 0.5)
    expect(result.forwardHeadNTE).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadNTE * 0.5)
    expect(result.slouch).toBeCloseTo(DEFAULT_THRESHOLDS.slouch * 0.5)
    expect(result.headTilt).toBeCloseTo(DEFAULT_THRESHOLDS.headTilt * 0.5)
    expect(result.shoulderAsymmetry).toBeCloseTo(DEFAULT_THRESHOLDS.shoulderAsymmetry * 0.5)
  })

  it('should clamp sensitivity below 0 to 0', () => {
    const result = getScaledThresholds(-0.5)
    const expected = getScaledThresholds(0)

    expect(result).toEqual(expected)
  })

  it('should clamp sensitivity above 1 to 1', () => {
    const result = getScaledThresholds(1.5)
    const expected = getScaledThresholds(1)

    expect(result).toEqual(expected)
  })
})
