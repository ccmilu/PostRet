import { describe, it, expect, beforeEach } from 'vitest'
import { AdaptiveBaseline } from '@/services/calibration/adaptive-baseline'
import type { CalibrationData } from '@/types/settings'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'

function createBaseline(overrides: Partial<CalibrationData> = {}): CalibrationData {
  return {
    headForwardAngle: 5.0,
    torsoAngle: 3.0,
    headTiltAngle: 1.0,
    faceFrameRatio: 0.2,
    shoulderDiff: 0.5,
    timestamp: 1000000,
    ...overrides,
  }
}

function createAngles(overrides: Partial<PostureAngles> = {}): PostureAngles {
  return {
    headForwardAngle: 5.0,
    torsoAngle: 3.0,
    headTiltAngle: 1.0,
    faceFrameRatio: 0.2,
    shoulderDiff: 0.5,
    ...overrides,
  }
}

describe('AdaptiveBaseline', () => {
  let baseline: AdaptiveBaseline

  const defaultBaseline = createBaseline()

  beforeEach(() => {
    baseline = new AdaptiveBaseline(defaultBaseline)
  })

  describe('constructor and getCurrentBaseline', () => {
    it('returns original baseline on initialization', () => {
      const current = baseline.getCurrentBaseline()
      expect(current.headForwardAngle).toBe(5.0)
      expect(current.torsoAngle).toBe(3.0)
      expect(current.headTiltAngle).toBe(1.0)
      expect(current.faceFrameRatio).toBe(0.2)
      expect(current.shoulderDiff).toBe(0.5)
      expect(current.timestamp).toBe(1000000)
    })

    it('initial goodPostureDuration is 0', () => {
      expect(baseline.getGoodPostureDuration()).toBe(0)
    })
  })

  describe('update — no drift before 30 seconds', () => {
    it('does not drift before reaching 30 seconds of good posture', () => {
      const angles = createAngles({ headForwardAngle: 10.0 })

      // Feed 29 seconds of good posture (29 updates at 1s each)
      for (let i = 0; i < 29; i++) {
        baseline.update(true, angles, 1.0)
      }

      const current = baseline.getCurrentBaseline()
      expect(current.headForwardAngle).toBe(5.0)
      expect(current.torsoAngle).toBe(3.0)
    })

    it('accumulates goodPostureDuration correctly', () => {
      const angles = createAngles()
      baseline.update(true, angles, 10.0)
      expect(baseline.getGoodPostureDuration()).toBe(10.0)

      baseline.update(true, angles, 5.0)
      expect(baseline.getGoodPostureDuration()).toBe(15.0)
    })
  })

  describe('update — drift after 30 seconds', () => {
    it('starts drifting after 30 seconds of continuous good posture', () => {
      const angles = createAngles({ headForwardAngle: 10.0 })

      // Accumulate 30 seconds first (no drift yet)
      baseline.update(true, angles, 30.0)

      // Now one more second triggers drift
      baseline.update(true, angles, 1.0)

      const current = baseline.getCurrentBaseline()
      // newValue = 5.0 + (10.0 - 5.0) * 0.001 * 1.0 = 5.005
      expect(current.headForwardAngle).toBeCloseTo(5.005, 5)
    })

    it('drift rate: after 60 seconds total, baseline changes < 0.5 degrees', () => {
      const angles = createAngles({ headForwardAngle: 15.0 })

      // 30 seconds warm-up
      baseline.update(true, angles, 30.0)

      // 30 seconds of drifting (in 1-second increments)
      for (let i = 0; i < 30; i++) {
        baseline.update(true, angles, 1.0)
      }

      const current = baseline.getCurrentBaseline()
      const drift = Math.abs(current.headForwardAngle - 5.0)
      expect(drift).toBeLessThan(0.5)
      expect(drift).toBeGreaterThan(0)
    })
  })

  describe('update — threshold crossing in single call', () => {
    it('only drifts for the excess time when crossing threshold in one call', () => {
      const angles = createAngles({ headForwardAngle: 10.0 })

      // Single call that crosses from 20s to 35s (excess = 5s)
      baseline.update(true, angles, 20.0)
      baseline.update(true, angles, 15.0) // crosses 30s, excess = 5s

      const current = baseline.getCurrentBaseline()
      // Expected: 5.0 + (10.0 - 5.0) * 0.001 * 5.0 = 5.025
      expect(current.headForwardAngle).toBeCloseTo(5.025, 5)
    })
  })

  describe('update — bad posture resets duration', () => {
    it('resets goodPostureDuration when bad posture detected', () => {
      const angles = createAngles()
      baseline.update(true, angles, 20.0)
      expect(baseline.getGoodPostureDuration()).toBe(20.0)

      baseline.update(false, angles, 1.0)
      expect(baseline.getGoodPostureDuration()).toBe(0)
    })

    it('does not drift when bad posture is fed', () => {
      const angles = createAngles({ headForwardAngle: 10.0 })

      // 30 seconds good posture
      baseline.update(true, angles, 30.0)

      // Bad posture — should reset and not drift
      baseline.update(false, angles, 1.0)

      const current = baseline.getCurrentBaseline()
      expect(current.headForwardAngle).toBe(5.0)
    })
  })

  describe('update — good → bad → good scenario', () => {
    it('restarts 30-second counter after interruption', () => {
      const angles = createAngles({ headForwardAngle: 10.0 })

      // 25 seconds good
      baseline.update(true, angles, 25.0)
      // Interrupted by bad posture
      baseline.update(false, angles, 1.0)
      expect(baseline.getGoodPostureDuration()).toBe(0)

      // 25 seconds good again — not enough (need 30)
      baseline.update(true, angles, 25.0)
      baseline.update(true, angles, 1.0)

      const current = baseline.getCurrentBaseline()
      expect(current.headForwardAngle).toBe(5.0) // No drift yet

      // 4 more seconds to reach 30
      baseline.update(true, angles, 4.0)
      // Now drift should start
      baseline.update(true, angles, 1.0)

      const afterDrift = baseline.getCurrentBaseline()
      expect(afterDrift.headForwardAngle).toBeGreaterThan(5.0)
    })
  })

  describe('update — max drift limit', () => {
    it('does not drift beyond 8 degrees for angle fields', () => {
      const angles = createAngles({ headForwardAngle: 100.0 })

      // Warm up
      baseline.update(true, angles, 30.0)

      // Feed for a very long time to saturate drift
      for (let i = 0; i < 10000; i++) {
        baseline.update(true, angles, 1.0)
      }

      const current = baseline.getCurrentBaseline()
      const drift = Math.abs(current.headForwardAngle - 5.0)
      expect(drift).toBeLessThanOrEqual(8.0)
    })

    it('does not drift beyond 0.1 for faceFrameRatio', () => {
      const angles = createAngles({ faceFrameRatio: 1.0 })

      baseline.update(true, angles, 30.0)

      for (let i = 0; i < 10000; i++) {
        baseline.update(true, angles, 1.0)
      }

      const current = baseline.getCurrentBaseline()
      const drift = Math.abs(current.faceFrameRatio - 0.2)
      // Allow tiny floating point tolerance
      expect(drift).toBeLessThanOrEqual(0.1 + 1e-10)
    })

    it('clamps shoulderDiff drift to 8', () => {
      const angles = createAngles({ shoulderDiff: 50.0 })

      baseline.update(true, angles, 30.0)
      for (let i = 0; i < 10000; i++) {
        baseline.update(true, angles, 1.0)
      }

      const current = baseline.getCurrentBaseline()
      expect(Math.abs(current.shoulderDiff - 0.5)).toBeLessThanOrEqual(8.0)
    })
  })

  describe('update — independent angle drift', () => {
    it('each angle drifts independently', () => {
      const angles = createAngles({
        headForwardAngle: 10.0,
        headTiltAngle: 1.0, // same as baseline
      })

      baseline.update(true, angles, 30.0)
      baseline.update(true, angles, 10.0)

      const current = baseline.getCurrentBaseline()
      // headForward should drift toward 10
      expect(current.headForwardAngle).toBeGreaterThan(5.0)
      // headTilt should NOT drift (currentAngle === baseline)
      expect(current.headTiltAngle).toBe(1.0)
    })
  })

  describe('update — drift direction', () => {
    it('drifts toward current angle value (positive direction)', () => {
      const angles = createAngles({ headForwardAngle: 10.0 })

      baseline.update(true, angles, 30.0)
      baseline.update(true, angles, 5.0)

      const current = baseline.getCurrentBaseline()
      expect(current.headForwardAngle).toBeGreaterThan(5.0)
      expect(current.headForwardAngle).toBeLessThan(10.0)
    })

    it('drifts toward current angle value (negative direction)', () => {
      const angles = createAngles({ headForwardAngle: 0.0 })

      baseline.update(true, angles, 30.0)
      baseline.update(true, angles, 5.0)

      const current = baseline.getCurrentBaseline()
      expect(current.headForwardAngle).toBeLessThan(5.0)
      expect(current.headForwardAngle).toBeGreaterThan(0.0)
    })
  })

  describe('reset', () => {
    it('restores original calibration baseline', () => {
      const angles = createAngles({ headForwardAngle: 10.0 })

      baseline.update(true, angles, 30.0)
      baseline.update(true, angles, 10.0)

      // Verify drift happened
      expect(baseline.getCurrentBaseline().headForwardAngle).toBeGreaterThan(5.0)

      baseline.reset()

      const current = baseline.getCurrentBaseline()
      expect(current.headForwardAngle).toBe(5.0)
      expect(current.torsoAngle).toBe(3.0)
      expect(current.headTiltAngle).toBe(1.0)
      expect(current.faceFrameRatio).toBe(0.2)
      expect(current.shoulderDiff).toBe(0.5)
      expect(current.timestamp).toBe(1000000)
    })

    it('resets goodPostureDuration to 0', () => {
      const angles = createAngles()
      baseline.update(true, angles, 20.0)
      expect(baseline.getGoodPostureDuration()).toBe(20.0)

      baseline.reset()
      expect(baseline.getGoodPostureDuration()).toBe(0)
    })
  })

  describe('immutability', () => {
    it('does not mutate the original baseline object', () => {
      const original = createBaseline()
      const copy = { ...original }
      const ab = new AdaptiveBaseline(original)

      const angles = createAngles({ headForwardAngle: 20.0 })
      ab.update(true, angles, 30.0)
      ab.update(true, angles, 100.0)

      // Original should be unchanged
      expect(original).toEqual(copy)
    })

    it('getCurrentBaseline returns a new object each time', () => {
      const a = baseline.getCurrentBaseline()
      const b = baseline.getCurrentBaseline()
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })

    it('update returns a new object each time', () => {
      const angles = createAngles()
      const a = baseline.update(true, angles, 1.0)
      const b = baseline.update(true, angles, 1.0)
      expect(a).not.toBe(b)
    })
  })

  describe('timestamp preservation', () => {
    it('timestamp does not drift', () => {
      const angles = createAngles()

      baseline.update(true, angles, 30.0)
      baseline.update(true, angles, 100.0)

      const current = baseline.getCurrentBaseline()
      expect(current.timestamp).toBe(1000000)
    })
  })
})
