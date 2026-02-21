import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { IpcApi } from '@/types/ipc'

// Mock useCameraDevices
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

describe('CameraSettings', () => {
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

  it('should render camera selection dropdown', async () => {
    renderWithProvider(<CameraSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
    })

    const select = screen.getByTestId('camera-select')
    expect(select).toBeInTheDocument()
  })

  it('should display available cameras in dropdown', async () => {
    renderWithProvider(<CameraSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
    })

    const select = screen.getByTestId('camera-select') as HTMLSelectElement
    const options = select.querySelectorAll('option')
    // default option + 2 cameras
    expect(options).toHaveLength(3)
    expect(options[1].textContent).toBe('FaceTime HD Camera')
    expect(options[2].textContent).toBe('External USB Camera')
  })

  it('should show loading state when devices are loading', async () => {
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

    expect(screen.getByTestId('camera-devices-loading')).toBeInTheDocument()
  })

  it('should show error when device enumeration fails', async () => {
    mockUseCameraDevices.mockReturnValue({
      devices: [],
      loading: false,
      error: 'Permission denied',
      refresh: mockRefresh,
    })

    renderWithProvider(<CameraSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
    })

    expect(screen.getByTestId('camera-devices-error')).toHaveTextContent('Permission denied')
  })

  it('should call updateDisplay when camera is selected', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<CameraSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
    })

    const select = screen.getByTestId('camera-select')
    fireEvent.change(select, { target: { value: 'cam2' } })

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          display: expect.objectContaining({ selectedCamera: 'cam2' }),
        }),
      )
    })
  })

  it('should show selected camera from settings', async () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, selectedCamera: 'cam2' },
      }),
    })

    renderWithProvider(<CameraSettings />)

    await waitFor(() => {
      const select = screen.getByTestId('camera-select') as HTMLSelectElement
      expect(select.value).toBe('cam2')
    })
  })

  it('should render video preview element', async () => {
    renderWithProvider(<CameraSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('camera-settings')).toBeInTheDocument()
    })

    expect(screen.getByTestId('camera-preview')).toBeInTheDocument()
  })

  it('should show empty camera list message when no cameras available', async () => {
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

    expect(screen.getByTestId('no-cameras-hint')).toBeInTheDocument()
  })
})
