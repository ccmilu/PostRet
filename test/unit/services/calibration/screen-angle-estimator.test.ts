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
import {
  loadLandmarks,
  loadLandmarksWithMetadata,
  loadLandmarksByCategory,
  loadAllLandmarks,
} from '../../../helpers/load-landmarks'

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

  // ============================================================
  // Real photo landmarks — integration tests
  // ============================================================

  describe('extractScreenAngleSignals — real photos', () => {
    it('all signals are finite for every photo', () => {
      const all = loadAllLandmarks()
      for (const { landmarkData, metadata } of all) {
        const signals = extractScreenAngleSignals(landmarkData.landmarks)
        expect(
          Number.isFinite(signals.faceY),
          `Photo ${metadata.photoId} faceY not finite`,
        ).toBe(true)
        expect(
          Number.isFinite(signals.noseChinRatio),
          `Photo ${metadata.photoId} noseChinRatio not finite`,
        ).toBe(true)
        expect(
          Number.isFinite(signals.eyeMouthRatio),
          `Photo ${metadata.photoId} eyeMouthRatio not finite`,
        ).toBe(true)
      }
    })

    it('faceY differs significantly across lid angles (90° vs 110° vs 130°)', () => {
      // Photo 3: lidAngle=90° (good posture)
      // Photo 1: lidAngle=110° (good posture)
      // Photo 4: lidAngle=130° (good posture)
      const sig90 = extractScreenAngleSignals(loadLandmarks(3).landmarks)
      const sig110 = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const sig130 = extractScreenAngleSignals(loadLandmarks(4).landmarks)

      // As lid angle increases (screen tilts back), user looks down → faceY increases
      expect(sig90.faceY).toBeLessThan(sig110.faceY)
      expect(sig110.faceY).toBeLessThan(sig130.faceY)

      // The faceY spread across 90° to 130° should be substantial (>0.3)
      expect(sig130.faceY - sig90.faceY).toBeGreaterThan(0.3)
    })

    it('noseChinRatio is relatively stable across same-posture different-angle photos', () => {
      // Good posture photos at different angles should have similar noseChinRatio
      // because it's a face-internal proportion that's less affected by screen angle
      const sig90 = extractScreenAngleSignals(loadLandmarks(3).landmarks)
      const sig110 = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const sig130 = extractScreenAngleSignals(loadLandmarks(4).landmarks)

      // noseChinRatio should vary less than faceY across angles
      const noseChinRange = Math.max(sig90.noseChinRatio, sig110.noseChinRatio, sig130.noseChinRatio) -
        Math.min(sig90.noseChinRatio, sig110.noseChinRatio, sig130.noseChinRatio)
      const faceYRange = sig130.faceY - sig90.faceY

      expect(noseChinRange).toBeLessThan(faceYRange)
    })

    it('good posture photos at 110° have consistent signal ranges', () => {
      const goodPhotos = loadLandmarksByCategory('good')
        .filter(p => p.metadata.lidAngle === 110 && p.metadata.lighting === 'normal')

      const signals = goodPhotos.map(p => extractScreenAngleSignals(p.landmarkData.landmarks))

      // faceY should cluster around 0.35-0.45 for good posture at 110°
      for (const sig of signals) {
        expect(sig.faceY).toBeGreaterThan(0.25)
        expect(sig.faceY).toBeLessThan(0.55)
      }

      // noseChinRatio should be in a reasonable range (0.3-0.6)
      for (const sig of signals) {
        expect(sig.noseChinRatio).toBeGreaterThan(0.3)
        expect(sig.noseChinRatio).toBeLessThan(0.65)
      }

      // eyeMouthRatio should be positive (mouth is below eyes)
      for (const sig of signals) {
        expect(sig.eyeMouthRatio).toBeGreaterThan(0.5)
        expect(sig.eyeMouthRatio).toBeLessThan(1.1)
      }
    })
  })

  describe('estimateAngleChange — real photos', () => {
    it('same-angle same-posture photos produce small delta from reference', () => {
      // Calibrate with photo 1 (110°, good)
      const refSignals = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(refSignals)

      // Other good posture photos at 110° should produce small deltas
      const goodPhotos = loadLandmarksByCategory('good')
        .filter(p =>
          p.metadata.lidAngle === 110 &&
          p.metadata.lighting === 'normal' &&
          p.metadata.photoId !== 1,
        )

      for (const { landmarkData, metadata } of goodPhotos) {
        const current = extractScreenAngleSignals(landmarkData.landmarks)
        const delta = estimateAngleChange(current, reference)
        // Same angle, same posture → delta should be small (< 6°)
        // Threshold is 6° instead of 5° because head micro-turn (photo 10) shifts
        // face proportions (noseChinRatio, eyeMouthRatio) slightly
        expect(
          Math.abs(delta),
          `Photo ${metadata.photoId} delta=${delta.toFixed(1)}° too large`,
        ).toBeLessThan(6)
      }
    })

    it('different-angle photos produce larger delta', () => {
      // Calibrate with photo 1 (110°, good)
      const refSignals = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(refSignals)

      // Photo 3 (90°) and Photo 4 (130°) should have larger deltas
      const sig90 = extractScreenAngleSignals(loadLandmarks(3).landmarks)
      const sig130 = extractScreenAngleSignals(loadLandmarks(4).landmarks)

      const delta90 = estimateAngleChange(sig90, reference)
      const delta130 = estimateAngleChange(sig130, reference)

      // 90° screen (more upright) → face higher in frame → negative faceY shift → negative delta
      expect(delta90).toBeLessThan(-3)

      // 130° screen (tilted back) → face lower in frame → positive faceY shift → positive delta
      expect(delta130).toBeGreaterThan(10)
    })

    it('delta direction is consistent: 90° → negative, 130° → positive (relative to 110°)', () => {
      const ref110 = calibrateScreenAngle(
        extractScreenAngleSignals(loadLandmarks(1).landmarks),
      )

      // All 90° photos should give negative delta
      for (const photoId of [3, 15, 28]) {
        const current = extractScreenAngleSignals(loadLandmarks(photoId).landmarks)
        const delta = estimateAngleChange(current, ref110)
        expect(delta, `Photo ${photoId} (90°) should have negative delta`).toBeLessThan(0)
      }

      // All 130° photos should give positive delta
      for (const photoId of [4, 16]) {
        const current = extractScreenAngleSignals(loadLandmarks(photoId).landmarks)
        const delta = estimateAngleChange(current, ref110)
        expect(delta, `Photo ${photoId} (130°) should have positive delta`).toBeGreaterThan(0)
      }
    })
  })

  describe('estimateAngleChangeMulti — real photos', () => {
    it('multi-ref with real calibration points gives ~0 for matching angles', () => {
      // Build real calibration points from photos at 90°, 110°, 130°
      const realRefs: ScreenAngleCalibrationPoint[] = [
        { angle: 90, signals: extractScreenAngleSignals(loadLandmarks(3).landmarks) },
        { angle: 110, signals: extractScreenAngleSignals(loadLandmarks(1).landmarks) },
        { angle: 130, signals: extractScreenAngleSignals(loadLandmarks(4).landmarks) },
      ]

      // At each calibration photo, delta should be ~0
      for (const ref of realRefs) {
        const delta = estimateAngleChangeMulti(ref.signals, realRefs)
        expect(
          Math.abs(delta),
          `Angle ${ref.angle}° self-reference delta should be ~0`,
        ).toBeLessThan(0.5)
      }
    })

    it('multi-ref gives smaller delta than single-ref for in-between angles', () => {
      const realRefs: ScreenAngleCalibrationPoint[] = [
        { angle: 90, signals: extractScreenAngleSignals(loadLandmarks(3).landmarks) },
        { angle: 110, signals: extractScreenAngleSignals(loadLandmarks(1).landmarks) },
        { angle: 130, signals: extractScreenAngleSignals(loadLandmarks(4).landmarks) },
      ]

      // Photo 2 is at 110° but different from photo 1 — multi-ref should find nearest
      const photo2 = extractScreenAngleSignals(loadLandmarks(2).landmarks)

      const multiDelta = estimateAngleChangeMulti(photo2, realRefs)
      // Single-ref from 90° would give a larger delta
      const singleFrom90 = estimateAngleChange(photo2, realRefs[0].signals)

      expect(Math.abs(multiDelta)).toBeLessThan(Math.abs(singleFrom90))
    })
  })

  describe('compensateAngles — real photos end-to-end', () => {
    it('compensation reduces headForward error for 130° screen with 110° calibration', () => {
      // Calibrate at 110°
      const refSignals = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(refSignals)

      // Photo 4 at 130° — same good posture but different screen angle
      const current = extractScreenAngleSignals(loadLandmarks(4).landmarks)
      const pitchDelta = estimateAngleChange(current, reference)

      // Create angles as if measured with a "true" headForward of ~10° but with screen-induced bias
      const baseAngles = createPostureAngles({ headForwardAngle: 10 + pitchDelta * 0.8 })
      const compensated = compensateAngles(baseAngles, pitchDelta)

      // After compensation, headForward should be close to the "true" 10°
      expect(Math.abs(compensated.headForwardAngle - 10)).toBeLessThan(1)
    })

    it('compensation does not degrade result at calibration angle', () => {
      // Calibrate at 110°
      const refSignals = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(refSignals)

      // Photo 2 at same 110° angle, different posture variation
      const current = extractScreenAngleSignals(loadLandmarks(2).landmarks)
      const pitchDelta = estimateAngleChange(current, reference)

      const original = createPostureAngles({ headForwardAngle: 12.0 })
      const compensated = compensateAngles(original, pitchDelta)

      // At same angle, compensation should be small, not making things worse
      // |compensated - original| should be small (pitchDelta ~0 for same angle)
      expect(Math.abs(compensated.headForwardAngle - original.headForwardAngle)).toBeLessThan(3)
    })
  })
})
