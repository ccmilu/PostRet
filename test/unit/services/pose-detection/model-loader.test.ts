import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('model-loader', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('getModelPath', () => {
    it('returns dev path when in development mode', async () => {
      vi.stubEnv('DEV', 'true');
      // Dynamic import to pick up env stub
      const { getModelPath } = await import('@/services/pose-detection/model-loader');
      const path = getModelPath();
      expect(path).toBe('/models/pose_landmarker_full.task');
    });

    it('returns production path when not in dev mode', async () => {
      vi.stubEnv('DEV', '');
      const { getModelPath } = await import('@/services/pose-detection/model-loader');
      const path = getModelPath();
      expect(path).toBe('models/pose_landmarker_full.task');
    });
  });

  describe('getWasmPath', () => {
    it('returns local /wasm path in dev mode', async () => {
      vi.stubEnv('DEV', 'true');
      const { getWasmPath } = await import('@/services/pose-detection/model-loader');
      const path = getWasmPath();
      expect(path).toBe('/wasm');
    });

    it('returns relative wasm path in production mode', async () => {
      vi.stubEnv('DEV', '');
      const { getWasmPath } = await import('@/services/pose-detection/model-loader');
      const path = getWasmPath();
      expect(path).toBe('wasm');
    });
  });

  describe('checkModelExists', () => {
    it('returns true when model file is accessible', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const { checkModelExists } = await import('@/services/pose-detection/model-loader');
      const exists = await checkModelExists();

      expect(exists).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pose_landmarker_full.task'),
        { method: 'HEAD' },
      );
    });

    it('returns false when model file is not accessible', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal('fetch', mockFetch);

      const { checkModelExists } = await import('@/services/pose-detection/model-loader');
      const exists = await checkModelExists();

      expect(exists).toBe(false);
    });

    it('returns false when fetch throws', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', mockFetch);

      const { checkModelExists } = await import('@/services/pose-detection/model-loader');
      const exists = await checkModelExists();

      expect(exists).toBe(false);
    });
  });
});
