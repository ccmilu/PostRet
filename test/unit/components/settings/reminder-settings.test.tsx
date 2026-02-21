import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ReminderSettings } from '@/components/settings/ReminderSettings'
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

describe('ReminderSettings', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).electronAPI
  })

  it('should show loading state initially with electronAPI', () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockReturnValue(new Promise(() => {})),
    })

    renderWithProvider(<ReminderSettings />)

    expect(
      screen.getByTestId('reminder-settings-loading'),
    ).toBeInTheDocument()
  })

  it('should render all three toggles after loading', async () => {
    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('屏幕模糊')).toBeInTheDocument()
    expect(screen.getByLabelText('提示音')).toBeInTheDocument()
    expect(screen.getByLabelText('系统通知')).toBeInTheDocument()
  })

  it('should render delay and fade-out sliders', async () => {
    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('触发延迟')).toBeInTheDocument()
    expect(screen.getByLabelText('渐变消除时长')).toBeInTheDocument()
  })

  it('should reflect default toggle values', async () => {
    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    const blurToggle = screen.getByLabelText('屏幕模糊') as HTMLInputElement
    const soundToggle = screen.getByLabelText('提示音') as HTMLInputElement
    const notificationToggle = screen.getByLabelText(
      '系统通知',
    ) as HTMLInputElement

    expect(blurToggle.checked).toBe(true)
    expect(soundToggle.checked).toBe(false)
    expect(notificationToggle.checked).toBe(true)
  })

  it('should persist toggle changes via setSettings', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    const soundToggle = screen.getByLabelText('提示音')
    fireEvent.click(soundToggle)

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const savedSettings = mockSetSettings.mock.calls[0][0]
    expect(savedSettings.reminder.sound).toBe(true)
  })

  it('should update delay slider value', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    const delaySlider = screen.getByLabelText('触发延迟') as HTMLInputElement
    fireEvent.change(delaySlider, { target: { value: '10000' } })

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const savedSettings = mockSetSettings.mock.calls[0][0]
    expect(savedSettings.reminder.delayMs).toBe(10000)
  })

  it('should update fade-out duration slider value', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    const fadeOutSlider = screen.getByLabelText(
      '渐变消除时长',
    ) as HTMLInputElement
    fireEvent.change(fadeOutSlider, { target: { value: '3000' } })

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const savedSettings = mockSetSettings.mock.calls[0][0]
    expect(savedSettings.reminder.fadeOutDurationMs).toBe(3000)
  })

  it('should display fade-out hint with formatted time', async () => {
    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    // Default fadeOutDurationMs is 1500 → "1.5s"
    expect(screen.getByText(/消除 1\.5s/)).toBeInTheDocument()
  })

  it('should display delay hint with formatted time', async () => {
    renderWithProvider(<ReminderSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    })

    // Default delayMs is 5000 → "5s"
    expect(screen.getByText(/延迟 5s/)).toBeInTheDocument()
  })
})
