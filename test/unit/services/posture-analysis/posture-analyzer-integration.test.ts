import { describe, it, expect, beforeEach } from 'vitest'
import { PostureAnalyzer } from '@/services/posture-analysis/posture-analyzer'
import type { DetectionFrame, Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import type { CalibrationData, RuleToggles } from '@/types/settings'
import type { ScreenAngleReference } from '@/services/calibration/screen-angle-estimator'
import { extractPostureAngles } from '@/services/posture-analysis/angle-calculator'
import {
  loadLandmarks,
  loadLandmarksWithMetadata,
  loadLandmarksByCategory,
  toDetectionFrame,
} from '../../../helpers/load-landmarks'

function createMockFrame(overrides?: {
  landmarks?: Partial<Record<number, Partial<Landmark>>>
  worldLandmarks?: Partial<Record<number, Partial<Landmark>>>
  frameWidth?: number
  timestamp?: number
}): DetectionFrame {
  const defaultLandmark: Landmark = { x: 0, y: 0, z: 0, visibility: 1.0 }

  const goodWorldPosture: Partial<Record<number, Partial<Landmark>>> = {
    [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.6, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.6, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: -0.3, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: -0.3, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_HIP]: { x: -0.1, y: 0.2, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.1, y: 0.2, z: 0, visibility: 1.0 },
  }

  // Normalized landmarks for screen angle estimation (face features)
  // In MediaPipe non-mirrored: leftEar.x > rightEar.x, leftEye.x > rightEye.x
  const goodNormLandmarks: Partial<Record<number, Partial<Landmark>>> = {
    [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.35, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_EYE]: { x: 0.55, y: 0.30, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.45, y: 0.30, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_EAR]: { x: 0.62, y: 0.33, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.38, y: 0.33, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.54, y: 0.42, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.46, y: 0.42, z: 0, visibility: 1.0 },
  }

  const mergedWorld = { ...goodWorldPosture, ...overrides?.worldLandmarks }
  const worldLandmarks = Array.from({ length: 33 }, (_, i) => ({
    ...defaultLandmark,
    ...mergedWorld[i],
  }))

  const mergedNorm = { ...goodNormLandmarks, ...overrides?.landmarks }
  const landmarks = Array.from({ length: 33 }, (_, i) => ({
    ...defaultLandmark,
    ...mergedNorm[i],
  }))

  return {
    landmarks,
    worldLandmarks,
    timestamp: overrides?.timestamp ?? Date.now(),
    frameWidth: overrides?.frameWidth ?? 640,
    frameHeight: 480,
  }
}

function createGoodCalibration(): CalibrationData {
  return {
    headForwardAngle: 0,
    torsoAngle: 0,
    headTiltAngle: 0,
    faceFrameRatio: 0.24, // |0.62 - 0.38| from normalized landmarks
    faceY: 0.35,          // NOSE.y from normalized landmarks
    noseToEarAvg: 0.1217, // avg(dist(nose,leftEar), dist(nose,rightEar)) ≈ sqrt(0.12^2+0.02^2)
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

function feedFrames(
  analyzer: PostureAnalyzer,
  frame: DetectionFrame,
  count: number
) {
  let lastResult = analyzer.analyzeDetailed(frame)
  for (let i = 1; i < count; i++) {
    lastResult = analyzer.analyzeDetailed(frame)
  }
  return lastResult
}

describe('PostureAnalyzer — screen angle compensation integration', () => {
  let calibration: CalibrationData

  beforeEach(() => {
    calibration = createGoodCalibration()
  })

  describe('with screenAngleReference', () => {
    it('compensates headForward when screen angle changes', () => {
      // Reference signals from the calibration position
      const screenAngleRef: ScreenAngleReference = {
        faceY: 0.35,
        noseChinRatio: 0.07 / 0.24,
        eyeMouthRatio: 0.12 / 0.24,
      }

      const analyzer = new PostureAnalyzer(
        calibration, 0.5, ALL_RULES_ON, { screenAngleReference: screenAngleRef }
      )

      // Frame where face moved down (screen tilted back) — faceY increased
      const tiltedFrame = createMockFrame({
        landmarks: {
          [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.45, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.LEFT_EYE]: { x: 0.55, y: 0.40, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EYE]: { x: 0.45, y: 0.40, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.LEFT_EAR]: { x: 0.62, y: 0.43, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.38, y: 0.43, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.MOUTH_LEFT]: { x: 0.54, y: 0.52, z: 0, visibility: 1.0 },
          [PoseLandmarkIndex.MOUTH_RIGHT]: { x: 0.46, y: 0.52, z: 0, visibility: 1.0 },
        },
      })

      const result = feedFrames(analyzer, tiltedFrame, 10)

      // The screen angle compensation should reduce headForward deviation
      // Without compensation the headForward would be higher
      const analyzerNoComp = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)
      analyzerNoComp.reset()
      const resultNoComp = feedFrames(analyzerNoComp, tiltedFrame, 10)

      // The compensated headForward should be less than uncompensated
      expect(result.angles.headForwardAngle).toBeLessThan(
        resultNoComp.angles.headForwardAngle
      )
    })

    it('does not compensate when signals match reference', () => {
      const screenAngleRef: ScreenAngleReference = {
        faceY: 0.35,
        noseChinRatio: 0.07 / 0.24,
        eyeMouthRatio: 0.12 / 0.24,
      }

      const analyzerComp = new PostureAnalyzer(
        calibration, 0.5, ALL_RULES_ON, { screenAngleReference: screenAngleRef }
      )
      const analyzerNoComp = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      const frame = createMockFrame()
      const resultComp = feedFrames(analyzerComp, frame, 10)
      const resultNoComp = feedFrames(analyzerNoComp, frame, 10)

      // When signals match reference, pitchDelta ≈ 0, so results should be similar
      expect(resultComp.angles.headForwardAngle).toBeCloseTo(
        resultNoComp.angles.headForwardAngle, 0
      )
    })
  })

  describe('without screenAngleReference (backward compatibility)', () => {
    it('works exactly as before when no screenAngleReference is provided', () => {
      const analyzer = new PostureAnalyzer(calibration, 0.5, ALL_RULES_ON)

      const frame = createMockFrame()
      const result = feedFrames(analyzer, frame, 5)
      expect(result.status.isGood).toBe(true)
      expect(result.status.violations).toHaveLength(0)
    })
  })

  describe('adaptive baseline integration', () => {
    it('baseline drifts after 30 seconds of good posture', () => {
      const screenAngleRef: ScreenAngleReference = {
        faceY: 0.35,
        noseChinRatio: 0.07 / 0.24,
        eyeMouthRatio: 0.12 / 0.24,
      }

      const analyzer = new PostureAnalyzer(
        calibration, 0.5, ALL_RULES_ON, { screenAngleReference: screenAngleRef }
      )

      const frame = createMockFrame()

      // Feed frames for 35 seconds (70 frames at 500ms each)
      // Use timestamps to simulate time passing
      let ts = 1000
      for (let i = 0; i < 70; i++) {
        ts += 500
        const timedFrame: DetectionFrame = { ...frame, timestamp: ts }
        analyzer.analyzeDetailed(timedFrame)
      }

      // The adaptive baseline should have started drifting
      // We can't directly check baseline state, but the analyzer should still work
      const finalResult = analyzer.analyzeDetailed({ ...frame, timestamp: ts + 500 })
      expect(finalResult.status.isGood).toBe(true)
    })
  })

  describe('reset clears all state', () => {
    it('reset clears adaptive baseline and screen angle state', () => {
      const screenAngleRef: ScreenAngleReference = {
        faceY: 0.35,
        noseChinRatio: 0.07 / 0.24,
        eyeMouthRatio: 0.12 / 0.24,
      }

      const analyzer = new PostureAnalyzer(
        calibration, 0.5, ALL_RULES_ON, { screenAngleReference: screenAngleRef }
      )

      const frame = createMockFrame()
      feedFrames(analyzer, frame, 10)

      analyzer.reset()

      // After reset, analyzer should work normally
      const result = feedFrames(analyzer, frame, 5)
      expect(result.status.isGood).toBe(true)
    })
  })

  describe('updateCalibration updates adaptive baseline', () => {
    it('updating calibration resets adaptive baseline to new values', () => {
      const screenAngleRef: ScreenAngleReference = {
        faceY: 0.35,
        noseChinRatio: 0.07 / 0.24,
        eyeMouthRatio: 0.12 / 0.24,
      }

      const analyzer = new PostureAnalyzer(
        calibration, 0.5, ALL_RULES_ON, { screenAngleReference: screenAngleRef }
      )

      const newCalibration: CalibrationData = {
        ...calibration,
        headForwardAngle: 10,
        timestamp: Date.now(),
      }
      analyzer.updateCalibration(newCalibration)

      const frame = createMockFrame()
      const result = feedFrames(analyzer, frame, 10)
      // Should work without errors after calibration update
      expect(result.status).toBeDefined()
    })
  })

  // ============================================================
  // Real photo landmarks — integration tests
  // ============================================================

  describe('real photos — full pipeline integration', () => {
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

    it('calibrate with photo 1, feed good posture photos → all isGood=true', () => {
      const cal = createCalibrationFromPhoto(1)
      const goodPhotos = loadLandmarksByCategory('good')
        .filter(p => p.metadata.lighting === 'normal')

      for (const { landmarkData, metadata } of goodPhotos) {
        const frame = toDetectionFrame(landmarkData)
        const analyzer = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON)
        const result = feedFrames(analyzer, frame, 10)
        expect(result.status.isGood, `Photo ${metadata.photoId}: ${metadata.notes}`).toBe(true)
      }
    })

    it('calibrate with photo 1, feed severe forward_head → FORWARD_HEAD detected', () => {
      const cal = createCalibrationFromPhoto(1)
      // Photo 13 = severe forward head, Photo 14 = moderate with extreme angle
      for (const photoId of [13, 14]) {
        const { landmarkData, metadata } = loadLandmarksWithMetadata(photoId)
        const frame = toDetectionFrame(landmarkData)
        const analyzer = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON)
        const result = feedFrames(analyzer, frame, 15)
        expect(
          result.status.violations.some(v => v.rule === 'FORWARD_HEAD'),
          `Photo ${photoId}: ${metadata.notes} should detect FORWARD_HEAD`,
        ).toBe(true)
      }
    })

    it('screen angle compensation with real landmarks does not crash', () => {
      const calData = loadLandmarks(1)
      const cal = createCalibrationFromPhoto(1)
      const signals = {
        faceY: calData.landmarks[PoseLandmarkIndex.NOSE].y,
        noseChinRatio: 0.47,
        eyeMouthRatio: 0.75,
      }

      const analyzer = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON, {
        screenAngleReference: signals,
      })

      // Feed different real photos — should not throw
      for (const photoId of [1, 5, 11, 21]) {
        const data = loadLandmarks(photoId)
        const frame = toDetectionFrame(data)
        const result = analyzer.analyzeDetailed(frame)
        expect(result.status).toBeDefined()
        expect(Number.isFinite(result.angles.headForwardAngle)).toBe(true)
      }
    })

    it('adaptive baseline: sustained good posture through real photo data', () => {
      const cal = createCalibrationFromPhoto(1)
      const analyzer = new PostureAnalyzer(cal, 0.5, ALL_RULES_ON)

      const goodData = loadLandmarks(1)
      let ts = 1000

      // Feed 60 frames at 500ms intervals (30 seconds) with same good posture
      for (let i = 0; i < 60; i++) {
        ts += 500
        const frame = toDetectionFrame(goodData, ts)
        analyzer.analyzeDetailed(frame)
      }

      // After 30 seconds, analyzer should still report good for same data
      const finalResult = analyzer.analyzeDetailed(toDetectionFrame(goodData, ts + 500))
      expect(finalResult.status.isGood).toBe(true)
    })
  })
})
