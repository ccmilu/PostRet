import { checkFacePosition } from '@/components/calibration/position-check'
import type { Landmark } from '@/services/pose-detection/pose-types'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'

function createLandmarks(
  overrides: Partial<Record<number, Partial<Landmark>>> = {},
): Landmark[] {
  const defaults: Landmark = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 }
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ ...defaults }))

  // Set ear positions for a normal face width (~0.15 normalized)
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

  // Apply remaining overrides
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

describe('checkFacePosition', () => {
  it('returns no_face when landmarks is null', () => {
    const result = checkFacePosition(null, 640)
    expect(result.status).toBe('no_face')
  })

  it('returns no_face when landmarks is empty', () => {
    const result = checkFacePosition([], 640)
    expect(result.status).toBe('no_face')
  })

  it('returns no_face when key landmarks have low visibility', () => {
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.NOSE]: { visibility: 0.1 },
    })
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('no_face')
  })

  it('returns too_far when faceRatio is very small', () => {
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.LEFT_EAR]: { x: 0.48 },
      [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.52 },
    })
    // faceRatio = |0.48 - 0.52| = 0.04 < 0.08
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('too_far')
    expect(result.message).toContain('靠近')
  })

  it('returns too_close when faceRatio is large', () => {
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.LEFT_EAR]: { x: 0.3 },
      [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.7 },
    })
    // faceRatio = |0.3 - 0.7| = 0.4 > 0.35
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('too_close')
    expect(result.message).toContain('后退')
  })

  it('returns off_center when nose is far from center', () => {
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.NOSE]: { x: 0.1, y: 0.5 },
    })
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('off_center')
    expect(result.message).toContain('中央')
  })

  it('returns off_center when nose is too high', () => {
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.NOSE]: { x: 0.5, y: 0.1 },
    })
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('off_center')
  })

  it('returns good when face is centered and at proper distance', () => {
    const landmarks = createLandmarks()
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('good')
    expect(result.message).toContain('合适')
  })

  it('returns good at boundary of acceptable range', () => {
    // faceRatio just above too_far threshold
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.LEFT_EAR]: { x: 0.455 },
      [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.545 },
    })
    // faceRatio = |0.455 - 0.545| = 0.09 > 0.08
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('good')
  })

  it('prioritizes too_far over off_center', () => {
    // Face is both far away AND off-center
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.LEFT_EAR]: { x: 0.09 },
      [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.13 },
      [PoseLandmarkIndex.NOSE]: { x: 0.1, y: 0.2 },
    })
    // faceRatio = 0.04 < 0.08 → too_far
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('too_far')
  })

  it('prioritizes too_close over off_center', () => {
    // Face is both close AND off-center
    const landmarks = createLandmarks({
      [PoseLandmarkIndex.LEFT_EAR]: { x: 0.1 },
      [PoseLandmarkIndex.RIGHT_EAR]: { x: 0.9 },
      [PoseLandmarkIndex.NOSE]: { x: 0.1, y: 0.5 },
    })
    // faceRatio = 0.8 > 0.35 → too_close
    const result = checkFacePosition(landmarks, 640)
    expect(result.status).toBe('too_close')
  })
})
