import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GeneralSettings } from '@/components/settings/GeneralSettings'
import { SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { IpcApi } from '@/types/ipc'

// Mock CameraSettings to avoid navigator.mediaDevices dependency in jsdom
vi.mock('@/components/settings/CameraSettings', () => ({
  CameraSettings: () => <div data-testid="camera-settings">camera settings</div>,
}))

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

describe('GeneralSettings', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).electronAPI
  })

  it('should show loading state initially with electronAPI', () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockReturnValue(new Promise(() => {})),
    })

    renderWithProvider(<GeneralSettings />)

    expect(screen.getByTestId('general-settings-loading')).toBeInTheDocument()
  })

  it('should render detection toggle and status after loading', async () => {
    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('启用姿态检测')).toBeInTheDocument()
    expect(screen.getByTestId('status-badge')).toBeInTheDocument()
  })

  it('should show "未校准" when calibration is null and detection is enabled', async () => {
    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    expect(screen.getByTestId('status-badge')).toHaveTextContent('未校准')
  })

  it('should show "已暂停" when detection is disabled', async () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }),
    })

    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    expect(screen.getByTestId('status-badge')).toHaveTextContent('已暂停')
  })

  it('should show "检测中" when enabled and calibrated', async () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        calibration: {
          headForwardAngle: 10,
          torsoAngle: 5,
          headTiltAngle: 2,
          faceFrameRatio: 0.3,
          shoulderDiff: 0.01,
          timestamp: Date.now(),
        },
      }),
    })

    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    expect(screen.getByTestId('status-badge')).toHaveTextContent('检测中')
  })

  it('should call onStartCalibration when calibration button is clicked', async () => {
    const mockOnStart = vi.fn()
    renderWithProvider(<GeneralSettings onStartCalibration={mockOnStart} />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('start-calibration-btn'))

    expect(mockOnStart).toHaveBeenCalledTimes(1)
  })

  it('should toggle detection enabled via useSettings', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    const toggle = screen.getByLabelText('启用姿态检测')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })
  })

  it('should render auto-launch toggle', async () => {
    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('开机自启')).toBeInTheDocument()
  })

  it('should toggle auto-launch via updateDisplay', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    })

    const toggle = screen.getByLabelText('开机自启')
    fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          display: expect.objectContaining({ autoLaunch: true }),
        }),
      )
    })
  })

  it('should show last calibration timestamp when calibrated', async () => {
    const timestamp = new Date('2026-02-20T10:00:00Z').getTime()
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        calibration: {
          headForwardAngle: 10,
          torsoAngle: 5,
          headTiltAngle: 2,
          faceFrameRatio: 0.3,
          shoulderDiff: 0.01,
          timestamp,
        },
      }),
    })

    renderWithProvider(<GeneralSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('calibration-done-hint')).toBeInTheDocument()
    })

    expect(screen.getByTestId('calibration-done-hint').textContent).toContain(
      '上次校准',
    )
  })
})
