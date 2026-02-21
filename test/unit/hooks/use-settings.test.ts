import { renderHook, act, waitFor, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createElement, useEffect, useRef } from 'react'
import { useSettings, SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { PostureSettings } from '@/types/settings'
import type { IpcApi } from '@/types/ipc'

function wrapper({ children }: { children: ReactNode }) {
  return createElement(SettingsProvider, null, children)
}

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
      const { result } = renderHook(() => useSettings(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.settings).toEqual(DEFAULT_SETTINGS)
      expect(result.current.error).toBeNull()
    })

    it('should update settings in local state when electronAPI is not available', async () => {
      const { result } = renderHook(() => useSettings(), { wrapper })

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

      const { result } = renderHook(() => useSettings(), { wrapper })

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

      const { result } = renderHook(() => useSettings(), { wrapper })

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

      const { result } = renderHook(() => useSettings(), { wrapper })

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

      const { result } = renderHook(() => useSettings(), { wrapper })

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

      const { result } = renderHook(() => useSettings(), { wrapper })

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

      const { result } = renderHook(() => useSettings(), { wrapper })

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

  describe('reloadSettings', () => {
    it('should expose reloadSettings function', async () => {
      const { result } = renderHook(() => useSettings(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(typeof result.current.reloadSettings).toBe('function')
    })

    it('should reload settings from electronAPI when called', async () => {
      const calibrationData = {
        headForwardAngle: 10,
        torsoAngle: 5,
        headTiltAngle: 0,
        faceFrameRatio: 0.15,
        shoulderDiff: 0,
        timestamp: Date.now(),
      }

      const mockGetSettings = vi.fn()
        .mockResolvedValueOnce({ ...DEFAULT_SETTINGS }) // initial load
        .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, calibration: calibrationData }) // reload

      window.electronAPI = createMockElectronAPI({
        getSettings: mockGetSettings,
      })

      const { result } = renderHook(() => useSettings(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // Initially no calibration data
      expect(result.current.settings.calibration).toBeNull()

      // Reload settings
      await act(async () => {
        await result.current.reloadSettings()
      })

      // Now should have calibration data
      expect(result.current.settings.calibration).toEqual(calibrationData)
      expect(mockGetSettings).toHaveBeenCalledTimes(2)
    })

    it('should set error when reloadSettings fails', async () => {
      const mockGetSettings = vi.fn()
        .mockResolvedValueOnce({ ...DEFAULT_SETTINGS }) // initial load succeeds
        .mockRejectedValueOnce(new Error('Reload failed')) // reload fails

      window.electronAPI = createMockElectronAPI({
        getSettings: mockGetSettings,
      })

      const { result } = renderHook(() => useSettings(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.reloadSettings()
      })

      expect(result.current.error).toBe('Reload failed')
    })

    it('should be a no-op without electronAPI', async () => {
      const { result } = renderHook(() => useSettings(), { wrapper })

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      const settingsBefore = result.current.settings

      await act(async () => {
        await result.current.reloadSettings()
      })

      // Settings should remain unchanged
      expect(result.current.settings).toEqual(settingsBefore)
      expect(result.current.error).toBeNull()
    })
  })

  describe('immutability', () => {
    it('should return new settings object on update', async () => {
      const { result } = renderHook(() => useSettings(), { wrapper })

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

  describe('SettingsProvider singleton behavior', () => {
    it('should provide the same settings reference to two components under the same provider', async () => {
      // Two independent hooks rendered under the same SettingsProvider
      // should read from the same shared state.
      const settingsA: PostureSettings[] = []
      const settingsB: PostureSettings[] = []

      function ComponentA() {
        const { settings } = useSettings()
        // Capture into outer array via ref to avoid re-render loops
        const captured = useRef(false)
        useEffect(() => {
          if (!captured.current) {
            captured.current = true
            settingsA.push(settings)
          }
        }, [settings])
        return createElement('div', { 'data-testid': 'a' })
      }

      function ComponentB() {
        const { settings } = useSettings()
        const captured = useRef(false)
        useEffect(() => {
          if (!captured.current) {
            captured.current = true
            settingsB.push(settings)
          }
        }, [settings])
        return createElement('div', { 'data-testid': 'b' })
      }

      render(
        createElement(
          SettingsProvider,
          null,
          createElement(ComponentA),
          createElement(ComponentB),
        ),
      )

      await waitFor(() => {
        expect(settingsA.length).toBeGreaterThan(0)
        expect(settingsB.length).toBeGreaterThan(0)
      })

      // Both components should see the exact same object reference
      expect(settingsA[0]).toBe(settingsB[0])
    })

    it('should reflect updateDetection from one component in another component', async () => {
      window.electronAPI = createMockElectronAPI()

      let updateFn: ((partial: { sensitivity: number }) => Promise<void>) | null = null
      let readSettings: PostureSettings | null = null

      function Writer() {
        const { updateDetection } = useSettings()
        updateFn = updateDetection
        return createElement('div')
      }

      function Reader() {
        const { settings } = useSettings()
        readSettings = settings
        return createElement('div')
      }

      render(
        createElement(
          SettingsProvider,
          null,
          createElement(Writer),
          createElement(Reader),
        ),
      )

      // Wait for initial load to complete
      await waitFor(() => {
        expect(readSettings).not.toBeNull()
        expect(updateFn).not.toBeNull()
      })

      // Writer updates detection sensitivity
      await act(async () => {
        await updateFn!({ sensitivity: 0.99 })
      })

      // Reader should see the updated value
      expect(readSettings!.detection.sensitivity).toBe(0.99)
    })

    it('should throw error when useSettings is used outside SettingsProvider', () => {
      // Suppress React error boundary console output for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useSettings())
      }).toThrow('useSettings must be used within a <SettingsProvider>')

      consoleSpy.mockRestore()
    })
  })
})
