import { describe, it, expect } from 'vitest'
import {
  PoseLandmarkIndex,
  TOTAL_LANDMARKS,
  DEFAULT_POSE_DETECTOR_CONFIG,
  POSTURE_LANDMARKS,
} from '@/services/pose-detection/pose-types'

describe('pose-types', () => {
  describe('PoseLandmarkIndex', () => {
    it('contains 33 landmark entries', () => {
      const keys = Object.keys(PoseLandmarkIndex)
      expect(keys.length).toBe(33)
    })

    it('has correct index for NOSE', () => {
      expect(PoseLandmarkIndex.NOSE).toBe(0)
    })

    it('has correct index for LEFT_EAR', () => {
      expect(PoseLandmarkIndex.LEFT_EAR).toBe(7)
    })

    it('has correct index for RIGHT_EAR', () => {
      expect(PoseLandmarkIndex.RIGHT_EAR).toBe(8)
    })

    it('has correct index for LEFT_SHOULDER', () => {
      expect(PoseLandmarkIndex.LEFT_SHOULDER).toBe(11)
    })

    it('has correct index for RIGHT_SHOULDER', () => {
      expect(PoseLandmarkIndex.RIGHT_SHOULDER).toBe(12)
    })

    it('has correct index for LEFT_HIP', () => {
      expect(PoseLandmarkIndex.LEFT_HIP).toBe(23)
    })

    it('has correct index for RIGHT_HIP', () => {
      expect(PoseLandmarkIndex.RIGHT_HIP).toBe(24)
    })

    it('has all indices from 0 to 32 (contiguous)', () => {
      const values = Object.values(PoseLandmarkIndex)
      const sorted = [...values].sort((a, b) => a - b)
      for (let i = 0; i < 33; i++) {
        expect(sorted[i]).toBe(i)
      }
    })
  })

  describe('TOTAL_LANDMARKS', () => {
    it('equals 33', () => {
      expect(TOTAL_LANDMARKS).toBe(33)
    })

    it('matches the number of entries in PoseLandmarkIndex', () => {
      expect(TOTAL_LANDMARKS).toBe(Object.keys(PoseLandmarkIndex).length)
    })
  })

  describe('DEFAULT_POSE_DETECTOR_CONFIG', () => {
    it('has empty modelPath', () => {
      expect(DEFAULT_POSE_DETECTOR_CONFIG.modelPath).toBe('')
    })

    it('has numPoses set to 1', () => {
      expect(DEFAULT_POSE_DETECTOR_CONFIG.numPoses).toBe(1)
    })

    it('has minPoseDetectionConfidence set to 0.5', () => {
      expect(DEFAULT_POSE_DETECTOR_CONFIG.minPoseDetectionConfidence).toBe(0.5)
    })

    it('has minPosePresenceConfidence set to 0.5', () => {
      expect(DEFAULT_POSE_DETECTOR_CONFIG.minPosePresenceConfidence).toBe(0.5)
    })

    it('has minTrackingConfidence set to 0.5', () => {
      expect(DEFAULT_POSE_DETECTOR_CONFIG.minTrackingConfidence).toBe(0.5)
    })
  })

  describe('POSTURE_LANDMARKS', () => {
    it('HEAD_FORWARD contains LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER', () => {
      expect(POSTURE_LANDMARKS.HEAD_FORWARD).toEqual([
        PoseLandmarkIndex.LEFT_EAR,
        PoseLandmarkIndex.RIGHT_EAR,
        PoseLandmarkIndex.LEFT_SHOULDER,
        PoseLandmarkIndex.RIGHT_SHOULDER,
      ])
    })

    it('SLOUCH contains LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_HIP, RIGHT_HIP', () => {
      expect(POSTURE_LANDMARKS.SLOUCH).toEqual([
        PoseLandmarkIndex.LEFT_SHOULDER,
        PoseLandmarkIndex.RIGHT_SHOULDER,
        PoseLandmarkIndex.LEFT_HIP,
        PoseLandmarkIndex.RIGHT_HIP,
      ])
    })

    it('HEAD_TILT contains LEFT_EAR, RIGHT_EAR', () => {
      expect(POSTURE_LANDMARKS.HEAD_TILT).toEqual([
        PoseLandmarkIndex.LEFT_EAR,
        PoseLandmarkIndex.RIGHT_EAR,
      ])
    })

    it('TOO_CLOSE contains LEFT_EAR, RIGHT_EAR', () => {
      expect(POSTURE_LANDMARKS.TOO_CLOSE).toEqual([
        PoseLandmarkIndex.LEFT_EAR,
        PoseLandmarkIndex.RIGHT_EAR,
      ])
    })

    it('SHOULDER_ASYMMETRY contains LEFT_SHOULDER, RIGHT_SHOULDER', () => {
      expect(POSTURE_LANDMARKS.SHOULDER_ASYMMETRY).toEqual([
        PoseLandmarkIndex.LEFT_SHOULDER,
        PoseLandmarkIndex.RIGHT_SHOULDER,
      ])
    })

    it('has exactly 5 posture landmark groups', () => {
      expect(Object.keys(POSTURE_LANDMARKS).length).toBe(5)
    })
  })
})
