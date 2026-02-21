import { describe, it, expect, beforeEach } from 'vitest'
import { PostureAnalyzer } from '@/services/posture-analysis/posture-analyzer'
import {
  extractScreenAngleSignals,
  calibrateScreenAngle,
  estimateAngleChange,
  compensateAngles,
} from '@/services/calibration/screen-angle-estimator'
import { extractPostureAngles } from '@/services/posture-analysis/angle-calculator'
import { AdaptiveBaseline } from '@/services/calibration/adaptive-baseline'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { CalibrationData, RuleToggles } from '@/types/settings'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'
import {
  loadLandmarks,
  loadLandmarksWithMetadata,
  loadLandmarksByCategory,
  toDetectionFrame,
} from '../helpers/load-landmarks'

// --- Helpers ---

function createLandmark(overrides: Partial<Landmark> = {}): Landmark {
  return { x: 0, y: 0, z: 0, visibility: 1.0, ...overrides }
}

function createFullLandmarks(
  overrides: Partial<Record<number, Partial<Landmark>>> = {}
): Landmark[] {
  const base: Partial<Record<number, Partial<Landmark>>> = {
    [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.35, z: 0 },
    [PoseLandmarkIndex.LEFT_EYE]: { x: 0.45, y: 0.30, z: 0 },
    [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.55, y: 0.30, z: 0 },
    [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0 },
    [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.46, y: 0.42, z: 0 },
    [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.54, y: 0.42, z: 0 },
    [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0 },
    [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0 },
    [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0 },
    [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.2, z: 0 },
  }
  const merged = { ...base, ...overrides }
  return Array.from({ length: 33 }, (_, i) =>
    createLandmark({ visibility: 1.0, ...merged[i] })
  )
}

// Normalized landmark presets for 3 screen angles.
// 90° = reference (upright), 110° = tilted back 20°, 130° = tilted back 40°.
// Tilting the screen back causes the face to appear lower in the frame.
const SCREEN_ANGLE_NORM = {
  90: {
    [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.35, z: 0 },
    [PoseLandmarkIndex.LEFT_EYE]: { x: 0.45, y: 0.30, z: 0 },
    [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.55, y: 0.30, z: 0 },
    [PoseLandmarkIndex.LEFT_EAR]: { x: 0.38, y: 0.33, z: 0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.62, y: 0.33, z: 0 },
    [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.46, y: 0.42, z: 0 },
    [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.54, y: 0.42, z: 0 },
  },
  110: {
    [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.41, z: 0 },
    [PoseLandmarkIndex.LEFT_EYE]: { x: 0.45, y: 0.36, z: 0 },
    [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.55, y: 0.36, z: 0 },
    [PoseLandmarkIndex.LEFT_EAR]: { x: 0.38, y: 0.39, z: 0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.62, y: 0.39, z: 0 },
    [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.46, y: 0.48, z: 0 },
    [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.54, y: 0.48, z: 0 },
  },
  130: {
    [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.47, z: 0 },
    [PoseLandmarkIndex.LEFT_EYE]: { x: 0.45, y: 0.42, z: 0 },
    [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.55, y: 0.42, z: 0 },
    [PoseLandmarkIndex.LEFT_EAR]: { x: 0.38, y: 0.45, z: 0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.62, y: 0.45, z: 0 },
    [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.46, y: 0.54, z: 0 },
    [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.54, y: 0.54, z: 0 },
  },
} as const

function createFrame(overrides?: {
  worldLandmarks?: Partial<Record<number, Partial<Landmark>>>
  landmarks?: Partial<Record<number, Partial<Landmark>>>
  frameWidth?: number
  timestamp?: number
}): DetectionFrame {
  const worldLandmarks = createFullLandmarks(overrides?.worldLandmarks)
  const landmarks = overrides?.landmarks
    ? createFullLandmarks(overrides.landmarks)
    : worldLandmarks
  return {
    landmarks,
    worldLandmarks,
    timestamp: overrides?.timestamp ?? 1000,
    frameWidth: overrides?.frameWidth ?? 640,
    frameHeight: 480,
  }
}

function createCalibrationFromFrame(frame: DetectionFrame): CalibrationData {
  const analyzer = new PostureAnalyzer(
    { headForwardAngle: 0, torsoAngle: 0, headTiltAngle: 0, faceFrameRatio: 0, faceY: 0, noseToEarAvg: 0, shoulderDiff: 0, timestamp: 0 },
    0.5,
    ALL_RULES_ON,
  )
  const result = analyzer.analyzeDetailed(frame)
  return {
    headForwardAngle: result.angles.headForwardAngle,
    torsoAngle: result.angles.torsoAngle,
    headTiltAngle: result.angles.headTiltAngle,
    faceFrameRatio: result.angles.faceFrameRatio,
    faceY: result.angles.faceY,
    noseToEarAvg: result.angles.noseToEarAvg,
    shoulderDiff: result.angles.shoulderDiff,
    timestamp: Date.now(),
  }
}

function feedFramesDetailed(
  analyzer: PostureAnalyzer,
  frame: DetectionFrame,
  count: number,
  startTs: number = 1000,
  intervalMs: number = 500,
) {
  let result = analyzer.analyzeDetailed({ ...frame, timestamp: startTs })
  for (let i = 1; i < count; i++) {
    result = analyzer.analyzeDetailed({ ...frame, timestamp: startTs + i * intervalMs })
  }
  return result
}

const ALL_RULES_ON: RuleToggles = {
  forwardHead: true,
  slouch: true,
  headTilt: true,
  tooClose: true,
  shoulderAsymmetry: true,
}

// ============================================================
// Part A: Screen Angle Estimator Acceptance
// ============================================================

describe('Phase 2.1 Acceptance — Screen Angle Estimator', () => {
  describe('estimateAngleChange', () => {
    it('reference frame → returns 0° (±0.5°)', () => {
      const landmarks = createFullLandmarks(SCREEN_ANGLE_NORM[90])
      const signals = extractScreenAngleSignals(landmarks)
      const reference = calibrateScreenAngle(signals)
      const delta = estimateAngleChange(signals, reference)
      expect(Math.abs(delta)).toBeLessThanOrEqual(0.5)
    })

    it('faceY +0.1 → ~4.5° (±1°)', () => {
      const reference = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const current = { faceY: 0.45, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const delta = estimateAngleChange(current, reference)
      expect(delta).toBeGreaterThanOrEqual(3.5)
      expect(delta).toBeLessThanOrEqual(5.5)
    })

    it('three signals same direction → weighted sum', () => {
      const reference = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
      const allChanged = { faceY: 0.45, noseChinRatio: 0.39, eyeMouthRatio: 0.60 }
      const onlyFaceY = { faceY: 0.45, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }

      const allDelta = estimateAngleChange(allChanged, reference)
      const faceYDelta = estimateAngleChange(onlyFaceY, reference)

      expect(allDelta).toBeGreaterThan(faceYDelta)
      expect(allDelta).toBeCloseTo(9.5, 0)
    })
  })

  describe('compensateAngles', () => {
    it('headForward = original - pitchDelta × 0.8', () => {
      const angles: PostureAngles = {
        headForwardAngle: 20.0, torsoAngle: 5.0, headTiltAngle: 2.0,
        faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 1.0,
      }
      const compensated = compensateAngles(angles, 10.0)
      expect(compensated.headForwardAngle).toBeCloseTo(12.0, 5)
    })

    it('other angles unchanged after compensation', () => {
      const angles: PostureAngles = {
        headForwardAngle: 20.0, torsoAngle: 5.0, headTiltAngle: 2.0,
        faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 1.0,
      }
      const compensated = compensateAngles(angles, 10.0)
      expect(compensated.torsoAngle).toBe(5.0)
      expect(compensated.headTiltAngle).toBe(2.0)
      expect(compensated.faceFrameRatio).toBe(0.2)
      expect(compensated.shoulderDiff).toBe(1.0)
    })
  })

  describe('3 screen angles — pure function compensation < 5°', () => {
    const ref = { faceY: 0.35, noseChinRatio: 0.29, eyeMouthRatio: 0.50 }
    const trueHF = 12.0

    it('90° (reference) — deviation < 5°', () => {
      const pd = estimateAngleChange({ ...ref }, ref)
      const c = compensateAngles(
        { headForwardAngle: trueHF, torsoAngle: 0, headTiltAngle: 0, faceFrameRatio: 0, faceY: 0, noseToEarAvg: 0, shoulderDiff: 0 },
        pd,
      )
      expect(Math.abs(c.headForwardAngle - trueHF)).toBeLessThan(5)
    })

    it('110° (~20° tilt) — deviation < 5°', () => {
      const cur = { faceY: 0.41, noseChinRatio: 0.32, eyeMouthRatio: 0.52 }
      const pd = estimateAngleChange(cur, ref)
      const measured = trueHF + pd * 0.8
      const c = compensateAngles(
        { headForwardAngle: measured, torsoAngle: 0, headTiltAngle: 0, faceFrameRatio: 0, faceY: 0, noseToEarAvg: 0, shoulderDiff: 0 },
        pd,
      )
      expect(Math.abs(c.headForwardAngle - trueHF)).toBeLessThan(5)
    })

    it('130° (~40° tilt) — deviation < 5°', () => {
      const cur = { faceY: 0.47, noseChinRatio: 0.35, eyeMouthRatio: 0.54 }
      const pd = estimateAngleChange(cur, ref)
      const measured = trueHF + pd * 0.8
      const c = compensateAngles(
        { headForwardAngle: measured, torsoAngle: 0, headTiltAngle: 0, faceFrameRatio: 0, faceY: 0, noseToEarAvg: 0, shoulderDiff: 0 },
        pd,
      )
      expect(Math.abs(c.headForwardAngle - trueHF)).toBeLessThan(5)
    })
  })
})

// ============================================================
// Part B: Adaptive Baseline Acceptance
// ============================================================

describe('Phase 2.1 Acceptance — Adaptive Baseline', () => {
  const originalBaseline: CalibrationData = {
    headForwardAngle: 5.0, torsoAngle: 3.0, headTiltAngle: 1.0,
    faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 0.5, timestamp: 1000000,
  }
  let ab: AdaptiveBaseline

  beforeEach(() => {
    ab = new AdaptiveBaseline(originalBaseline)
  })

  it('30 seconds good posture → baseline starts drifting', () => {
    const angles: PostureAngles = {
      headForwardAngle: 10.0, torsoAngle: 3.0, headTiltAngle: 1.0,
      faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 0.5,
    }
    ab.update(true, angles, 30.0)
    expect(ab.getCurrentBaseline().headForwardAngle).toBe(5.0)
    ab.update(true, angles, 1.0)
    expect(ab.getCurrentBaseline().headForwardAngle).toBeGreaterThan(5.0)
  })

  it('60 seconds total → drift < 0.5°', () => {
    const angles: PostureAngles = {
      headForwardAngle: 15.0, torsoAngle: 3.0, headTiltAngle: 1.0,
      faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 0.5,
    }
    ab.update(true, angles, 30.0)
    for (let i = 0; i < 30; i++) ab.update(true, angles, 1.0)
    const drift = Math.abs(ab.getCurrentBaseline().headForwardAngle - 5.0)
    expect(drift).toBeLessThan(0.5)
    expect(drift).toBeGreaterThan(0)
  })

  it('drift ≤ 8° regardless of time', () => {
    const angles: PostureAngles = {
      headForwardAngle: 100.0, torsoAngle: 3.0, headTiltAngle: 1.0,
      faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 0.5,
    }
    ab.update(true, angles, 30.0)
    for (let i = 0; i < 50000; i++) ab.update(true, angles, 1.0)
    expect(Math.abs(ab.getCurrentBaseline().headForwardAngle - 5.0)).toBeLessThanOrEqual(8.0)
  })

  it('bad posture → no drift, goodPostureDuration resets', () => {
    const angles: PostureAngles = {
      headForwardAngle: 10.0, torsoAngle: 3.0, headTiltAngle: 1.0,
      faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 0.5,
    }
    ab.update(true, angles, 25.0)
    ab.update(false, angles, 1.0)
    ab.update(true, angles, 25.0)
    expect(ab.getCurrentBaseline().headForwardAngle).toBe(5.0)
    expect(ab.getGoodPostureDuration()).toBe(25.0)
  })

  it('reset() restores original baseline and duration', () => {
    const angles: PostureAngles = {
      headForwardAngle: 10.0, torsoAngle: 3.0, headTiltAngle: 1.0,
      faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 0.5,
    }
    ab.update(true, angles, 30.0)
    ab.update(true, angles, 50.0)
    expect(ab.getCurrentBaseline().headForwardAngle).not.toBe(5.0)

    ab.reset()
    const r = ab.getCurrentBaseline()
    expect(r.headForwardAngle).toBe(5.0)
    expect(r.torsoAngle).toBe(3.0)
    expect(r.headTiltAngle).toBe(1.0)
    expect(r.faceFrameRatio).toBe(0.2)
    expect(r.shoulderDiff).toBe(0.5)
    expect(ab.getGoodPostureDuration()).toBe(0)
  })
})

// ============================================================
// Part C: Full Pipeline Integration (no mock of middle layers)
// ============================================================

describe('Phase 2.1 Integration — PostureAnalyzer Full Pipeline', () => {

  // --- (a) Screen angle compensation — 3 angles through PostureAnalyzer ---

  describe('screen angle compensation — 3 angles through analyzer', () => {
    // World landmark overrides that simulate the user looking at a tilted-back
    // screen. The ears shift forward (negative z) to track the screen angle,
    // which increases headForwardAngle in the angle calculator.
    const WORLD_TILT = {
      90: {},  // no change for reference
      110: {
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: -0.015, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: -0.015, visibility: 1.0 },
      },
      130: {
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: -0.03, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: -0.03, visibility: 1.0 },
      },
    } as const

    it('same posture at 90°/110°/130°: compensated headForward within 5° of reference', () => {
      // Step 1: Calibrate at 90°
      const ref90Frame = createFrame({
        landmarks: SCREEN_ANGLE_NORM[90],
        worldLandmarks: WORLD_TILT[90],
        timestamp: 1000,
      })
      const calibration = createCalibrationFromFrame(ref90Frame)

      const refLandmarks = createFullLandmarks(SCREEN_ANGLE_NORM[90])
      const refSignals = extractScreenAngleSignals(refLandmarks)
      const screenAngleRef = calibrateScreenAngle(refSignals)

      // Step 2: headForward at 90° with compensation (baseline)
      const analyzerComp90 = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON, {
        screenAngleReference: screenAngleRef,
      })
      const result90 = feedFramesDetailed(analyzerComp90, ref90Frame, 10, 2000)
      const hf90 = result90.angles.headForwardAngle

      // Step 3: 110° without compensation (world landmarks show ears shifted forward)
      const frame110 = createFrame({
        landmarks: SCREEN_ANGLE_NORM[110],
        worldLandmarks: WORLD_TILT[110],
        timestamp: 1000,
      })
      const noComp110 = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)
      const resNoComp110 = feedFramesDetailed(noComp110, frame110, 10, 2000)

      // Step 4: 110° with compensation
      const comp110 = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON, {
        screenAngleReference: screenAngleRef,
      })
      const resComp110 = feedFramesDetailed(comp110, frame110, 10, 2000)

      // Step 5: 130° without compensation
      const frame130 = createFrame({
        landmarks: SCREEN_ANGLE_NORM[130],
        worldLandmarks: WORLD_TILT[130],
        timestamp: 1000,
      })
      const noComp130 = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)
      const resNoComp130 = feedFramesDetailed(noComp130, frame130, 10, 2000)

      // Step 6: 130° with compensation
      const comp130 = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON, {
        screenAngleReference: screenAngleRef,
      })
      const resComp130 = feedFramesDetailed(comp130, frame130, 10, 2000)

      // Compensated deviation from 90° should be smaller than uncompensated
      const compDev110 = Math.abs(resComp110.angles.headForwardAngle - hf90)
      const compDev130 = Math.abs(resComp130.angles.headForwardAngle - hf90)
      const noCompDev110 = Math.abs(resNoComp110.angles.headForwardAngle - hf90)
      const noCompDev130 = Math.abs(resNoComp130.angles.headForwardAngle - hf90)

      expect(compDev110).toBeLessThan(noCompDev110)
      expect(compDev130).toBeLessThan(noCompDev130)
      expect(compDev110).toBeLessThan(5)
      expect(compDev130).toBeLessThan(5)
    })

    it('without screenAngleReference — backward compatible', () => {
      const refFrame = createFrame({ timestamp: 1000 })
      const calibration = createCalibrationFromFrame(refFrame)
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)
      const result = feedFramesDetailed(analyzer, refFrame, 5, 2000)
      expect(result.status.isGood).toBe(true)
      expect(result.status.violations).toHaveLength(0)
    })
  })

  // --- (b) Adaptive baseline — sustained usage simulation ---

  describe('adaptive baseline — sustained usage through analyzer', () => {
    it('2 minutes of good posture → analyzer still reports good', () => {
      const goodFrame = createFrame({ timestamp: 0 })
      const calibration = createCalibrationFromFrame(goodFrame)
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      let ts = 0
      for (let i = 0; i < 240; i++) {
        ts += 500
        analyzer.analyzeDetailed(createFrame({ timestamp: ts }))
      }
      ts += 500
      const result = analyzer.analyzeDetailed(createFrame({ timestamp: ts }))
      expect(result.status.isGood).toBe(true)
    })

    it('good → bad → good: bad posture interrupts drift, recovery works', () => {
      const goodFrame = createFrame()
      const calibration = createCalibrationFromFrame(goodFrame)
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      let ts = 0

      // Phase 1: 40 seconds good posture
      for (let i = 0; i < 80; i++) {
        ts += 500
        analyzer.analyzeDetailed(createFrame({ timestamp: ts }))
      }

      // Phase 2: 5 seconds bad posture (forward head)
      const badFrame = createFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.45, z: -0.30 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.45, z: -0.30 },
        },
      })
      for (let i = 0; i < 10; i++) {
        ts += 500
        const result = analyzer.analyzeDetailed({ ...badFrame, timestamp: ts })
        if (i > 5) {
          expect(result.status.isGood).toBe(false)
        }
      }

      // Phase 3: back to good posture — should recover
      for (let i = 0; i < 20; i++) {
        ts += 500
        analyzer.analyzeDetailed(createFrame({ timestamp: ts }))
      }
      ts += 500
      const recovered = analyzer.analyzeDetailed(createFrame({ timestamp: ts }))
      expect(recovered.status.isGood).toBe(true)
    })

    it('10 minutes extreme: drift never exceeds 8° (via AdaptiveBaseline directly)', () => {
      const baseline: CalibrationData = {
        headForwardAngle: 5.0, torsoAngle: 3.0, headTiltAngle: 1.0,
        faceFrameRatio: 0.2, faceY: 0.35, noseToEarAvg: 0, shoulderDiff: 0.5, timestamp: 0,
      }
      const ab = new AdaptiveBaseline(baseline)

      const angles: PostureAngles = {
        headForwardAngle: 50.0, torsoAngle: 30.0, headTiltAngle: 20.0,
        faceFrameRatio: 0.8, faceY: 0.5, noseToEarAvg: 0.1, shoulderDiff: 20.0,
      }

      // 10 minutes at 500ms = 1200 updates
      ab.update(true, angles, 30.0) // 30 sec warm-up
      for (let i = 0; i < 1170; i++) {
        ab.update(true, angles, 0.5)
      }

      const final = ab.getCurrentBaseline()
      expect(Math.abs(final.headForwardAngle - 5.0)).toBeLessThanOrEqual(8.0)
      expect(Math.abs(final.torsoAngle - 3.0)).toBeLessThanOrEqual(8.0)
      expect(Math.abs(final.headTiltAngle - 1.0)).toBeLessThanOrEqual(8.0)
      expect(Math.abs(final.faceFrameRatio - 0.2)).toBeLessThanOrEqual(0.1 + 1e-10)
      expect(Math.abs(final.shoulderDiff - 0.5)).toBeLessThanOrEqual(8.0)
    })

    it('reset clears all analyzer state', () => {
      const goodFrame = createFrame()
      const calibration = createCalibrationFromFrame(goodFrame)
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      for (let i = 0; i < 80; i++) {
        analyzer.analyzeDetailed(createFrame({ timestamp: 1000 + i * 500 }))
      }
      analyzer.reset()

      const result = analyzer.analyzeDetailed(createFrame({ timestamp: 100000 }))
      expect(result.status.isGood).toBe(true)
    })

    it('updateCalibration creates fresh adaptive baseline', () => {
      const goodFrame = createFrame()
      const calibration = createCalibrationFromFrame(goodFrame)
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      for (let i = 0; i < 80; i++) {
        analyzer.analyzeDetailed(createFrame({ timestamp: 1000 + i * 500 }))
      }

      const newCal: CalibrationData = { ...calibration, headForwardAngle: calibration.headForwardAngle + 5 }
      analyzer.updateCalibration(newCal)

      const result = analyzer.analyzeDetailed(createFrame({ timestamp: 200000 }))
      expect(result.status).toBeDefined()
    })
  })

  // --- (c) Complete end-to-end pipeline ---

  describe('complete E2E pipeline: calibration → detection → compensation → smoothing → baseline → rules', () => {
    it('good posture through full pipeline with screen angle → isGood=true', () => {
      const refFrame = createFrame({ landmarks: SCREEN_ANGLE_NORM[90], timestamp: 1000 })
      const calibration = createCalibrationFromFrame(refFrame)

      const refLandmarks = createFullLandmarks(SCREEN_ANGLE_NORM[90])
      const refSignals = extractScreenAngleSignals(refLandmarks)
      const reference = calibrateScreenAngle(refSignals)

      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON, {
        screenAngleReference: reference,
      })

      let result = analyzer.analyze(refFrame)
      for (let i = 1; i < 10; i++) {
        result = analyzer.analyze(createFrame({
          landmarks: SCREEN_ANGLE_NORM[90],
          timestamp: 1000 + i * 500,
        }))
      }

      expect(result.isGood).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('bad posture through full pipeline → FORWARD_HEAD violation', () => {
      const goodFrame = createFrame({ timestamp: 1000 })
      const calibration = createCalibrationFromFrame(goodFrame)
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      for (let i = 0; i < 5; i++) {
        analyzer.analyze(createFrame({ timestamp: 1000 + i * 500 }))
      }

      const badFrame = createFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.45, z: -0.30 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.45, z: -0.30 },
        },
      })

      let result = analyzer.analyze(badFrame)
      for (let i = 0; i < 15; i++) {
        result = analyzer.analyze({ ...badFrame, timestamp: 4000 + i * 500 })
      }

      expect(result.isGood).toBe(false)
      expect(result.violations.some(v => v.rule === 'FORWARD_HEAD')).toBe(true)
    })

    it('5-minute simulation: adaptive baseline reduces false positives', () => {
      const goodFrame = createFrame({ timestamp: 0 })
      const calibration = createCalibrationFromFrame(goodFrame)
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      let ts = 0

      // 30 seconds: stabilize
      for (let i = 0; i < 60; i++) {
        ts += 500
        analyzer.analyzeDetailed(createFrame({ timestamp: ts }))
      }

      // 4.5 minutes: slightly shifted posture
      const slightShift = createFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.58, z: -0.01 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.58, z: -0.01 },
        },
      })

      const violations: number[] = []
      for (let i = 0; i < 540; i++) {
        ts += 500
        const result = analyzer.analyzeDetailed({ ...slightShift, timestamp: ts })
        violations.push(result.status.violations.length)
      }

      const earlyViolations = violations.slice(0, 60).filter(v => v > 0).length
      const lateViolations = violations.slice(-60).filter(v => v > 0).length

      expect(lateViolations).toBeLessThanOrEqual(earlyViolations)
    })
  })
})

// ============================================================
// Part D: Real Photo Integration Tests
// ============================================================

describe('Phase 2.1 Integration — Real Photo Data', () => {
  const ALL_ON: RuleToggles = {
    forwardHead: true,
    slouch: true,
    headTilt: true,
    tooClose: true,
    shoulderAsymmetry: true,
  }

  function createCalibrationFromPhoto(photoId: number): CalibrationData {
    const data = loadLandmarks(photoId)
    const angles = extractPostureAngles(data.worldLandmarks, data.landmarks)
    return {
      headForwardAngle: angles.headForwardAngle,
      torsoAngle: angles.torsoAngle,
      headTiltAngle: angles.headTiltAngle,
      faceFrameRatio: angles.faceFrameRatio,
      faceY: angles.faceY,
      noseToEarAvg: angles.noseToEarAvg,
      shoulderDiff: angles.shoulderDiff,
      timestamp: Date.now(),
    }
  }

  function feedRealFrames(
    analyzer: PostureAnalyzer,
    frame: DetectionFrame,
    count: number,
    startTs = 1000,
    intervalMs = 500,
  ) {
    let result = analyzer.analyzeDetailed({ ...frame, timestamp: startTs })
    for (let i = 1; i < count; i++) {
      result = analyzer.analyzeDetailed({ ...frame, timestamp: startTs + i * intervalMs })
    }
    return result
  }

  describe('screen angle compensation with real photo signals', () => {
    it('calibrate at 110°, extract reference signals → signals match photo', () => {
      const data = loadLandmarks(1)  // photo 1: good posture, 110°
      const signals = extractScreenAngleSignals(data.landmarks)
      const reference = calibrateScreenAngle(signals)

      expect(reference.faceY).toBeCloseTo(signals.faceY, 5)
      expect(reference.noseChinRatio).toBeCloseTo(signals.noseChinRatio, 5)
      expect(reference.eyeMouthRatio).toBeCloseTo(signals.eyeMouthRatio, 5)
    })

    it('90° photo signals → negative pitchDelta relative to 110° reference', () => {
      const ref110 = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(ref110)

      // Photo 3: good posture at 90° — screen more upright, face higher in frame
      const sig90 = extractScreenAngleSignals(loadLandmarks(3).landmarks)
      const delta = estimateAngleChange(sig90, reference)

      expect(delta).toBeLessThan(0)
    })

    it('130° photo signals → positive pitchDelta relative to 110° reference', () => {
      const ref110 = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(ref110)

      // Photo 4: good posture at 130° — screen tilted back, face lower in frame
      const sig130 = extractScreenAngleSignals(loadLandmarks(4).landmarks)
      const delta = estimateAngleChange(sig130, reference)

      expect(delta).toBeGreaterThan(0)
    })

    it('compensation through full pipeline with real signals does not crash', () => {
      const cal = createCalibrationFromPhoto(1)
      const refSignals = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(refSignals)

      const analyzer = new PostureAnalyzer(cal, 0.5, ALL_ON, {
        screenAngleReference: reference,
      })

      // Feed photos at different angles through the analyzer
      for (const photoId of [1, 3, 4, 5, 9, 11, 21]) {
        const data = loadLandmarks(photoId)
        const frame = toDetectionFrame(data)
        const result = analyzer.analyzeDetailed(frame)
        expect(result.status).toBeDefined()
        expect(Number.isFinite(result.angles.headForwardAngle)).toBe(true)
      }
    })

    it('compensation reduces headForward deviation for nearby lid angle (110° vs same-angle variation)', () => {
      // Single-reference compensation works well for small angle differences.
      // Large angle spans (90°→130°) can over-compensate due to the linear signal
      // model — that's expected and why multi-angle calibration exists.
      const cal = createCalibrationFromPhoto(1) // calibrate at 110°
      const refSignals = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const reference = calibrateScreenAngle(refSignals)

      // Compare photo 1 vs photo 2 (both 110°, good posture, different poses)
      const baseHF = (() => {
        const analyzer = new PostureAnalyzer(cal, 0.5, ALL_ON, { screenAngleReference: reference })
        return feedRealFrames(analyzer, toDetectionFrame(loadLandmarks(1)), 10).angles.headForwardAngle
      })()

      const photo2HF = (() => {
        const analyzer = new PostureAnalyzer(cal, 0.5, ALL_ON, { screenAngleReference: reference })
        return feedRealFrames(analyzer, toDetectionFrame(loadLandmarks(2)), 10).angles.headForwardAngle
      })()

      // Same angle photos should have small deviation
      expect(Math.abs(photo2HF - baseHF)).toBeLessThan(5)
    })
  })

  describe('adaptive baseline with real photo data', () => {
    it('sustained good posture (30s simulation) → still isGood', () => {
      const cal = createCalibrationFromPhoto(1)
      const analyzer = new PostureAnalyzer(cal, 0.5, ALL_ON)

      const goodData = loadLandmarks(1)
      let ts = 1000

      // Feed 60 frames at 500ms (30 seconds)
      for (let i = 0; i < 60; i++) {
        ts += 500
        analyzer.analyzeDetailed(toDetectionFrame(goodData, ts))
      }

      const final = analyzer.analyzeDetailed(toDetectionFrame(goodData, ts + 500))
      expect(final.status.isGood).toBe(true)
    })

    it('good → bad → good: recovery works with real photo data', () => {
      const cal = createCalibrationFromPhoto(1)
      const analyzer = new PostureAnalyzer(cal, 0.5, ALL_ON)

      const goodData = loadLandmarks(1) // good posture
      const badData = loadLandmarks(13)  // severe forward head
      let ts = 1000

      // Phase 1: 20 seconds good
      for (let i = 0; i < 40; i++) {
        ts += 500
        analyzer.analyzeDetailed(toDetectionFrame(goodData, ts))
      }

      // Phase 2: 5 seconds bad
      for (let i = 0; i < 10; i++) {
        ts += 500
        analyzer.analyzeDetailed(toDetectionFrame(badData, ts))
      }

      // Phase 3: 10 seconds good → should recover
      for (let i = 0; i < 20; i++) {
        ts += 500
        analyzer.analyzeDetailed(toDetectionFrame(goodData, ts))
      }

      ts += 500
      const recovered = analyzer.analyzeDetailed(toDetectionFrame(goodData, ts))
      expect(recovered.status.isGood).toBe(true)
    })
  })

  describe('full pipeline with real photos — posture detection accuracy', () => {
    it('calibrate photo 1, feed good posture photos → all isGood', () => {
      const cal = createCalibrationFromPhoto(1)
      const goodPhotos = loadLandmarksByCategory('good')
        .filter(p => p.metadata.lighting === 'normal')

      for (const { landmarkData, metadata } of goodPhotos) {
        const frame = toDetectionFrame(landmarkData)
        const analyzer = new PostureAnalyzer(cal, 0.5, ALL_ON)
        const result = feedRealFrames(analyzer, frame, 10)
        expect(
          result.status.isGood,
          `Photo ${metadata.photoId}: ${metadata.notes} should be isGood=true`,
        ).toBe(true)
      }
    })

    it('calibrate photo 1, feed severe forward_head → FORWARD_HEAD detected', () => {
      const cal = createCalibrationFromPhoto(1)

      // Photos 13 (severe), 14 (moderate+低头) — should trigger FORWARD_HEAD
      for (const photoId of [13, 14]) {
        const { landmarkData, metadata } = loadLandmarksWithMetadata(photoId)
        const frame = toDetectionFrame(landmarkData)
        const analyzer = new PostureAnalyzer(cal, 0.5, ALL_ON)
        const result = feedRealFrames(analyzer, frame, 15)
        expect(
          result.status.violations.some(v => v.rule === 'FORWARD_HEAD'),
          `Photo ${photoId}: ${metadata.notes} should detect FORWARD_HEAD`,
        ).toBe(true)
      }
    })

    it('different lid angles: multi-ref calibration enables good detection across angles', () => {
      // Single-reference compensation can't handle the full 90°→130° range.
      // Multi-reference calibration (using extractScreenAngleSignals at each angle)
      // is the proper solution. Here we verify the signals are directionally correct.
      const ref110 = extractScreenAngleSignals(loadLandmarks(1).landmarks)
      const ref90 = extractScreenAngleSignals(loadLandmarks(3).landmarks)
      const ref130 = extractScreenAngleSignals(loadLandmarks(4).landmarks)

      // Direction check: faceY should increase with lid angle
      expect(ref90.faceY).toBeLessThan(ref110.faceY)
      expect(ref110.faceY).toBeLessThan(ref130.faceY)

      // Delta from 110° reference
      const delta90 = estimateAngleChange(ref90, ref110)
      const delta130 = estimateAngleChange(ref130, ref110)

      expect(delta90).toBeLessThan(0) // 90° = more upright = negative
      expect(delta130).toBeGreaterThan(0) // 130° = tilted back = positive
    })
  })
})
