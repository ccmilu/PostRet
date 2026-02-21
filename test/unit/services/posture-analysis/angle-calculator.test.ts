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
import {
  loadLandmarks,
  loadLandmarksWithMetadata,
  loadLandmarksByCategory,
} from '../../../helpers/load-landmarks'

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
      // Normalized coords: leftEar has higher x (right side of frame)
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.6, y: 0.4, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.4, y: 0.4, z: 0, visibility: 1.0 },
      })
      const angle = headTiltAngle(landmarks)
      expect(Math.abs(angle)).toBeLessThan(2)
    })

    it('returns ~20° when head tilts left (left ear lower)', () => {
      // Left ear lower → leftEar.y > rightEar.y → positive atan2 result
      const tilt = toRadians(20)
      const earSpan = 0.2 // dx = leftEar.x - rightEar.x in normalized coords
      const yDiff = Math.tan(tilt) * earSpan
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.6, y: 0.4 + yDiff / 2, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.4, y: 0.4 - yDiff / 2, z: 0, visibility: 1.0 },
      })
      const angle = headTiltAngle(landmarks)
      expect(angle).toBeGreaterThan(18)
      expect(angle).toBeLessThan(22)
    })

    it('returns negative when head tilts right (right ear lower)', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.6, y: 0.37, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.4, y: 0.43, z: 0, visibility: 1.0 },
      })
      const angle = headTiltAngle(landmarks)
      expect(angle).toBeLessThan(0)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.6, y: 0.4, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.4, y: 0.4, z: 0, visibility: 1.0 },
      })
      const copy = landmarks.map(l => ({ ...l }))
      headTiltAngle(landmarks)
      expect(landmarks).toEqual(copy)
    })
  })

  describe('faceToFrameRatio', () => {
    it('returns correct ratio from normalized landmarks', () => {
      // Normalized landmarks: ear x positions represent fraction of frame width
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.30, y: 0.5, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.70, y: 0.5, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks)
      expect(ratio).toBeCloseTo(0.40, 2)
    })

    it('returns larger ratio when face is closer', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.20, y: 0.5, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.80, y: 0.5, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks)
      expect(ratio).toBeCloseTo(0.60, 2)
      expect(ratio).toBeGreaterThan(0.55)
    })

    it('returns smaller ratio when face is farther', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.42, y: 0.5, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.58, y: 0.5, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks)
      expect(ratio).toBeCloseTo(0.16, 2)
    })

    it('returns 0 when ears overlap', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.5, y: 0.5, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.5, y: 0.5, z: 0, visibility: 1.0 },
      })
      const ratio = faceToFrameRatio(landmarks)
      expect(ratio).toBe(0)
    })

    it('does not mutate input landmarks', () => {
      const landmarks = createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.3, y: 0.5, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.7, y: 0.5, z: 0, visibility: 1.0 },
      })
      const copy = landmarks.map(l => ({ ...l }))
      faceToFrameRatio(landmarks)
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
    // Create normalized landmarks with ear positions in [0,1] range
    // In MediaPipe non-mirrored: leftEar.x > rightEar.x (person's left is screen right)
    function createNormalizedLandmarks(): Landmark[] {
      return createMockLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.58, y: 0.3, z: 0, visibility: 1.0 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.42, y: 0.3, z: 0, visibility: 1.0 },
      })
    }

    it('returns a complete PostureAngles object for upright posture', () => {
      const worldLandmarks = createUprightLandmarks()
      const normalizedLandmarks = createNormalizedLandmarks()
      const result = extractPostureAngles(worldLandmarks, normalizedLandmarks)
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
      const worldLandmarks = createUprightLandmarks()
      const normalizedLandmarks = createNormalizedLandmarks()
      const result = extractPostureAngles(worldLandmarks, normalizedLandmarks)
      expect(result.headForwardAngle).toBeLessThan(5)
      expect(result.torsoAngle).toBeLessThan(5)
      expect(Math.abs(result.headTiltAngle)).toBeLessThan(5)
      expect(result.shoulderDiff).toBeLessThan(5)
    })

    it('combines individual function results correctly', () => {
      const worldLandmarks = createUprightLandmarks()
      const normalizedLandmarks = createNormalizedLandmarks()
      const result = extractPostureAngles(worldLandmarks, normalizedLandmarks)
      expect(result.headForwardAngle).toBeCloseTo(headForwardAngle(worldLandmarks), 5)
      expect(result.torsoAngle).toBeCloseTo(torsoAngle(worldLandmarks), 5)
      expect(result.headTiltAngle).toBeCloseTo(headTiltAngle(normalizedLandmarks), 5)
      expect(result.faceFrameRatio).toBeCloseTo(faceToFrameRatio(normalizedLandmarks), 5)
      expect(result.shoulderDiff).toBeCloseTo(shoulderAsymmetry(worldLandmarks), 5)
    })

    it('does not mutate input landmarks', () => {
      const worldLandmarks = createUprightLandmarks()
      const normalizedLandmarks = createNormalizedLandmarks()
      const worldCopy = worldLandmarks.map(l => ({ ...l }))
      const normCopy = normalizedLandmarks.map(l => ({ ...l }))
      extractPostureAngles(worldLandmarks, normalizedLandmarks)
      expect(worldLandmarks).toEqual(worldCopy)
      expect(normalizedLandmarks).toEqual(normCopy)
    })
  })

  // ============================================================
  // Real photo landmarks tests
  // ============================================================

  describe('headForwardAngle — real photos', () => {
    it('good posture photos with normal lighting produce headForward < 15°', () => {
      const goodPhotos = loadLandmarksByCategory('good')
      const normalLightPhotos = goodPhotos.filter(p => p.metadata.lighting === 'normal')
      expect(normalLightPhotos.length).toBeGreaterThan(0)
      for (const { landmarkData, metadata } of normalLightPhotos) {
        const angle = headForwardAngle(landmarkData.worldLandmarks)
        expect(angle, `Photo ${metadata.photoId}: ${metadata.notes}`).toBeLessThan(15)
        expect(angle).toBeGreaterThanOrEqual(0)
      }
    })

    it('good posture photos (all lighting) produce headForward < 22°', () => {
      // Dim lighting can inflate headForward due to landmark noise
      const goodPhotos = loadLandmarksByCategory('good')
      for (const { landmarkData, metadata } of goodPhotos) {
        const angle = headForwardAngle(landmarkData.worldLandmarks)
        expect(angle, `Photo ${metadata.photoId}: ${metadata.notes}`).toBeLessThan(22)
        expect(angle).toBeGreaterThanOrEqual(0)
      }
    })

    it('severe forward_head photos produce headForward > 20°', () => {
      // Photo 13 = severe (~10cm forward), Photo 14 = moderate but extreme angle
      const data13 = loadLandmarksWithMetadata(13)
      const angle13 = headForwardAngle(data13.landmarkData.worldLandmarks)
      expect(angle13, 'Photo 13 severe forward head').toBeGreaterThan(20)

      const data14 = loadLandmarksWithMetadata(14)
      const angle14 = headForwardAngle(data14.landmarkData.worldLandmarks)
      expect(angle14, 'Photo 14 moderate forward head').toBeGreaterThan(20)
    })

    it('forward_head photos have higher headForward than good posture average', () => {
      const goodPhotos = loadLandmarksByCategory('good')
      const fwdPhotos = loadLandmarksByCategory('forward_head')

      const goodAvg = goodPhotos.reduce(
        (sum, p) => sum + headForwardAngle(p.landmarkData.worldLandmarks), 0
      ) / goodPhotos.length

      const fwdAvg = fwdPhotos.reduce(
        (sum, p) => sum + headForwardAngle(p.landmarkData.worldLandmarks), 0
      ) / fwdPhotos.length

      expect(fwdAvg).toBeGreaterThan(goodAvg)
    })
  })

  describe('headTiltAngle — real photos', () => {
    it('good posture photos have headTilt near 0° (ears roughly level)', () => {
      // headTiltAngle uses normalized landmarks; with dx=leftEar.x-rightEar.x > 0
      // for standard facing-camera pose, level ears give ~0°
      const goodPhotos = loadLandmarksByCategory('good')
      for (const { landmarkData, metadata } of goodPhotos) {
        const tilt = headTiltAngle(landmarkData.landmarks)
        expect(Math.abs(tilt), `Photo ${metadata.photoId}`).toBeLessThan(12)
      }
    })

    it('head_tilt photos have larger absolute tilt than good posture average', () => {
      const goodPhotos = loadLandmarksByCategory('good')
      const tiltPhotos = loadLandmarksByCategory('head_tilt')

      const goodAvgAbsTilt = goodPhotos.reduce(
        (sum, p) => sum + Math.abs(headTiltAngle(p.landmarkData.landmarks)), 0
      ) / goodPhotos.length

      const tiltAvgAbsTilt = tiltPhotos.reduce(
        (sum, p) => sum + Math.abs(headTiltAngle(p.landmarkData.landmarks)), 0
      ) / tiltPhotos.length

      expect(tiltAvgAbsTilt).toBeGreaterThan(goodAvgAbsTilt)
    })
  })

  describe('shoulderAsymmetry — real photos', () => {
    it('photos with SHOULDER_ASYMMETRY violation have shoulderDiff > 4°', () => {
      // Photos 25, 26, 30 have expectedViolations including SHOULDER_ASYMMETRY
      for (const photoId of [25, 26, 30]) {
        const { landmarkData, metadata } = loadLandmarksWithMetadata(photoId)
        const diff = shoulderAsymmetry(landmarkData.worldLandmarks)
        expect(diff, `Photo ${photoId}: ${metadata.notes}`).toBeGreaterThan(4)
      }
    })
  })

  describe('extractPostureAngles — real photos', () => {
    it('returns all finite values for every real photo', () => {
      const goodPhotos = loadLandmarksByCategory('good')
      const fwdPhotos = loadLandmarksByCategory('forward_head')
      const allPhotos = [...goodPhotos, ...fwdPhotos]

      for (const { landmarkData, metadata } of allPhotos) {
        const angles = extractPostureAngles(
          landmarkData.worldLandmarks,
          landmarkData.landmarks,
        )
        expect(Number.isFinite(angles.headForwardAngle),
          `Photo ${metadata.photoId} headForward`).toBe(true)
        expect(Number.isFinite(angles.torsoAngle),
          `Photo ${metadata.photoId} torso`).toBe(true)
        expect(Number.isFinite(angles.headTiltAngle),
          `Photo ${metadata.photoId} headTilt`).toBe(true)
        expect(Number.isFinite(angles.faceFrameRatio),
          `Photo ${metadata.photoId} faceFrameRatio`).toBe(true)
        expect(Number.isFinite(angles.shoulderDiff),
          `Photo ${metadata.photoId} shoulderDiff`).toBe(true)
      }
    })

    it('good posture photos with normal lighting: headForward < 15° consistently', () => {
      const goodPhotos = loadLandmarksByCategory('good')
        .filter(p => p.metadata.lighting === 'normal')
      expect(goodPhotos.length).toBeGreaterThan(0)
      for (const { landmarkData, metadata } of goodPhotos) {
        const angles = extractPostureAngles(
          landmarkData.worldLandmarks,
          landmarkData.landmarks,
        )
        expect(angles.headForwardAngle,
          `Photo ${metadata.photoId}: ${metadata.notes}`).toBeLessThan(15)
      }
    })
  })
})
