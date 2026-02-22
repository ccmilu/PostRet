import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THRESHOLDS,
  getScaledThresholds,
  type CustomThresholdOverrides,
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

describe('getScaledThresholds with customOverrides', () => {
  it('should override forwardHead and proportionally adjust FFR and NTE', () => {
    const overrides: CustomThresholdOverrides = { forwardHead: 16 }
    const result = getScaledThresholds(0.5, overrides)

    // forwardHead = 16 (override), not scaled
    expect(result.forwardHead).toBe(16)
    // FFR/NTE scaled proportionally: default_ffr * (16 / 8)
    expect(result.forwardHeadFFR).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadFFR * 2)
    expect(result.forwardHeadNTE).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadNTE * 2)
    // Other values remain scaled normally
    expect(result.headTilt).toBeCloseTo(DEFAULT_THRESHOLDS.headTilt * 1.25)
    expect(result.shoulderAsymmetry).toBeCloseTo(DEFAULT_THRESHOLDS.shoulderAsymmetry * 1.25)
  })

  it('should override headTilt only', () => {
    const overrides: CustomThresholdOverrides = { headTilt: 20 }
    const result = getScaledThresholds(0.5, overrides)

    expect(result.headTilt).toBe(20)
    // forwardHead and FFR/NTE remain scaled normally
    expect(result.forwardHead).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHead * 1.25)
    expect(result.forwardHeadFFR).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadFFR * 1.25)
  })

  it('should override shoulderAsymmetry only', () => {
    const overrides: CustomThresholdOverrides = { shoulderAsymmetry: 5 }
    const result = getScaledThresholds(0.5, overrides)

    expect(result.shoulderAsymmetry).toBe(5)
    expect(result.forwardHead).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHead * 1.25)
  })

  it('should use tooClose override as forwardHead when forwardHead is not set', () => {
    const overrides: CustomThresholdOverrides = { tooClose: 12 }
    const result = getScaledThresholds(0.5, overrides)

    expect(result.forwardHead).toBe(12)
    // FFR/NTE adjusted proportionally
    expect(result.forwardHeadFFR).toBeCloseTo(DEFAULT_THRESHOLDS.forwardHeadFFR * (12 / 8))
  })

  it('should prefer forwardHead over tooClose when both set', () => {
    const overrides: CustomThresholdOverrides = { forwardHead: 10, tooClose: 12 }
    const result = getScaledThresholds(0.5, overrides)

    expect(result.forwardHead).toBe(10)
  })

  it('should override multiple fields simultaneously', () => {
    const overrides: CustomThresholdOverrides = {
      forwardHead: 4,
      headTilt: 6,
      shoulderAsymmetry: 15,
    }
    const result = getScaledThresholds(0.5, overrides)

    expect(result.forwardHead).toBe(4)
    expect(result.headTilt).toBe(6)
    expect(result.shoulderAsymmetry).toBe(15)
    // slouch unchanged
    expect(result.slouch).toBeCloseTo(DEFAULT_THRESHOLDS.slouch * 1.25)
  })

  it('should return normal scaled values when overrides is empty object', () => {
    const result = getScaledThresholds(0.5, {})
    const expected = getScaledThresholds(0.5)

    expect(result).toEqual(expected)
  })

  it('should return normal scaled values when overrides is undefined', () => {
    const result = getScaledThresholds(0.5, undefined)
    const expected = getScaledThresholds(0.5)

    expect(result).toEqual(expected)
  })
})
