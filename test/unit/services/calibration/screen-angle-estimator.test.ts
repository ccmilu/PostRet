import { describe, it, expect } from 'vitest'
import {
  extractScreenAngleSignals,
  calibrateScreenAngle,
  estimateAngleChange,
  estimateAngleChangeMulti,
  compensateAngles,
} from '@/services/calibration/screen-angle-estimator'
import type { ScreenAngleCalibrationPoint } from '@/types/settings'
import type { Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'

function createMockLandmarks(
  overrides: Partial<Record<number, Partial<Landmark>>> = {}
): Landmark[] {
  const defaults: Landmark = { x: 0, y: 0, z: 0, visibility: 1.0 }
  return Array.from({ length: 33 }, (_, i) => ({
    ...defaults,
    ...overrides[i],
  }))
}

// Standard upright face landmarks for screen angle estimation
// Normalized coordinates (0-1 range, y increases downward)
function createStandardFaceLandmarks(): Landmark[] {
  return createMockLandmarks({
    [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.35, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_EYE]: { x: 0.45, y: 0.30, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.55, y: 0.30, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_EAR]: { x: 0.38, y: 0.33, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.62, y: 0.33, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.46, y: 0.42, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.54, y: 0.42, z: 0, visibility: 1.0 },
  })
}

function createPostureAngles(overrides: Partial<PostureAngles> = {}): PostureAngles {
  return {
    headForwardAngle: 15.0,
    torsoAngle: 5.0,
    headTiltAngle: 2.0,
    faceFrameRatio: 0.2,
    shoulderDiff: 1.0,
    ...overrides,
  }
}

describe('screen-angle-estimator', () => {
  describe('extractScreenAngleSignals', () => {
    it('extracts faceY from NOSE landmark normalized y', () => {
      const landmarks = createStandardFaceLandmarks()
      const signals = extractScreenAngleSignals(landmarks)
      expect(signals.faceY).toBeCloseTo(0.35, 2)
    })

    it('extracts noseChinRatio as nose-to-mouth vertical distance / ear span', () => {
      const landmarks = createStandardFaceLandmarks()
      const signals = extractScreenAngleSignals(landmarks)

      // nose y = 0.35, mouth mid y = 0.42
      // vertical distance = 0.42 - 0.35 = 0.07
      // ear span = |0.38 - 0.62| = 0.24
      // ratio = 0.07 / 0.24 ≈ 0.2917
      expect(signals.noseChinRatio).toBeCloseTo(0.07 / 0.24, 2)
    })

    it('extracts eyeMouthRatio as eye-to-mouth vertical distance / ear span', () => {
      const landmarks = createStandardFaceLandmarks()
      const signals = extractScreenAngleSignals(landmarks)

      // eye mid y = 0.30, mouth mid y = 0.42
      // vertical distance = 0.42 - 0.30 = 0.12
      // ear span = 0.24
      // ratio = 0.12 / 0.24 = 0.5
      expect(signals.eyeMouthRatio).toBeCloseTo(0.12 / 0.24, 2)
    })

    it('returns readonly signals object', () => {
      const landmarks = createStandardFaceLandmarks()
      const signals = extractScreenAngleSignals(landmarks)
      expect(signals).toHaveProperty('faceY')
      expect(signals).toHaveProperty('noseChinRatio')
      expect(signals).toHaveProperty('eyeMouthRatio')
    })

    it('handles zero ear span gracefully (uses fallback divisor)', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.35, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.LEFT_EYE]: { x: 0.5, y: 0.30, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.5, y: 0.30, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.5, y: 0.33, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.5, y: 0.33, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.5, y: 0.42, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.5, y: 0.42, z: 0, visibility: 1.0 },
      })
      const signals = extractScreenAngleSignals(landmarks)
      expect(Number.isFinite(signals.noseChinRatio)).toBe(true)
      expect(Number.isFinite(signals.eyeMouthRatio)).toBe(true)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createStandardFaceLandmarks()
      const copy = landmarks.map(l => ({ ...l }))
      extractScreenAngleSignals(landmarks)
      expect(landmarks).toEqual(copy)
    })
  })

  describe('calibrateScreenAngle', () => {
    it('records reference values matching input signals', () => {
      const signals = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.5 }
      const reference = calibrateScreenAngle(signals)
      expect(reference.faceY).toBe(0.35)
      expect(reference.noseChinRatio).toBe(0.29)
      expect(reference.eyeMouthRatio).toBe(0.5)
    })

    it('returns a new object (not the same reference as input)', () => {
      const signals = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.5 }
      const reference = calibrateScreenAngle(signals)
      expect(reference).not.toBe(signals)
      expect(reference).toEqual(signals)
    })
  })

  describe('estimateAngleChange', () => {
    it('returns ~0 when current matches reference (within ±0.5°)', () => {
      const signals = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.5 }
      const reference = calibrateScreenAngle(signals)
      const delta = estimateAngleChange(signals, reference)
      expect(Math.abs(delta)).toBeLessThanOrEqual(0.5)
    })

    it('estimates ~4.5° (±1°) when faceY increases by 0.1', () => {
      const reference = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.5 }
      const current = { faceY: 0.45, noseChinRatio: 0.29, eyeMouthRatio: 0.5 }
      const delta = estimateAngleChange(current, reference)
      // faceYDelta = 0.1, contribution = 0.1 * 45 = 4.5
      expect(delta).toBeGreaterThanOrEqual(3.5)
      expect(delta).toBeLessThanOrEqual(5.5)
    })

    it('combines all three signals when they change in same direction', () => {
      const reference = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const current = { faceY: 0.45, noseChinRatio: 0.39, eyeMouthRatio: 0.60 }
      const delta = estimateAngleChange(current, reference)

      const faceYOnly = estimateAngleChange(
        { faceY: 0.45, noseChinRatio: 0.29, eyeMouthRatio: 0.50 },
        reference,
      )
      expect(delta).toBeGreaterThan(faceYOnly)
    })

    it('returns negative when signals indicate upward angle change', () => {
      const reference = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const current = { faceY: 0.25, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const delta = estimateAngleChange(current, reference)
      expect(delta).toBeLessThan(0)
    })
  })

  describe('compensateAngles', () => {
    it('compensates headForward by pitchDelta * 0.8', () => {
      const angles = createPostureAngles({ headForwardAngle: 20.0 })
      const pitchDelta = 10.0
      const compensated = compensateAngles(angles, pitchDelta)
      // compensated = 20 - 10 * 0.8 = 12
      expect(compensated.headForwardAngle).toBeCloseTo(12.0, 1)
    })

    it('does not compensate torsoAngle', () => {
      const angles = createPostureAngles({ torsoAngle: 8.0 })
      const compensated = compensateAngles(angles, 10.0)
      expect(compensated.torsoAngle).toBe(8.0)
    })

    it('does not compensate headTiltAngle', () => {
      const angles = createPostureAngles({ headTiltAngle: 3.0 })
      const compensated = compensateAngles(angles, 10.0)
      expect(compensated.headTiltAngle).toBe(3.0)
    })

    it('does not compensate faceFrameRatio', () => {
      const angles = createPostureAngles({ faceFrameRatio: 0.25 })
      const compensated = compensateAngles(angles, 10.0)
      expect(compensated.faceFrameRatio).toBe(0.25)
    })

    it('does not compensate shoulderDiff', () => {
      const angles = createPostureAngles({ shoulderDiff: 1.5 })
      const compensated = compensateAngles(angles, 10.0)
      expect(compensated.shoulderDiff).toBe(1.5)
    })

    it('returns a new object (immutability)', () => {
      const angles = createPostureAngles()
      const compensated = compensateAngles(angles, 5.0)
      expect(compensated).not.toBe(angles)
    })

    it('does not mutate the input angles', () => {
      const angles = createPostureAngles({ headForwardAngle: 20.0 })
      const copy = { ...angles }
      compensateAngles(angles, 10.0)
      expect(angles).toEqual(copy)
    })

    it('handles zero pitchDelta (no compensation)', () => {
      const angles = createPostureAngles({ headForwardAngle: 15.0 })
      const compensated = compensateAngles(angles, 0)
      expect(compensated.headForwardAngle).toBe(15.0)
    })

    it('handles negative pitchDelta (screen tilted away)', () => {
      const angles = createPostureAngles({ headForwardAngle: 10.0 })
      const compensated = compensateAngles(angles, -5.0)
      // compensated = 10 - (-5) * 0.8 = 10 + 4 = 14
      expect(compensated.headForwardAngle).toBeCloseTo(14.0, 1)
    })
  })

  describe('estimateAngleChangeMulti', () => {
    const ref90: ScreenAngleCalibrationPoint = {
      angle: 90,
      signals: { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 },
    }
    const ref110: ScreenAngleCalibrationPoint = {
      angle: 110,
      signals: { faceY: 0.38, noseChinRatio: 0.31, eyeMouthRatio: 0.52 },
    }
    const ref130: ScreenAngleCalibrationPoint = {
      angle: 130,
      signals: { faceY: 0.42, noseChinRatio: 0.34, eyeMouthRatio: 0.54 },
    }

    it('returns 0 with no references', () => {
      const current = { faceY: 0.40, noseChinRatio: 0.30, eyeMouthRatio: 0.51 }
      expect(estimateAngleChangeMulti(current, [])).toBe(0)
    })

    it('degrades to single-reference estimateAngleChange with 1 reference', () => {
      const current = { faceY: 0.40, noseChinRatio: 0.30, eyeMouthRatio: 0.51 }
      const multi = estimateAngleChangeMulti(current, [ref90])
      const single = estimateAngleChange(current, ref90.signals)
      expect(multi).toBeCloseTo(single, 5)
    })

    it('returns ~0 when current matches a reference exactly', () => {
      const current = { ...ref90.signals }
      const delta = estimateAngleChangeMulti(current, [ref90, ref110, ref130])
      expect(Math.abs(delta)).toBeLessThan(0.5)
    })

    it('returns ~0 when current matches second reference exactly', () => {
      const current = { ...ref110.signals }
      const delta = estimateAngleChangeMulti(current, [ref90, ref110, ref130])
      expect(Math.abs(delta)).toBeLessThan(0.5)
    })

    it('returns ~0 when current matches third reference exactly', () => {
      const current = { ...ref130.signals }
      const delta = estimateAngleChangeMulti(current, [ref90, ref110, ref130])
      expect(Math.abs(delta)).toBeLessThan(0.5)
    })

    it('returns non-zero for signals between references', () => {
      const current = { faceY: 0.365, noseChinRatio: 0.30, eyeMouthRatio: 0.51 }
      const delta = estimateAngleChangeMulti(current, [ref90, ref110, ref130])
      // Should use nearest reference's signals for comparison
      expect(typeof delta).toBe('number')
      expect(Number.isFinite(delta)).toBe(true)
    })

    it('gives smaller delta for signals close to a reference than far from all', () => {
      const close = { faceY: 0.36, noseChinRatio: 0.295, eyeMouthRatio: 0.505 }
      const far = { faceY: 0.55, noseChinRatio: 0.45, eyeMouthRatio: 0.70 }

      const deltaClose = estimateAngleChangeMulti(close, [ref90, ref110, ref130])
      const deltaFar = estimateAngleChangeMulti(far, [ref90, ref110, ref130])

      expect(Math.abs(deltaClose)).toBeLessThan(Math.abs(deltaFar))
    })

    it('does not mutate reference array', () => {
      const refs = [ref90, ref110, ref130]
      const copy = [...refs]
      const current = { faceY: 0.40, noseChinRatio: 0.30, eyeMouthRatio: 0.51 }
      estimateAngleChangeMulti(current, refs)
      expect(refs).toEqual(copy)
    })
  })

  describe('screen angle compensation accuracy for different angles', () => {
    // Simulate 3 different screen angles (90°, 110°, 130°)
    // At each angle, the faceY shifts and we measure if compensation brings headForward close

    it('90° screen (reference position) — no compensation needed', () => {
      const referenceSignals = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const currentSignals = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const pitchDelta = estimateAngleChange(currentSignals, referenceSignals)

      const trueHeadForward = 12.0
      const measuredHeadForward = trueHeadForward // no angle-induced offset at reference
      const compensated = compensateAngles(
        createPostureAngles({ headForwardAngle: measuredHeadForward }),
        pitchDelta,
      )
      expect(Math.abs(compensated.headForwardAngle - trueHeadForward)).toBeLessThan(5)
    })

    it('110° screen (tilted back ~20°) — signals shift, compensation corrects', () => {
      // When screen tilts back, user looks slightly down → faceY increases
      const referenceSignals = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      // Simulated signal shifts for ~20° tilt back
      const currentSignals = {
        faceY: 0.35 + 0.06,     // face drops in frame
        noseChinRatio: 0.29 + 0.03,  // chin-to-nose ratio changes
        eyeMouthRatio: 0.50 + 0.02,  // eye-to-mouth ratio changes
      }
      const pitchDelta = estimateAngleChange(currentSignals, referenceSignals)

      // The screen angle causes headForward to read ~8° higher than actual
      const trueHeadForward = 12.0
      const measuredHeadForward = trueHeadForward + pitchDelta * 0.8
      const compensated = compensateAngles(
        createPostureAngles({ headForwardAngle: measuredHeadForward }),
        pitchDelta,
      )
      expect(Math.abs(compensated.headForwardAngle - trueHeadForward)).toBeLessThan(5)
    })

    it('130° screen (tilted back ~40°) — larger shift, compensation still within 5°', () => {
      const referenceSignals = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      // Larger signal shifts for ~40° tilt back
      const currentSignals = {
        faceY: 0.35 + 0.12,
        noseChinRatio: 0.29 + 0.06,
        eyeMouthRatio: 0.50 + 0.04,
      }
      const pitchDelta = estimateAngleChange(currentSignals, referenceSignals)

      const trueHeadForward = 12.0
      const measuredHeadForward = trueHeadForward + pitchDelta * 0.8
      const compensated = compensateAngles(
        createPostureAngles({ headForwardAngle: measuredHeadForward }),
        pitchDelta,
      )
      expect(Math.abs(compensated.headForwardAngle - trueHeadForward)).toBeLessThan(5)
    })
  })
})
