import { describe, it, expect, beforeEach } from 'vitest'
import { PostureAnalyzer } from '@/services/posture-analysis/posture-analyzer'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { CalibrationData, RuleToggles } from '@/types/settings'
import { extractPostureAngles } from '@/services/posture-analysis/angle-calculator'
import {
  loadLandmarks,
  loadLandmarksWithMetadata,
  loadLandmarksByCategory,
  toDetectionFrame,
} from '../../../helpers/load-landmarks'

// --- Helpers ---

function createMockFrame(overrides?: {
  worldLandmarks?: Partial<Record<number, Partial<Landmark>>>
  normalizedLandmarks?: Partial<Record<number, Partial<Landmark>>>
  frameWidth?: number
  timestamp?: number
}): DetectionFrame {
  const defaultLandmark: Landmark = { x: 0, y: 0, z: 0, visibility: 1.0 }

  // "Good posture": ear directly above shoulder, shoulder directly above hip
  const goodPosture: Partial<Record<number, Partial<Landmark>>> = {
    [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.2, z: 0, visibility: 1.0 },
  }

  // Default normalized landmarks with ears in [0,1] range for faceToFrameRatio
  // In MediaPipe non-mirrored output: person's left ear → higher x (right side of frame)
  const defaultNormalized: Partial<Record<number, Partial<Landmark>>> = {
    [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.4, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_EYE]: { x: 0.54, y: 0.35, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.46, y: 0.35, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_EAR]: { x: 0.58, y: 0.4, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.42, y: 0.4, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.53, y: 0.45, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.47, y: 0.45, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_SHOULDER]: { x: 0.65, y: 0.55, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.35, y: 0.55, z: 0, visibility: 1.0 },
  }

  const worldMerged = { ...goodPosture, ...overrides?.worldLandmarks }
  const worldLandmarks = Array.from({ length: 33 }, (_, i) => ({
    ...defaultLandmark,
    ...worldMerged[i],
  }))

  const normMerged = { ...defaultNormalized, ...overrides?.normalizedLandmarks }
  const landmarks = Array.from({ length: 33 }, (_, i) => ({
    ...defaultLandmark,
    ...normMerged[i],
  }))

  // Copy visibility from world landmarks to normalized landmarks
  for (const idx of [
    PoseLandmarkIndex.LEFT_EAR,
    PoseLandmarkIndex.RIGHT_EAR,
    PoseLandmarkIndex.LEFT_SHOULDER,
    PoseLandmarkIndex.RIGHT_SHOULDER,
    PoseLandmarkIndex.LEFT_HIP,
    PoseLandmarkIndex.RIGHT_HIP,
  ]) {
    landmarks[idx] = { ...landmarks[idx], visibility: worldLandmarks[idx].visibility }
  }

  return {
    landmarks,
    worldLandmarks,
    timestamp: overrides?.timestamp ?? Date.now(),
    frameWidth: overrides?.frameWidth ?? 640,
    frameHeight: 480,
  }
}

// Calibration data matching "good posture" from createMockFrame
function createGoodCalibration(): CalibrationData {
  return {
    headForwardAngle: 0,
    torsoAngle: 0,
    headTiltAngle: 0,
    faceFrameRatio: 0.16, // |0.42 - 0.58| from normalized landmarks
    faceY: 0.4,           // NOSE.y from normalized landmarks
    noseToEarAvg: 0.08,   // avg(|nose-leftEar|, |nose-rightEar|) = avg(0.08, 0.08)
    shoulderDiff: 0,
    timestamp: Date.now(),
  }
}

const ALL_RULES_ON: RuleToggles = {
  forwardHead: true,
  slouch: true,
  headTilt: true,
  tooClose: true,
  shoulderAsymmetry: true,
}

// Feed multiple identical frames to stabilize the EMA filter
function feedFrames(
  analyzer: PostureAnalyzer,
  frame: DetectionFrame,
  count: number
) {
  let lastResult = analyzer.analyze(frame)
  for (let i = 1; i < count; i++) {
    lastResult = analyzer.analyze(frame)
  }
  return lastResult
}

// --- Tests ---

describe('PostureAnalyzer', () => {
  let calibration: CalibrationData
  let analyzer: PostureAnalyzer

  beforeEach(() => {
    calibration = createGoodCalibration()
    analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)
  })

  describe('constructor', () => {
    it('creates an instance without throwing', () => {
      expect(analyzer).toBeInstanceOf(PostureAnalyzer)
    })
  })

  describe('good posture → isGood=true', () => {
    it('returns isGood=true for good posture frame', () => {
      const frame = createMockFrame()
      // Feed several frames so EMA stabilizes
      const result = feedFrames(analyzer, frame, 5)
      expect(result.isGood).toBe(true)
      expect(result.violations).toHaveLength(0)
      expect(result.confidence).toBeGreaterThan(0.5)
    })
  })

  describe('bad posture → isGood=false with correct violations', () => {
    it('detects forward head', () => {
      // Head moved forward (z negative = toward camera) with reduced y (tilted forward)
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.45, z: -0.30, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.45, z: -0.30, visibility: 1.0 },
        },
      })
      const result = feedFrames(analyzer, badFrame, 10)
      expect(result.isGood).toBe(false)
      expect(result.violations.some(v => v.rule === 'FORWARD_HEAD')).toBe(true)
    })

    it('detects slouch', () => {
      // Hip shifted forward (z positive) relative to shoulder → slouching torso
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.15, z: 0.35, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.15, z: 0.35, visibility: 1.0 },
        },
      })
      const result = feedFrames(analyzer, badFrame, 10)
      expect(result.isGood).toBe(false)
      expect(result.violations.some(v => v.rule === 'SLOUCH')).toBe(true)
    })

    it('detects head tilt', () => {
      // Left ear much lower than right ear
      // headTiltAngle now uses normalized landmarks
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.50, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.70, z: 0, visibility: 1.0 },
        },
        normalizedLandmarks: {
          // Left ear lower → leftEar.y > rightEar.y in normalized coords (y increases downward)
          [PoseLandmarkIndex.LEFT_EAR]: { x: 0.58, y: 0.50, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.42, y: 0.30, z: 0, visibility: 1.0 },
        },
      })
      const result = feedFrames(analyzer, badFrame, 10)
      expect(result.isGood).toBe(false)
      expect(result.violations.some(v => v.rule === 'HEAD_TILT')).toBe(true)
    })

    it('detects shoulder asymmetry', () => {
      // Left shoulder significantly lower than right
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.15, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.45, z: 0, visibility: 1.0 },
        },
      })
      const result = feedFrames(analyzer, badFrame, 10)
      expect(result.isGood).toBe(false)
      expect(result.violations.some(v => v.rule === 'SHOULDER_ASYMMETRY')).toBe(true)
    })
  })

  describe('multiple simultaneous violations', () => {
    it('detects FORWARD_HEAD and SLOUCH simultaneously', () => {
      const badFrame = createMockFrame({
        worldLandmarks: {
          // Head forward
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.45, z: -0.30, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.45, z: -0.30, visibility: 1.0 },
          // Slouching
          [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.15, z: 0.35, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.15, z: 0.35, visibility: 1.0 },
        },
      })
      const result = feedFrames(analyzer, badFrame, 10)
      expect(result.isGood).toBe(false)
      const ruleNames = result.violations.map(v => v.rule)
      expect(ruleNames).toContain('FORWARD_HEAD')
      expect(ruleNames).toContain('SLOUCH')
    })
  })

  describe('EMA smoothing — single spike does not trigger', () => {
    it('single bad frame among good frames does not trigger violation', () => {
      const goodFrame = createMockFrame()
      // Feed good frames to stabilize
      feedFrames(analyzer, goodFrame, 10)

      // Feed a single moderately bad frame (small forward lean, not extreme)
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.55, z: -0.12, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.55, z: -0.12, visibility: 1.0 },
        },
      })
      const afterSpike = analyzer.analyze(badFrame)

      // Due to EMA smoothing (alpha=0.3), single frame deviation is dampened:
      // smoothed = 0.3 * bad + 0.7 * good — stays below threshold
      expect(afterSpike.isGood).toBe(true)
    })

    it('consecutive bad frames eventually trigger violation', () => {
      const goodFrame = createMockFrame()
      feedFrames(analyzer, goodFrame, 10)

      // Feed many consecutive bad frames
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.45, z: -0.30, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.45, z: -0.30, visibility: 1.0 },
        },
      })
      const result = feedFrames(analyzer, badFrame, 20)
      expect(result.isGood).toBe(false)
      expect(result.violations.length).toBeGreaterThan(0)
    })
  })

  describe('low confidence frames', () => {
    it('discards frame when majority of critical landmarks have low visibility', () => {
      // 3 out of 4 critical landmarks (ears + shoulders) below 0.5 → discard
      const lowVisFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 0.2 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0, visibility: 0.3 },
          [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0, visibility: 0.3 },
          [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0, visibility: 0.9 },
        },
      })
      const result = analyzer.analyze(lowVisFrame)
      expect(result.isGood).toBe(true)
      expect(result.violations).toHaveLength(0)
      // Confidence is still computed: avg = (0.2 + 0.3 + 0.3 + 0.9) / 4 = 0.425
      expect(result.confidence).toBeLessThan(0.5)
    })

    it('does NOT discard frame when only one critical landmark has low visibility', () => {
      // 1 out of 4 critical landmarks below 0.5 → NOT discarded, analysis runs
      const frame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 0.3 },
          // rest default to 1.0
        },
      })
      const result = analyzer.analyzeDetailed(frame)
      // Frame should be analyzed (not discarded), so angles should be non-zero
      // (they come from the "good posture" default landmarks)
      const anglesSum = Math.abs(result.angles.headForwardAngle)
        + Math.abs(result.angles.headTiltAngle)
        + Math.abs(result.angles.faceFrameRatio)
        + Math.abs(result.angles.shoulderDiff)
      expect(anglesSum).toBeGreaterThan(0)
    })

    it('does NOT discard frame when hips have low visibility (hips not in critical set)', () => {
      // Hips are not critical landmarks — low hip visibility should not discard frame
      const frame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0, visibility: 0.1 },
          [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.2, z: 0, visibility: 0.1 },
        },
      })
      const result = analyzer.analyzeDetailed(frame)
      // Ears and shoulders are all visible (1.0), so frame should be analyzed
      const anglesSum = Math.abs(result.angles.headForwardAngle)
        + Math.abs(result.angles.headTiltAngle)
        + Math.abs(result.angles.faceFrameRatio)
        + Math.abs(result.angles.shoulderDiff)
      expect(anglesSum).toBeGreaterThan(0)
    })

    it('discards frame when all critical landmarks invisible', () => {
      const lowVisFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 0.1 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0, visibility: 0.1 },
          [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0, visibility: 0.1 },
          [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0, visibility: 0.1 },
        },
      })
      const result = analyzer.analyzeDetailed(lowVisFrame)
      // All 4 critical landmarks below 0.5 → frame discarded → zero angles
      expect(result.angles.headForwardAngle).toBe(0)
      expect(result.angles.headTiltAngle).toBe(0)
      expect(result.status.isGood).toBe(true)
      expect(result.status.violations).toHaveLength(0)
    })
  })

  describe('updateCalibration', () => {
    it('changes baseline for deviation calculation', () => {
      // Create an analyzer with calibration matching a forward-leaning pose
      // The mock frame with z=-0.15 produces ~37° headForward
      const forwardCalibration: CalibrationData = {
        headForwardAngle: 37,
        torsoAngle: 0,
        headTiltAngle: 0,
        faceFrameRatio: 0.16,
        faceY: 0.4,
        noseToEarAvg: 0.08,
        shoulderDiff: 0,
        timestamp: Date.now(),
      }
      analyzer.updateCalibration(forwardCalibration)
      analyzer.reset()

      // A frame that would be "bad" with zero calibration is now "good"
      // because the calibration baseline already accounts for the forward angle
      const frame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.50, z: -0.15, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.50, z: -0.15, visibility: 1.0 },
        },
      })
      const result = feedFrames(analyzer, frame, 10)
      // The forward head deviation should be reduced by the calibration offset
      expect(result.violations.filter(v => v.rule === 'FORWARD_HEAD').length).toBe(0)
    })
  })

  describe('updateSensitivity', () => {
    it('higher sensitivity makes detection more strict', () => {
      // A moderately bad frame
      const moderateFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.50, z: -0.15, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.50, z: -0.15, visibility: 1.0 },
        },
      })

      // At low sensitivity (0.1), thresholds are high → might not trigger
      analyzer.updateSensitivity(0.1)
      analyzer.reset()
      const lowSensResult = feedFrames(analyzer, moderateFrame, 10)

      // At high sensitivity (1.0), thresholds are low → should trigger
      analyzer.updateSensitivity(1.0)
      analyzer.reset()
      const highSensResult = feedFrames(analyzer, moderateFrame, 10)

      // High sensitivity should detect more or equal violations
      expect(highSensResult.violations.length).toBeGreaterThanOrEqual(
        lowSensResult.violations.length
      )
    })
  })

  describe('updateRuleToggles', () => {
    it('disabling a rule prevents its violation from appearing', () => {
      // Bad forward head frame
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.45, z: -0.30, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.45, z: -0.30, visibility: 1.0 },
        },
      })

      // First confirm it detects FORWARD_HEAD
      const result1 = feedFrames(analyzer, badFrame, 10)
      expect(result1.violations.some(v => v.rule === 'FORWARD_HEAD')).toBe(true)

      // Disable forward head rule (tooClose is treated as alias for forwardHead)
      analyzer.updateRuleToggles({
        ...ALL_RULES_ON,
        forwardHead: false,
        tooClose: false,
      })
      analyzer.reset()

      const result2 = feedFrames(analyzer, badFrame, 10)
      expect(result2.violations.some(v => v.rule === 'FORWARD_HEAD')).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears smoothing filter state', () => {
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.45, z: -0.30, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.45, z: -0.30, visibility: 1.0 },
        },
      })
      // Feed bad frames to build up EMA state
      feedFrames(analyzer, badFrame, 10)

      // Reset clears the EMA state
      analyzer.reset()

      // First frame after reset uses raw value (no smoothing memory)
      const goodFrame = createMockFrame()
      const result = feedFrames(analyzer, goodFrame, 5)
      expect(result.isGood).toBe(true)
    })
  })

  describe('timestamp passthrough', () => {
    it('passes through the frame timestamp to the result', () => {
      const timestamp = 1234567890
      const frame = createMockFrame({ timestamp })
      const result = analyzer.analyze(frame)
      expect(result.timestamp).toBe(timestamp)
    })
  })

  describe('confidence calculation', () => {
    it('returns high confidence when all landmarks are visible', () => {
      const frame = createMockFrame() // all visibility = 1.0
      const result = analyzer.analyze(frame)
      expect(result.confidence).toBeCloseTo(1.0, 1)
    })

    it('returns average visibility of critical landmarks (ears + shoulders only)', () => {
      const frame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 0.8 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0, visibility: 0.9 },
          [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0, visibility: 0.7 },
          [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0, visibility: 0.6 },
          // Hips are NOT in critical set — their visibility does not affect confidence
          [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0, visibility: 0.1 },
          [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.2, z: 0, visibility: 0.1 },
        },
      })
      const result = analyzer.analyze(frame)
      // avg = (0.8 + 0.9 + 0.7 + 0.6) / 4 = 3.0 / 4 = 0.75
      expect(result.confidence).toBeCloseTo(0.75, 1)
    })
  })

  // ============================================================
  // Real photo landmarks tests
  // ============================================================

  describe('real photos — good posture → isGood=true', () => {
    it('good posture photo 1 calibrated with itself → isGood=true', () => {
      const data = loadLandmarks(1)
      const frame = toDetectionFrame(data)
      const angles = extractPostureAngles(data.worldLandmarks, data.landmarks)
      const cal: CalibrationData = {
        headForwardAngle: angles.headForwardAngle,
        torsoAngle: angles.torsoAngle,
        headTiltAngle: angles.headTiltAngle,
        faceFrameRatio: angles.faceFrameRatio,
        faceY: angles.faceY,
        noseToEarAvg: angles.noseToEarAvg,
        shoulderDiff: angles.shoulderDiff,
        timestamp: Date.now(),
      }
      const a = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON)
      const result = feedFrames(a, frame, 10)
      expect(result.isGood).toBe(true)
      expect(result.violations).toHaveLength(0)
    })

    it('multiple good posture photos calibrated with photo 1 → isGood=true', () => {
      // Calibrate with photo 1 (standard posture, normal lighting)
      const calData = loadLandmarks(1)
      const calAngles = extractPostureAngles(calData.worldLandmarks, calData.landmarks)
      const cal: CalibrationData = {
        headForwardAngle: calAngles.headForwardAngle,
        torsoAngle: calAngles.torsoAngle,
        headTiltAngle: calAngles.headTiltAngle,
        faceFrameRatio: calAngles.faceFrameRatio,
        faceY: calAngles.faceY,
        noseToEarAvg: calAngles.noseToEarAvg,
        shoulderDiff: calAngles.shoulderDiff,
        timestamp: Date.now(),
      }

      // Test photos 2,3,5,7,8 — all normal-light good posture
      for (const photoId of [2, 3, 5, 7, 8]) {
        const data = loadLandmarks(photoId)
        const frame = toDetectionFrame(data)
        const a = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON)
        const result = feedFrames(a, frame, 10)
        expect(result.isGood, `Photo ${photoId} should be good`).toBe(true)
      }
    })
  })

  describe('real photos — forward head → detects FORWARD_HEAD', () => {
    it('severe forward head photos trigger FORWARD_HEAD violation', () => {
      // Calibrate with good posture photo 1
      const calData = loadLandmarks(1)
      const calAngles = extractPostureAngles(calData.worldLandmarks, calData.landmarks)
      const cal: CalibrationData = {
        headForwardAngle: calAngles.headForwardAngle,
        torsoAngle: calAngles.torsoAngle,
        headTiltAngle: calAngles.headTiltAngle,
        faceFrameRatio: calAngles.faceFrameRatio,
        faceY: calAngles.faceY,
        noseToEarAvg: calAngles.noseToEarAvg,
        shoulderDiff: calAngles.shoulderDiff,
        timestamp: Date.now(),
      }

      // Photo 13 = severe forward head (~10cm), Photo 14 = moderate but extreme angle
      for (const photoId of [13, 14]) {
        const { landmarkData, metadata } = loadLandmarksWithMetadata(photoId)
        const frame = toDetectionFrame(landmarkData)
        const a = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON)
        const result = feedFrames(a, frame, 15)
        expect(result.isGood, `Photo ${photoId}: ${metadata.notes}`).toBe(false)
        expect(
          result.violations.some(v => v.rule === 'FORWARD_HEAD'),
          `Photo ${photoId} should have FORWARD_HEAD`,
        ).toBe(true)
      }
    })

    it('forward_head category: average deviation > good posture average', () => {
      const calData = loadLandmarks(1)
      const calAngles = extractPostureAngles(calData.worldLandmarks, calData.landmarks)
      const cal: CalibrationData = {
        headForwardAngle: calAngles.headForwardAngle,
        torsoAngle: calAngles.torsoAngle,
        headTiltAngle: calAngles.headTiltAngle,
        faceFrameRatio: calAngles.faceFrameRatio,
        faceY: calAngles.faceY,
        noseToEarAvg: calAngles.noseToEarAvg,
        shoulderDiff: calAngles.shoulderDiff,
        timestamp: Date.now(),
      }

      const goodPhotos = loadLandmarksByCategory('good').filter(p => p.metadata.lighting === 'normal')
      const fwdPhotos = loadLandmarksByCategory('forward_head')

      function getAvgViolations(photos: typeof goodPhotos): number {
        let totalViolations = 0
        for (const { landmarkData } of photos) {
          const frame = toDetectionFrame(landmarkData)
          const a = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON)
          const result = feedFrames(a, frame, 10)
          totalViolations += result.violations.length
        }
        return totalViolations / photos.length
      }

      expect(getAvgViolations(fwdPhotos)).toBeGreaterThan(getAvgViolations(goodPhotos))
    })
  })

  describe('real photos — confidence reflects visibility', () => {
    it('normal photos have reasonable confidence (> 0.7)', () => {
      // Some good-posture photos have landmark visibility < 0.9 for
      // individual critical landmarks; average confidence is still > 0.7
      const goodPhotos = loadLandmarksByCategory('good')
        .filter(p => p.metadata.lighting === 'normal')
      for (const { landmarkData, metadata } of goodPhotos) {
        const frame = toDetectionFrame(landmarkData)
        const a = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)
        const result = a.analyze(frame)
        expect(result.confidence, `Photo ${metadata.photoId}`).toBeGreaterThan(0.7)
      }
    })
  })
})
