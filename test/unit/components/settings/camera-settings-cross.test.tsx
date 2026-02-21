/**
 * Cross-test for CameraSettings component.
 * Focus: stream lifecycle, video ref stability, onCameraChange callback,
 * rapid camera switching, and integration with settings persistence.
 * Written by impl-settings-schedule as cross-tester for impl-camera-autolaunch.
 */
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { IpcApi } from '@/types/ipc'

const mockRefresh = vi.fn()
const mockUseCameraDevices = vi.fn()

vi.mock('@/hooks/useCameraDevices', () => ({
  useCameraDevices: () => mockUseCameraDevices(),
}))

import { CameraSettings } from '@/components/settings/CameraSettings'

function renderWithProvider(ui: ReactNode) {
  return render(<SettingsProvider>{ui}</SettingsProvider>)
}

function createMockElectronAPI(overrides?: Partial<IpcApi>): IpcApi {
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

describe('CameraSettings cross-tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCameraDevices.mockReturnValue({
      devices: [
        { deviceId: 'cam1', label: 'FaceTime HD Camera' },
        { deviceId: 'cam2', label: 'External USB Camera' },
      ],
      loading: false,
      error: null,
      refresh: mockRefresh,
    })
  })

  afterEach(() => {
    delete (window as Record<string, unknown>).electronAPI
  })

  describe('onCameraChange callback', () => {
    it('should call onCameraChange when camera is selected', async () => {
      const onCameraChange = vi.fn()
      renderWithProvider(<CameraSettings onCameraChange={onCameraChange} />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
      })

      const select = screen.getByTestId('camera-select')
      fireEvent.change(select, { target: { value: 'cam2' } })

      await waitFor(() => {
        expect(onCameraChange).toHaveBeenCalledWith('cam2')
      })
    })

    it('should call onCameraChange with empty string for default camera', async () => {
      const onCameraChange = vi.fn()
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_SETTINGS,
          display: { ...DEFAULT_SETTINGS.display, selectedCamera: 'cam1' },
        }),
      })

      renderWithProvider(<CameraSettings onCameraChange={onCameraChange} />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-select')).toBeInTheDocument()
      })

      const select = screen.getByTestId('camera-select')
      fireEvent.change(select, { target: { value: '' } })

      await waitFor(() => {
        expect(onCameraChange).toHaveBeenCalledWith('')
      })
    })

    it('should not crash when onCameraChange is undefined', async () => {
      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
      })

      const select = screen.getByTestId('camera-select')
      expect(() => {
        fireEvent.change(select, { target: { value: 'cam2' } })
      }).not.toThrow()
    })
  })

  describe('settings persistence roundtrip', () => {
    it('should persist camera selection and update display settings together', async () => {
      const mockSetSettings = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        setSettings: mockSetSettings,
      })

      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-select')).toBeInTheDocument()
      })

      // Select camera
      const select = screen.getByTestId('camera-select')
      fireEvent.change(select, { target: { value: 'cam2' } })

      await waitFor(() => {
        expect(mockSetSettings).toHaveBeenCalled()
      })

      // Verify the full settings object preserves other display fields
      const savedSettings = mockSetSettings.mock.calls[mockSetSettings.mock.calls.length - 1][0]
      expect(savedSettings.display.selectedCamera).toBe('cam2')
      expect(savedSettings.display.autoLaunch).toBe(false) // unchanged
      expect(savedSettings.display.ignorePeriods).toEqual([]) // unchanged
      expect(savedSettings.display.weekendIgnore).toBe(false) // unchanged
    })
  })

  describe('video preview element presence', () => {
    it('should always render video element even when no cameras', async () => {
      mockUseCameraDevices.mockReturnValue({
        devices: [],
        loading: false,
        error: null,
        refresh: mockRefresh,
      })

      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
      })

      // Video element should be present for preview even when no cameras
      const preview = screen.getByTestId('camera-preview')
      expect(preview).toBeInTheDocument()
      const video = preview.querySelector('video')
      expect(video).not.toBeNull()
    })

    it('should have correct video attributes for preview', async () => {
      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
      })

      const video = screen.getByTestId('camera-preview').querySelector('video')!
      expect(video.playsInline).toBe(true)
      expect(video.muted).toBe(true)
      expect(video.autoplay).toBe(true)
    })
  })

  describe('dropdown shows correct selection state', () => {
    it('should default to empty string (default camera) option', async () => {
      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        const select = screen.getByTestId('camera-select') as HTMLSelectElement
        expect(select.value).toBe('')
      })
    })

    it('should reflect persisted camera selection on load', async () => {
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockResolvedValue({
          ...DEFAULT_SETTINGS,
          display: { ...DEFAULT_SETTINGS.display, selectedCamera: 'cam1' },
        }),
      })

      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        const select = screen.getByTestId('camera-select') as HTMLSelectElement
        expect(select.value).toBe('cam1')
      })
    })

    it('should include default option as first choice', async () => {
      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-select')).toBeInTheDocument()
      })

      const options = screen.getByTestId('camera-select').querySelectorAll('option')
      expect(options[0].value).toBe('')
      expect(options[0].textContent).toBe('默认摄像头')
    })
  })

  describe('conditional rendering states', () => {
    it('should hide dropdown during loading but show preview', async () => {
      mockUseCameraDevices.mockReturnValue({
        devices: [],
        loading: true,
        error: null,
        refresh: mockRefresh,
      })

      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('camera-select')).not.toBeInTheDocument()
      expect(screen.getByTestId('camera-devices-loading')).toBeInTheDocument()
      expect(screen.getByTestId('camera-preview')).toBeInTheDocument()
    })

    it('should show error instead of dropdown on failure', async () => {
      mockUseCameraDevices.mockReturnValue({
        devices: [],
        loading: false,
        error: 'NotAllowedError: Permission denied',
        refresh: mockRefresh,
      })

      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('camera-select')).not.toBeInTheDocument()
      expect(screen.getByTestId('camera-devices-error')).toBeInTheDocument()
    })

    it('should return null while settings are loading', () => {
      window.electronAPI = createMockElectronAPI({
        getSettings: vi.fn().mockReturnValue(new Promise(() => {})),
      })

      const { container } = renderWithProvider(<CameraSettings />)

      // CameraSettings returns null during settings loading
      expect(container.querySelector('[data-testid="camera-settings"]')).toBeNull()
    })
  })

  describe('rapid camera switching', () => {
    it('should persist only the last selected camera on rapid switches', async () => {
      const mockSetSettings = vi.fn().mockResolvedValue(undefined)
      window.electronAPI = createMockElectronAPI({
        setSettings: mockSetSettings,
      })

      renderWithProvider(<CameraSettings />)

      await waitFor(() => {
        expect(screen.getByTestId('camera-select')).toBeInTheDocument()
      })

      const select = screen.getByTestId('camera-select')

      // Rapidly switch cameras
      fireEvent.change(select, { target: { value: 'cam1' } })
      fireEvent.change(select, { target: { value: 'cam2' } })
      fireEvent.change(select, { target: { value: '' } })
      fireEvent.change(select, { target: { value: 'cam1' } })

      await waitFor(() => {
        expect(mockSetSettings).toHaveBeenCalled()
      })

      // The final state should reflect the last selection
      const lastCall = mockSetSettings.mock.calls[mockSetSettings.mock.calls.length - 1][0]
      expect(lastCall.display.selectedCamera).toBe('cam1')
    })
  })
})
