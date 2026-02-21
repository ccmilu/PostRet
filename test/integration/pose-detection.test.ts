import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 集成测试: 姿态检测模块
 *
 * 由于 MediaPipe 依赖浏览器环境（WASM、WebGL），在 Node.js/jsdom 中无法实际加载。
 * 本集成测试验证模块之间的协作和类型完整性。
 * MediaPipe 实际加载需要 E2E 测试或浏览器环境。
 */

describe('pose-detection integration', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  describe('model-loader path correctness', () => {
    it('dev model path starts with /models/', async () => {
      vi.stubEnv('DEV', 'true')
      const { getModelPath } = await import('@/services/pose-detection/model-loader')
      const path = getModelPath()
      expect(path).toMatch(/^\/models\//)
      expect(path).toContain('.task')
    })

    it('production model path does not start with /', async () => {
      vi.stubEnv('DEV', '')
      const { getModelPath } = await import('@/services/pose-detection/model-loader')
      const path = getModelPath()
      expect(path).not.toMatch(/^\//)
      expect(path).toContain('.task')
    })

    it('WASM path points to local wasm directory', async () => {
      const { getWasmPath } = await import('@/services/pose-detection/model-loader')
      const path = getWasmPath()
      expect(path).toContain('wasm')
    })
  })

  describe('pose-types enum completeness', () => {
    it('PoseLandmarkIndex covers all 33 MediaPipe pose landmarks', async () => {
      const { PoseLandmarkIndex, TOTAL_LANDMARKS } = await import(
        '@/services/pose-detection/pose-types'
      )
      const indices = Object.values(PoseLandmarkIndex)
      expect(indices.length).toBe(TOTAL_LANDMARKS)

      // Verify contiguous indices from 0 to 32
      const sorted = [...indices].sort((a, b) => (a as number) - (b as number))
      for (let i = 0; i < TOTAL_LANDMARKS; i++) {
        expect(sorted[i]).toBe(i)
      }
    })

    it('POSTURE_LANDMARKS references valid indices from PoseLandmarkIndex', async () => {
      const { PoseLandmarkIndex, POSTURE_LANDMARKS } = await import(
        '@/services/pose-detection/pose-types'
      )
      const validIndices = new Set(Object.values(PoseLandmarkIndex))
      for (const [group, indices] of Object.entries(POSTURE_LANDMARKS)) {
        for (const idx of indices as readonly number[]) {
          expect(validIndices.has(idx)).toBe(true)
        }
        expect((indices as readonly number[]).length).toBeGreaterThan(0)
      }
    })
  })

  describe('pose-detector + model-loader integration', () => {
    it('pose-detector imports model-loader functions without error', async () => {
      // This verifies the import chain works correctly
      // We mock @mediapipe/tasks-vision to avoid WASM loading
      vi.mock('@mediapipe/tasks-vision', () => ({
        FilesetResolver: {
          forVisionTasks: vi.fn().mockResolvedValue({}),
        },
        PoseLandmarker: {
          createFromOptions: vi.fn().mockResolvedValue({
            detectForVideo: vi.fn(),
            close: vi.fn(),
          }),
        },
      }))

      const { createPoseDetector } = await import('@/services/pose-detection/pose-detector')
      const detector = createPoseDetector()

      expect(detector).toBeDefined()
      expect(typeof detector.initialize).toBe('function')
      expect(typeof detector.detect).toBe('function')
      expect(typeof detector.destroy).toBe('function')
      expect(typeof detector.isReady).toBe('function')
    })
  })

  describe('manual verification items', () => {
    it.todo(
      'MediaPipe 模型从本地加载成功（不需要网络） — 需 E2E 或手动验证',
    )

    it.todo(
      'PoseLandmarker 对视频帧返回 33 个关键点，每个点包含 x/y/z/visibility — 需 E2E 或手动验证',
    )
  })
})
