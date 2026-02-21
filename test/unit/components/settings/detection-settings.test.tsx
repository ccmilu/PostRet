import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { DetectionSettings } from '@/components/settings/DetectionSettings'
import { SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { IpcApi } from '@/types/ipc'

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

describe('DetectionSettings', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).electronAPI
  })

  it('should show loading state initially with electronAPI', () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockReturnValue(new Promise(() => {})),
    })

    renderWithProvider(<DetectionSettings />)

    expect(screen.getByTestId('detection-settings-loading')).toBeInTheDocument()
  })

  it('should render detection settings after loading', async () => {
    renderWithProvider(<DetectionSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('detection-settings')).toBeInTheDocument()
    })

    // Should show 4 rule toggles
    expect(screen.getByLabelText('头部前倾')).toBeInTheDocument()
    expect(screen.getByLabelText('歪头')).toBeInTheDocument()
    expect(screen.getByLabelText('距屏幕太近')).toBeInTheDocument()
    expect(screen.getByLabelText('肩膀不对称')).toBeInTheDocument()
  })

  it('should not show the slouch toggle (暂不启用)', async () => {
    renderWithProvider(<DetectionSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('detection-settings')).toBeInTheDocument()
    })

    expect(screen.queryByLabelText('驼背弯腰')).not.toBeInTheDocument()
  })

  it('should show detection frequency and sensitivity sliders', async () => {
    renderWithProvider(<DetectionSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('detection-settings')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('检测频率')).toBeInTheDocument()
    expect(screen.getByLabelText('检测灵敏度')).toBeInTheDocument()
  })

  it('should toggle a rule and trigger IPC update', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<DetectionSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('detection-settings')).toBeInTheDocument()
    })

    // Turn off head tilt (default on)
    const headTiltToggle = screen.getByLabelText('歪头')
    fireEvent.click(headTiltToggle)

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const lastCall = mockSetSettings.mock.calls[mockSetSettings.mock.calls.length - 1][0]
    expect(lastCall.detection.rules.headTilt).toBe(false)
  })

  it('should update detection interval via slider', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<DetectionSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('detection-settings')).toBeInTheDocument()
    })

    const frequencySlider = screen.getByLabelText('检测频率')
    fireEvent.change(frequencySlider, { target: { value: '1000' } })

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const lastCall = mockSetSettings.mock.calls[mockSetSettings.mock.calls.length - 1][0]
    expect(lastCall.detection.intervalMs).toBe(1000)
  })
})
