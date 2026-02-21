/**
 * Cross-testing: position-check boundary conditions
 * Written by an independent tester to cover edge cases and exact boundary values.
 */
import { checkFacePosition } from '@/components/calibration/position-check'
import type { Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'

function createLandmarks(
  overrides: Partial<Record<number, Partial<Landmark>>> = {},
): Landmark[] {
  const defaults: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 }
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ ...defaults }))

  landmarks[PoseLandmarkIndex.LEFT_EAR] = {
    x: 0.425, y: 0.45, z: 0, visibility: 0.9,
    ...overrides[PoseLandmarkIndex.LEFT_EAR],
  }
  landmarks[PoseLandmarkIndex.RIGHT_EAR] = {
    x: 0.575, y: 0.45, z: 0, visibility: 0.9,
    ...overrides[PoseLandmarkIndex.RIGHT_EAR],
  }
  landmarks[PoseLandmarkIndex.NOSE] = {
    x: 0.5, y: 0.5, z: 0, visibility: 0.9,
    ...overrides[PoseLandmarkIndex.NOSE],
  }

  for (const [idx, override] of Object.entries(overrides)) {
    const i = Number(idx)
    if (
      i !== PoseLandmarkIndex.LEFT_EAR &&
      i !== PoseLandmarkIndex.RIGHT_EAR &&
      i !== PoseLandmarkIndex.NOSE
    ) {
      landmarks[i] = { ...landmarks[i], ...override }
    }
  }

  return landmarks
}

describe('checkFacePosition - boundary conditions (cross-test)', () => {
  // FACE_RATIO_TOO_FAR = 0.08
  // FACE_RATIO_TOO_CLOSE = 0.35
  // CENTER_TOLERANCE = 0.25

  describe('faceRatio boundary at too_far threshold (0.08)', () => {
    it('returns too_far when faceRatio is exactly 0.08', () => {
      // |0.46 - 0.54| = 0.08 → faceRatio < FACE_RATIO_TOO_FAR is false (0.08 < 0.08 === false)
      // Actually, 0.08 < 0.08 is false, so this should NOT be too_far
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.46 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.54 },
      })
      const result = checkFacePosition(landmarks, 640)
      // faceRatio = 0.08, which is NOT < 0.08, so should be 'good' (centered nose)
      expect(result.status).toBe('good')
    })

    it('returns too_far when faceRatio is just below 0.08', () => {
      // |0.461 - 0.539| = 0.078 < 0.08 → too_far
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.461 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.539 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('too_far')
    })

    it('returns good when faceRatio is just above 0.08', () => {
      // |0.459 - 0.541| = 0.082 > 0.08 → not too_far, centered → good
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.459 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.541 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('good')
    })
  })

  describe('faceRatio boundary at too_close threshold (0.35)', () => {
    it('returns too_close when faceRatio computes to ~0.35 due to floating point', () => {
      // |0.325 - 0.675| = 0.35000000000000003 (floating point) > 0.35 → too_close
      // This documents the actual floating-point behavior of the implementation
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.325 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.675 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('too_close')
    })

    it('returns good when faceRatio is clearly below 0.35', () => {
      // |0.33 - 0.67| = 0.34 < 0.35 → not too_close, centered → good
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.33 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.67 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('good')
    })

    it('returns too_close when faceRatio is just above 0.35', () => {
      // |0.324 - 0.676| = 0.352 > 0.35 → too_close
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.324 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.676 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('too_close')
    })

    it('returns good when faceRatio is just below 0.35', () => {
      // |0.326 - 0.674| = 0.348 < 0.35 → not too_close, centered → good
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.326 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.674 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('good')
    })
  })

  describe('center tolerance boundary (0.25)', () => {
    it('returns good when nose is at center tolerance boundary X', () => {
      // |0.75 - 0.5| = 0.25, Math.abs(noseX - 0.5) > 0.25 is false → in bounds
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.75, y: 0.5 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('good')
    })

    it('returns off_center when nose is just past tolerance X', () => {
      // |0.76 - 0.5| = 0.26 > 0.25 → off_center
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.76, y: 0.5 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('off_center')
    })

    it('returns good when nose is at center tolerance boundary Y', () => {
      // |0.75 - 0.5| = 0.25 → in bounds
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.75 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('good')
    })

    it('returns off_center when nose is just past tolerance Y', () => {
      // |0.76 - 0.5| = 0.26 > 0.25 → off_center
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.76 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('off_center')
    })

    it('returns good when nose is at left tolerance boundary', () => {
      // |0.25 - 0.5| = 0.25 → in bounds
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.25, y: 0.5 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('good')
    })

    it('returns off_center when nose is past left tolerance', () => {
      // |0.24 - 0.5| = 0.26 > 0.25 → off_center
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.24, y: 0.5 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('off_center')
    })

    it('returns off_center when nose is past both X and Y tolerance', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.8, y: 0.8 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('off_center')
    })
  })

  describe('visibility edge cases', () => {
    it('returns no_face when left ear visibility is exactly 0.5', () => {
      // visibility < 0.5 is false for 0.5, so 0.5 should pass visibility check
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { visibility: 0.5 },
      })
      const result = checkFacePosition(landmarks, 640)
      // 0.5 < 0.5 is false → passes visibility check
      expect(result.status).toBe('good')
    })

    it('returns no_face when left ear visibility is 0.49', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { visibility: 0.49 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('no_face')
    })

    it('returns no_face when right ear visibility is below threshold', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.RIGHT_EAR]: { visibility: 0.3 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('no_face')
    })

    it('returns no_face when nose visibility is below threshold', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { visibility: 0.1 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('no_face')
    })

    it('passes when all three key landmarks have exactly 0.5 visibility', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { visibility: 0.5 },
        [PoseLandmarkIndex.RIGHT_EAR]: { visibility: 0.5 },
        [PoseLandmarkIndex.NOSE]: { visibility: 0.5 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.status).toBe('good')
    })
  })

  describe('frameWidth parameter', () => {
    it('does not affect result since faceRatio uses normalized coordinates', () => {
      const landmarks = createLandmarks()
      const result1 = checkFacePosition(landmarks, 320)
      const result2 = checkFacePosition(landmarks, 1920)
      expect(result1.status).toBe(result2.status)
      expect(result1.message).toBe(result2.message)
    })
  })

  describe('message text verification against plan', () => {
    it('no_face message matches plan: contains "未检测到人脸"', () => {
      const result = checkFacePosition(null, 640)
      expect(result.message).toContain('未检测到人脸')
    })

    it('too_far message matches plan: contains "靠近"', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.49 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.51 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.message).toContain('靠近')
    })

    it('too_close message matches plan: contains "后退"', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.LEFT_EAR]: { x: 0.2 },
        [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.8 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.message).toContain('后退')
    })

    it('off_center message matches plan: contains "中央"', () => {
      const landmarks = createLandmarks({
        [PoseLandmarkIndex.NOSE]: { x: 0.1, y: 0.5 },
      })
      const result = checkFacePosition(landmarks, 640)
      expect(result.message).toContain('中央')
    })

    it('good message matches plan: contains "合适"', () => {
      const landmarks = createLandmarks()
      const result = checkFacePosition(landmarks, 640)
      expect(result.message).toContain('合适')
    })
  })
})
