import { describe, it, expect } from 'vitest'
import {
  extractPostureAngles,
  headForwardAngle,
  torsoAngle,
  headTiltAngle,
  faceToFrameRatio,
  shoulderAsymmetry,
} from '@/services/posture-analysis/angle-calculator'
import { Landmark, PoseLandmarkIndex } from '@/services/pose-detection/pose-types'
import { toRadians } from '@/utils/math'

// Helper: create 33-element landmark array with overrides for specific indices
function createMockLandmarks(
  overrides: Partial<Record<number, Partial<Landmark>>> = {}
): Landmark[] {
  const defaults: Landmark = { x: 0, y: 0, z: 0, visibility: 1.0 }
  return Array.from({ length: 33 }, (_, i) => ({
    ...defaults,
    ...overrides[i],
  }))
}

// Helper: create upright posture landmarks
// In MediaPipe world landmarks: y positive = downward, z positive = toward camera
// Upright: ear directly above shoulder, shoulder directly above hip
function createUprightLandmarks(): Landmark[] {
  return createMockLandmarks({
    [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.30, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.30, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.LEFT_HIP]: { x: -0.10, y: 0.40, z: 0, visibility: 1.0 },
    [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.10, y: 0.40, z: 0, visibility: 1.0 },
  })
}

describe('angle-calculator', () => {
  describe('headForwardAngle', () => {
    it('returns ~0° for upright posture (ear directly above shoulder)', () => {
      const landmarks = createUprightLandmarks()
      const angle = headForwardAngle(landmarks)
      expect(angle).toBeCloseTo(0, 0)
      expect(angle).toBeLessThan(3) // within ±3°
    })

    it('returns ~30° when head is tilted forward by 30°', () => {
      // earMid is at (0, -0.30, 0), shoulderMid is at (0, 0, 0)
      // earToShoulder vector = earMid - shoulderMid = (0, -0.30, 0)
      // For 30° forward tilt, we rotate ear forward (negative z) around shoulder
      // New ear position: y = -0.30 * cos(30°), z = -0.30 * sin(30°)
      const angle30 = toRadians(30)
      const earY = -0.30 * Math.cos(angle30)
      const earZ = -0.30 * Math.sin(angle30)
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: earY, z: earZ, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: earY, z: earZ, visibility: 1.0 },
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0, z: 0, visibility: 1.0 },
      })
      const angle = headForwardAngle(landmarks)
      expect(angle).toBeGreaterThan(27)
      expect(angle).toBeLessThan(33)
    })

    it('returns a positive value when head moves forward', () => {
      // Head moved forward in z (toward camera = negative z in world landmarks)
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.25, z: -0.15, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -0.25, z: -0.15, visibility: 1.0 },
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0, z: 0, visibility: 1.0 },
      })
      const angle = headForwardAngle(landmarks)
      expect(angle).toBeGreaterThan(0)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createUprightLandmarks()
      const copy = landmarks.map(l => ({ ...l }))
      headForwardAngle(landmarks)
      expect(landmarks).toEqual(copy)
    })
  })

  describe('torsoAngle', () => {
    it('returns ~0° for upright sitting (shoulder-hip vertical)', () => {
      const landmarks = createUprightLandmarks()
      const angle = torsoAngle(landmarks)
      expect(angle).toBeCloseTo(0, 0)
      expect(angle).toBeLessThan(3)
    })

    it('returns ~45° for 45° slouch', () => {
      // shoulderMid at (0, 0, 0), hipMid at (0, 0.40, 0)
      // shoulderToHip vector = (0, 0.40, 0) which is straight down = 0°
      // For 45° slouch, rotate hip backward: hip.z = 0.40 * sin(45°), hip.y = 0.40 * cos(45°)
      const angle45 = toRadians(45)
      const hipY = 0.40 * Math.cos(angle45)
      const hipZ = 0.40 * Math.sin(angle45)
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.LEFT_HIP]: { x: -0.10, y: hipY, z: hipZ, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.10, y: hipY, z: hipZ, visibility: 1.0 },
      })
      const angle = torsoAngle(landmarks)
      expect(angle).toBeGreaterThan(40)
      expect(angle).toBeLessThan(50)
    })

    it('returns a positive value when slouching', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.LEFT_HIP]: { x: -0.10, y: 0.30, z: 0.20, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_HIP]: { x: 0.10, y: 0.30, z: 0.20, visibility: 1.0 },
      })
      const angle = torsoAngle(landmarks)
      expect(angle).toBeGreaterThan(0)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createUprightLandmarks()
      const copy = landmarks.map(l => ({ ...l }))
      torsoAngle(landmarks)
      expect(landmarks).toEqual(copy)
    })
  })

  describe('headTiltAngle', () => {
    it('returns ~0° when ears are level', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: 0, z: 0, visibility: 1.0 },
      })
      const angle = headTiltAngle(landmarks)
      expect(Math.abs(angle)).toBeLessThan(2)
    })

    it('returns ~20° when head tilts left (left ear lower)', () => {
      // Left ear is lower → leftEar.y > rightEar.y → positive atan2 result
      const tilt = toRadians(20)
      const earSpan = 0.16 // distance between ears in x
      const yDiff = Math.tan(tilt) * earSpan
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: yDiff / 2, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: -yDiff / 2, z: 0, visibility: 1.0 },
      })
      const angle = headTiltAngle(landmarks)
      expect(angle).toBeGreaterThan(18)
      expect(angle).toBeLessThan(22)
    })

    it('returns negative when head tilts right (right ear lower)', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: -0.03, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: 0.03, z: 0, visibility: 1.0 },
      })
      const angle = headTiltAngle(landmarks)
      expect(angle).toBeLessThan(0)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createUprightLandmarks()
      const copy = landmarks.map(l => ({ ...l }))
      headTiltAngle(landmarks)
      expect(landmarks).toEqual(copy)
    })
  })

  describe('faceToFrameRatio', () => {
    it('returns correct ratio for normal distance', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: 0, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks, 1.0)
      expect(ratio).toBeCloseTo(0.16, 2)
    })

    it('returns larger ratio when face is closer', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.20, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.20, y: 0, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks, 1.0)
      expect(ratio).toBeCloseTo(0.40, 2)
      expect(ratio).toBeGreaterThan(0.35)
    })

    it('returns smaller ratio for wider frame', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: 0, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks, 2.0)
      expect(ratio).toBeCloseTo(0.08, 2)
    })

    it('returns 0 when frameWidth is 0', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: -0.08, y: 0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.08, y: 0, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks, 0)
      expect(ratio).toBe(0)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createUprightLandmarks()
      const copy = landmarks.map(l => ({ ...l }))
      faceToFrameRatio(landmarks, 1.0)
      expect(landmarks).toEqual(copy)
    })
  })

  describe('shoulderAsymmetry', () => {
    it('returns ~0 when shoulders are level', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0.0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0.0, z: 0, visibility: 1.0 },
      })
      const asym = shoulderAsymmetry(landmarks)
      expect(Math.abs(asym)).toBeLessThan(1)
    })

    it('returns positive value when left shoulder is lower', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0.05, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0.0, z: 0, visibility: 1.0 },
      })
      const asym = shoulderAsymmetry(landmarks)
      expect(asym).toBeGreaterThan(0)
    })

    it('returns positive value (absolute) regardless of which shoulder is lower', () => {
      const landmarksLeftLower = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0.05, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0.0, z: 0, visibility: 1.0 },
      })
      const landmarksRightLower = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0.0, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0.05, z: 0, visibility: 1.0 },
      })
      expect(shoulderAsymmetry(landmarksLeftLower)).toBeGreaterThan(0)
      expect(shoulderAsymmetry(landmarksRightLower)).toBeGreaterThan(0)
    })

    it('scales with shoulder height difference', () => {
      const small = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0.02, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0.0, z: 0, visibility: 1.0 },
      })
      const large = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_SHOULDER]: { x: -0.15, y: 0.10, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_SHOULDER]: { x: 0.15, y: 0.0, z: 0, visibility: 1.0 },
      })
      expect(shoulderAsymmetry(large)).toBeGreaterThan(shoulderAsymmetry(small))
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createUprightLandmarks()
      const copy = landmarks.map(l => ({ ...l }))
      shoulderAsymmetry(landmarks)
      expect(landmarks).toEqual(copy)
    })
  })

  describe('extractPostureAngles', () => {
    it('returns a complete PostureAngles object for upright posture', () => {
      const landmarks = createUprightLandmarks()
      const result = extractPostureAngles(landmarks, 640)
      expect(result).toHaveProperty('headForwardAngle')
      expect(result).toHaveProperty('torsoAngle')
      expect(result).toHaveProperty('headTiltAngle')
      expect(result).toHaveProperty('faceFrameRatio')
      expect(result).toHaveProperty('shoulderDiff')
      expect(typeof result.headForwardAngle).toBe('number')
      expect(typeof result.torsoAngle).toBe('number')
      expect(typeof result.headTiltAngle).toBe('number')
      expect(typeof result.faceFrameRatio).toBe('number')
      expect(typeof result.shoulderDiff).toBe('number')
    })

    it('returns small angles for upright posture', () => {
      const landmarks = createUprightLandmarks()
      const result = extractPostureAngles(landmarks, 640)
      expect(result.headForwardAngle).toBeLessThan(5)
      expect(result.torsoAngle).toBeLessThan(5)
      expect(Math.abs(result.headTiltAngle)).toBeLessThan(5)
      expect(result.shoulderDiff).toBeLessThan(5)
    })

    it('combines individual function results correctly', () => {
      const landmarks = createUprightLandmarks()
      const frameWidth = 640
      const result = extractPostureAngles(landmarks, frameWidth)
      expect(result.headForwardAngle).toBeCloseTo(headForwardAngle(landmarks), 5)
      expect(result.torsoAngle).toBeCloseTo(torsoAngle(landmarks), 5)
      expect(result.headTiltAngle).toBeCloseTo(headTiltAngle(landmarks), 5)
      expect(result.faceFrameRatio).toBeCloseTo(faceToFrameRatio(landmarks, frameWidth), 5)
      expect(result.shoulderDiff).toBeCloseTo(shoulderAsymmetry(landmarks), 5)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createUprightLandmarks()
      const copy = landmarks.map(l => ({ ...l }))
      extractPostureAngles(landmarks, 640)
      expect(landmarks).toEqual(copy)
    })
  })
})
