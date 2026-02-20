import { describe, it, expect, beforeEach } from 'vitest'
import { PostureAnalyzer } from '@/services/posture-analysis/posture-analyzer'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { CalibrationData, RuleToggles } from '@/types/settings'

// --- Helpers ---

function createMockFrame(overrides?: {
  worldLandmarks?: Partial<Record<number, Partial<Landmark>>>
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

  const merged = { ...goodPosture, ...overrides?.worldLandmarks }
  const worldLandmarks = Array.from({ length: 33 }, (_, i) => ({
    ...defaultLandmark,
    ...merged[i],
  }))

  return {
    landmarks: worldLandmarks,
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
    faceFrameRatio: 0.16 / 640, // |(-0.08) - 0.08| / 640
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
      const badFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.50, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.70, z: 0, visibility: 1.0 },
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
    it('returns isGood=true with low confidence when visibility < 0.5', () => {
      const lowVisFrame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 0.2 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0, visibility: 0.3 },
          [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0, visibility: 0.3 },
          [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0, visibility: 0.2 },
          [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0, visibility: 0.4 },
          [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.2, z: 0, visibility: 0.3 },
        },
      })
      const result = analyzer.analyze(lowVisFrame)
      expect(result.isGood).toBe(true)
      expect(result.violations).toHaveLength(0)
      // avg = (0.2 + 0.3 + 0.3 + 0.2 + 0.4 + 0.3) / 6 ≈ 0.283
      expect(result.confidence).toBeLessThan(0.5)
    })

    it('marks low confidence when any critical landmark has visibility < 0.5', () => {
      const lowVisFrame = createMockFrame({
        worldLandmarks: {
          // Only one landmark has low visibility
          [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0, visibility: 0.1 },
        },
      })
      const result = analyzer.analyze(lowVisFrame)
      expect(result.isGood).toBe(true)
      expect(result.violations).toHaveLength(0)
    })
  })

  describe('updateCalibration', () => {
    it('changes baseline for deviation calculation', () => {
      // Create an analyzer with calibration matching a forward-leaning pose
      const forwardCalibration: CalibrationData = {
        headForwardAngle: 25,
        torsoAngle: 0,
        headTiltAngle: 0,
        faceFrameRatio: 0.00025,
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

      // Disable forward head rule
      analyzer.updateRuleToggles({
        ...ALL_RULES_ON,
        forwardHead: false,
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

    it('returns average visibility of critical landmarks', () => {
      const frame = createMockFrame({
        worldLandmarks: {
          [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 0.8 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0, visibility: 0.9 },
          [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0, visibility: 0.7 },
          [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0, visibility: 0.6 },
          [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.2, z: 0, visibility: 1.0 },
        },
      })
      const result = analyzer.analyze(frame)
      // avg = (0.8 + 0.9 + 0.7 + 0.6 + 1.0 + 1.0) / 6 = 5.0 / 6 ≈ 0.833
      expect(result.confidence).toBeCloseTo(5.0 / 6, 1)
    })
  })
})
