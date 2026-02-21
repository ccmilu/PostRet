import { renderHook, act } from '@testing-library/react'
import { useCalibration } from '@/hooks/useCalibration'
import type { IpcApi } from '@/types/ipc'
import { DEFAULT_SETTINGS } from '@/types/settings'

function createMockElectronAPI(
  overrides?: Partial<IpcApi>,
): IpcApi {
  return {
    getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS }),
    setSettings: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockResolvedValue('paused'),
    requestCameraPermission: vi.fn().mockResolvedValue(true),
    startCalibration: vi.fn().mockResolvedValue(undefined),
    completeCalibration: vi.fn().mockResolvedValue(undefined),
    reportPostureStatus: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn().mockReturnValue(() => {}),
    onPause: vi.fn().mockReturnValue(() => {}),
    onResume: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  }
}

describe('useCalibration', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    delete (window as Record<string, unknown>).electronAPI
  })

  describe('initial state', () => {
    it('should start with idle status and zero progress', () => {
      const { result } = renderHook(() => useCalibration())

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('mock calibration (no electronAPI)', () => {
    it('should transition from idle to collecting on start', () => {
      const { result } = renderHook(() => useCalibration())

      act(() => {
        result.current.startCalibration()
      })

      expect(result.current.status).toBe('collecting')
      expect(result.current.progress).toBe(0)
    })

    it('should update progress over time', () => {
      const { result } = renderHook(() => useCalibration())

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(1500)
      })

      expect(result.current.status).toBe('collecting')
      expect(result.current.progress).toBeGreaterThan(0)
      expect(result.current.progress).toBeLessThan(1)
    })

    it('should complete after 3 seconds', () => {
      const { result } = renderHook(() => useCalibration())

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(3100)
      })

      expect(result.current.status).toBe('completed')
      expect(result.current.progress).toBe(1)
    })

    it('should not start if already collecting', () => {
      const { result } = renderHook(() => useCalibration())

      act(() => {
        result.current.startCalibration()
      })

      expect(result.current.status).toBe('collecting')

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      const progressBefore = result.current.progress

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(100)
      })

      expect(result.current.progress).toBeGreaterThanOrEqual(progressBefore)
    })
  })

  describe('reset', () => {
    it('should reset from collecting to idle', () => {
      const { result } = renderHook(() => useCalibration())

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.status).toBe('collecting')

      act(() => {
        result.current.reset()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
      expect(result.current.error).toBeNull()
    })

    it('should reset from completed to idle', () => {
      const { result } = renderHook(() => useCalibration())

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(3100)
      })

      expect(result.current.status).toBe('completed')

      act(() => {
        result.current.reset()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
    })

    it('should reset from error to idle', async () => {
      window.electronAPI = createMockElectronAPI({
        startCalibration: vi
          .fn()
          .mockRejectedValue(new Error('Camera failed')),
      })

      const { result } = renderHook(() => useCalibration())

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('Camera failed')

      act(() => {
        result.current.reset()
      })

      expect(result.current.status).toBe('idle')
      expect(result.current.progress).toBe(0)
      expect(result.current.error).toBeNull()
    })
  })

  describe('with electronAPI', () => {
    it('should call startCalibration and complete on success', async () => {
      const mockStartCalibration = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        startCalibration: mockStartCalibration,
      })

      const { result } = renderHook(() => useCalibration())

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(mockStartCalibration).toHaveBeenCalledTimes(1)
      expect(result.current.status).toBe('completed')
      expect(result.current.progress).toBe(1)
    })

    it('should set error status when startCalibration fails', async () => {
      window.electronAPI = createMockElectronAPI({
        startCalibration: vi
          .fn()
          .mockRejectedValue(new Error('Camera not found')),
      })

      const { result } = renderHook(() => useCalibration())

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('Camera not found')
      expect(result.current.progress).toBe(0)
    })

    it('should handle non-Error rejection', async () => {
      window.electronAPI = createMockElectronAPI({
        startCalibration: vi.fn().mockRejectedValue('unknown error'),
      })

      const { result } = renderHook(() => useCalibration())

      await act(async () => {
        result.current.startCalibration()
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(result.current.status).toBe('error')
      expect(result.current.error).toBe('Calibration failed')
    })
  })

  describe('cleanup on unmount', () => {
    it('should clear interval when component unmounts during mock calibration', () => {
      const { result, unmount } = renderHook(() => useCalibration())

      act(() => {
        result.current.startCalibration()
      })

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(result.current.status).toBe('collecting')

      unmount()

      // Should not throw or cause issues when timers fire after unmount
      act(() => {
        vi.advanceTimersByTime(5000)
      })
    })
  })
})
