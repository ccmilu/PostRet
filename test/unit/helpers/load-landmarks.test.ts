import { describe, it, expect } from 'vitest';
import {
  loadLandmarks,
  loadMetadata,
  loadLandmarksWithMetadata,
  loadLandmarksByCategory,
  loadAllLandmarks,
  toDetectionFrame,
} from '../../helpers/load-landmarks';

describe('load-landmarks', () => {
  describe('loadLandmarks', () => {
    it('loads landmarks for a valid photo', () => {
      const data = loadLandmarks(1);
      expect(data.photoId).toBe(1);
      expect(data.filename).toBe('1.jpeg');
      expect(data.landmarks).toHaveLength(33);
      expect(data.worldLandmarks).toHaveLength(33);
      expect(data.frameWidth).toBeGreaterThan(0);
      expect(data.frameHeight).toBeGreaterThan(0);
    });

    it('each landmark has x, y, z, visibility', () => {
      const data = loadLandmarks(1);
      for (const lm of data.landmarks) {
        expect(typeof lm.x).toBe('number');
        expect(typeof lm.y).toBe('number');
        expect(typeof lm.z).toBe('number');
        expect(typeof lm.visibility).toBe('number');
      }
      for (const wlm of data.worldLandmarks) {
        expect(typeof wlm.x).toBe('number');
        expect(typeof wlm.y).toBe('number');
        expect(typeof wlm.z).toBe('number');
        expect(typeof wlm.visibility).toBe('number');
      }
    });

    it('throws for non-existent photo', () => {
      expect(() => loadLandmarks(999)).toThrow(/Landmarks not found/);
    });

    it('throws for photo without landmarks (photo 37 - empty chair)', () => {
      expect(() => loadLandmarks(37)).toThrow(/Landmarks not found/);
    });
  });

  describe('loadMetadata', () => {
    it('loads metadata for a good posture photo', () => {
      const meta = loadMetadata(1);
      expect(meta.photoId).toBe(1);
      expect(meta.category).toBe('good');
      expect(meta.expectedViolations).toEqual([]);
    });

    it('loads metadata for a forward head photo', () => {
      const meta = loadMetadata(11);
      expect(meta.photoId).toBe(11);
      expect(meta.category).toBe('forward_head');
      expect(meta.expectedViolations).toContain('FORWARD_HEAD');
    });

    it('loads metadata for edge case (empty chair)', () => {
      const meta = loadMetadata(37);
      expect(meta.photoId).toBe(37);
      expect(meta.category).toBe('edge_case');
    });

    it('throws for non-existent photo', () => {
      expect(() => loadMetadata(999)).toThrow(/Metadata not found/);
    });
  });

  describe('loadLandmarksWithMetadata', () => {
    it('loads both landmarks and metadata together', () => {
      const result = loadLandmarksWithMetadata(1);
      expect(result.landmarkData.photoId).toBe(1);
      expect(result.metadata.photoId).toBe(1);
      expect(result.landmarkData.landmarks).toHaveLength(33);
      expect(result.metadata.category).toBe('good');
    });
  });

  describe('loadLandmarksByCategory', () => {
    it('loads all good posture photos', () => {
      const results = loadLandmarksByCategory('good');
      expect(results.length).toBeGreaterThanOrEqual(9);
      for (const r of results) {
        expect(r.metadata.category).toBe('good');
        expect(r.landmarkData.landmarks).toHaveLength(33);
      }
    });

    it('loads all forward head photos', () => {
      const results = loadLandmarksByCategory('forward_head');
      expect(results.length).toBeGreaterThanOrEqual(9);
      for (const r of results) {
        expect(r.metadata.category).toBe('forward_head');
        expect(r.metadata.expectedViolations).toContain('FORWARD_HEAD');
      }
    });

    it('loads head tilt photos', () => {
      const results = loadLandmarksByCategory('head_tilt');
      expect(results.length).toBeGreaterThanOrEqual(9);
      for (const r of results) {
        expect(r.metadata.category).toBe('head_tilt');
      }
    });

    it('loads edge case photos (skips those without landmarks)', () => {
      const results = loadLandmarksByCategory('edge_case');
      // 7 edge_case photos (34-40), minus photo 37 (empty chair, no landmarks) = 6
      expect(results.length).toBe(6);
      for (const r of results) {
        expect(r.metadata.category).toBe('edge_case');
      }
    });

    it('results are sorted by photoId', () => {
      const results = loadLandmarksByCategory('good');
      for (let i = 1; i < results.length; i++) {
        expect(results[i].metadata.photoId).toBeGreaterThan(
          results[i - 1].metadata.photoId
        );
      }
    });
  });

  describe('loadAllLandmarks', () => {
    it('loads all 39 photos with landmarks', () => {
      const results = loadAllLandmarks();
      expect(results).toHaveLength(39);
    });

    it('results are sorted by photoId', () => {
      const results = loadAllLandmarks();
      for (let i = 1; i < results.length; i++) {
        expect(results[i].metadata.photoId).toBeGreaterThan(
          results[i - 1].metadata.photoId
        );
      }
    });
  });

  describe('toDetectionFrame', () => {
    it('converts LandmarkData to DetectionFrame', () => {
      const data = loadLandmarks(1);
      const frame = toDetectionFrame(data);
      expect(frame.landmarks).toBe(data.landmarks);
      expect(frame.worldLandmarks).toBe(data.worldLandmarks);
      expect(frame.frameWidth).toBe(data.frameWidth);
      expect(frame.frameHeight).toBe(data.frameHeight);
      expect(frame.timestamp).toBe(0);
    });

    it('accepts custom timestamp', () => {
      const data = loadLandmarks(1);
      const frame = toDetectionFrame(data, 12345);
      expect(frame.timestamp).toBe(12345);
    });
  });
});
