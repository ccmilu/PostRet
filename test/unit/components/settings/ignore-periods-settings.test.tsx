import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { IgnorePeriodsSettings } from '@/components/settings/IgnorePeriodsSettings'
import { SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { PostureSettings } from '@/types/settings'
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

function settingsWithPeriods(periods: { start: string; end: string }[]): PostureSettings {
  return {
    ...DEFAULT_SETTINGS,
    display: {
      ...DEFAULT_SETTINGS.display,
      ignorePeriods: periods,
    },
  }
}

describe('IgnorePeriodsSettings', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).electronAPI
  })

  it('should render weekend ignore toggle', async () => {
    renderWithProvider(<IgnorePeriodsSettings />)

    await waitFor(() => {
      expect(screen.getByLabelText('周末不检测')).toBeInTheDocument()
    })
  })

  it('should show empty state when no periods configured', async () => {
    renderWithProvider(<IgnorePeriodsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('ignore-period-add')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('ignore-period-list')).not.toBeInTheDocument()
  })

  it('should display existing ignore periods', async () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockResolvedValue(
        settingsWithPeriods([
          { start: '12:00', end: '13:00' },
          { start: '18:00', end: '19:00' },
        ]),
      ),
    })

    renderWithProvider(<IgnorePeriodsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('ignore-period-list')).toBeInTheDocument()
    })

    expect(screen.getByTestId('ignore-period-0')).toHaveTextContent('12:00 - 13:00')
    expect(screen.getByTestId('ignore-period-1')).toHaveTextContent('18:00 - 19:00')
  })

  it('should add a new period when add button is clicked', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<IgnorePeriodsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('ignore-period-add')).toBeInTheDocument()
    })

    // Default period is 12:00-13:00, change it
    const startInput = screen.getByTestId('new-period-start')
    const endInput = screen.getByTestId('new-period-end')

    fireEvent.change(startInput, { target: { value: '09:00' } })
    fireEvent.change(endInput, { target: { value: '10:00' } })

    fireEvent.click(screen.getByTestId('add-period-btn'))

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const lastCall = mockSetSettings.mock.calls[mockSetSettings.mock.calls.length - 1][0]
    expect(lastCall.display.ignorePeriods).toEqual([{ start: '09:00', end: '10:00' }])
  })

  it('should not add period when start equals end', async () => {
    renderWithProvider(<IgnorePeriodsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('ignore-period-add')).toBeInTheDocument()
    })

    const startInput = screen.getByTestId('new-period-start')
    const endInput = screen.getByTestId('new-period-end')

    fireEvent.change(startInput, { target: { value: '12:00' } })
    fireEvent.change(endInput, { target: { value: '12:00' } })

    expect(screen.getByTestId('add-period-btn')).toBeDisabled()
  })

  it('should remove a period when remove button is clicked', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockResolvedValue(
        settingsWithPeriods([
          { start: '12:00', end: '13:00' },
          { start: '18:00', end: '19:00' },
        ]),
      ),
      setSettings: mockSetSettings,
    })

    renderWithProvider(<IgnorePeriodsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('ignore-period-list')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('remove-period-0'))

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const lastCall = mockSetSettings.mock.calls[mockSetSettings.mock.calls.length - 1][0]
    expect(lastCall.display.ignorePeriods).toEqual([{ start: '18:00', end: '19:00' }])
  })

  it('should toggle weekendIgnore and trigger IPC update', async () => {
    const mockSetSettings = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = createMockElectronAPI({
      setSettings: mockSetSettings,
    })

    renderWithProvider(<IgnorePeriodsSettings />)

    await waitFor(() => {
      expect(screen.getByLabelText('周末不检测')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('周末不检测'))

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalled()
    })

    const lastCall = mockSetSettings.mock.calls[mockSetSettings.mock.calls.length - 1][0]
    expect(lastCall.display.weekendIgnore).toBe(true)
  })
})
