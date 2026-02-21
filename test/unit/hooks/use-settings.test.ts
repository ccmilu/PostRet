import { renderHook, act, waitFor } from '@testing-library/react'
import { useSettings } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { PostureSettings } from '@/types/settings'
import type { IpcApi } from '@/types/ipc'

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

describe('useSettings', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).electronAPI
  })

  describe('without electronAPI (fallback mode)', () => {
    it('should return DEFAULT_SETTINGS when electronAPI is not available', async () => {
      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
      expect(result.current.error).toBeNull()
    })

    it('should update settings in local state when electronAPI is not available', async () => {
      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateSettings({
          detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
        })
      })

      expect(result.current.settings.detection.enabled).toBe(false)
    })
  })

  describe('with electronAPI', () => {
    it('should load settings from electronAPI on mount', async () => {
      const customSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        detection: { ...DEFAULT_SETTINGS.detection, sensitivity: 0.8 },
      }
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockResolvedValue(customSettings),
      })

      const { result } = renderHook(() => useSettings())

      expect(result.current.loading).toBe(true)

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.settings.detection.sensitivity).toBe(0.8)
      expect(window.electronAPI.getSettings).toHaveBeenCalledTimes(1)
    })

    it('should set error when getSettings fails', async () => {
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockRejectedValue(new Error('IPC error')),
      })

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('IPC error')
      expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
    })

    it('should persist settings via setSettings', async () => {
      const mockSetSettings = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        setSettings: mockSetSettings,
      })

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateSettings({
          detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
        })
      })

      expect(mockSetSettings).toHaveBeenCalledTimes(1)
      const savedSettings = mockSetSettings.mock.calls[0][0] as PostureSettings
      expect(savedSettings.detection.enabled).toBe(false)
    })

    it('should rollback settings and set error when setSettings fails', async () => {
      window.electronAPI = createMockElectronAPI({
        setSettings: vi.fn().mockRejectedValue(new Error('Save failed')),
      })

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const originalSettings = result.current.settings

      await act(async () => {
        await result.current.updateSettings({
          detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
        })
      })

      expect(result.current.error).toBe('Save failed')
      expect(result.current.settings).toEqual(originalSettings)
    })
  })

  describe('updateDetection', () => {
    it('should update only detection settings immutably', async () => {
      window.electronAPI = createMockElectronAPI()

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const originalReminder = result.current.settings.reminder

      await act(async () => {
        await result.current.updateDetection({ sensitivity: 0.9 })
      })

      expect(result.current.settings.detection.sensitivity).toBe(0.9)
      expect(result.current.settings.detection.enabled).toBe(
        DEFAULT_SETTINGS.detection.enabled,
      )
      expect(result.current.settings.reminder).toEqual(originalReminder)
    })
  })

  describe('updateReminder', () => {
    it('should update only reminder settings immutably', async () => {
      window.electronAPI = createMockElectronAPI()

      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const originalDetection = result.current.settings.detection

      await act(async () => {
        await result.current.updateReminder({ delayMs: 10000 })
      })

      expect(result.current.settings.reminder.delayMs).toBe(10000)
      expect(result.current.settings.reminder.blur).toBe(
        DEFAULT_SETTINGS.reminder.blur,
      )
      expect(result.current.settings.detection).toEqual(originalDetection)
    })
  })

  describe('immutability', () => {
    it('should return new settings object on update', async () => {
      const { result } = renderHook(() => useSettings())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const firstSettings = result.current.settings

      await act(async () => {
        await result.current.updateSettings({
          advanced: { debugMode: true },
        })
      })

      expect(result.current.settings).not.toBe(firstSettings)
      expect(result.current.settings.advanced.debugMode).toBe(true)
      expect(firstSettings.advanced.debugMode).toBe(false)
    })
  })
})
