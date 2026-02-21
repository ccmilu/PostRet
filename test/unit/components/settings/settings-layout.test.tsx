import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { IpcApi } from '@/types/ipc'

// Mock child components to isolate SettingsLayout tests
vi.mock('@/components/settings/GeneralSettings', () => ({
  GeneralSettings: ({ onStartCalibration }: { onStartCalibration?: () => void }) => (
    <div data-testid="general-settings">
      <button data-testid="mock-calibration-btn" onClick={onStartCalibration}>
        mock calibration
      </button>
    </div>
  ),
}))

vi.mock('@/components/settings/DetectionSettings', () => ({
  DetectionSettings: () => <div data-testid="detection-settings">detection panel</div>,
}))

vi.mock('@/components/settings/ReminderSettings', () => ({
  ReminderSettings: () => <div data-testid="reminder-settings">reminder panel</div>,
}))

vi.mock('@/components/settings/ScheduleSettings', () => ({
  ScheduleSettings: () => <div data-testid="schedule-settings">schedule panel</div>,
}))

vi.mock('@/components/settings/DebugPanel', () => ({
  DebugPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="debug-panel">
      <button data-testid="mock-debug-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}))

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

function renderWithProvider(ui: ReactNode) {
  return render(<SettingsProvider>{ui}</SettingsProvider>)
}

describe('SettingsLayout', () => {
  afterEach(() => {
    delete (window as Record<string, unknown>).electronAPI
  })

  it('should render sidebar with four tabs', () => {
    renderWithProvider(<SettingsLayout />)

    expect(screen.getByTestId('settings-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-general')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-detection')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-reminder')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-schedule')).toBeInTheDocument()
  })

  it('should show GeneralSettings by default', () => {
    renderWithProvider(<SettingsLayout />)

    expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('reminder-settings')).not.toBeInTheDocument()
  })

  it('should switch to ReminderSettings when reminder tab is clicked', () => {
    renderWithProvider(<SettingsLayout />)

    fireEvent.click(screen.getByTestId('settings-tab-reminder'))

    expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('general-settings')).not.toBeInTheDocument()
  })

  it('should switch back to GeneralSettings when general tab is clicked', () => {
    renderWithProvider(<SettingsLayout />)

    fireEvent.click(screen.getByTestId('settings-tab-reminder'))
    fireEvent.click(screen.getByTestId('settings-tab-general'))

    expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('reminder-settings')).not.toBeInTheDocument()
  })

  it('should mark active tab with aria-selected', () => {
    renderWithProvider(<SettingsLayout />)

    expect(screen.getByTestId('settings-tab-general')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByTestId('settings-tab-reminder')).toHaveAttribute(
      'aria-selected',
      'false',
    )

    fireEvent.click(screen.getByTestId('settings-tab-reminder'))

    expect(screen.getByTestId('settings-tab-general')).toHaveAttribute(
      'aria-selected',
      'false',
    )
    expect(screen.getByTestId('settings-tab-reminder')).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('should switch to DetectionSettings when detection tab is clicked', () => {
    renderWithProvider(<SettingsLayout />)

    fireEvent.click(screen.getByTestId('settings-tab-detection'))

    expect(screen.getByTestId('detection-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('general-settings')).not.toBeInTheDocument()
  })

  it('should switch to ScheduleSettings when schedule tab is clicked', () => {
    renderWithProvider(<SettingsLayout />)

    fireEvent.click(screen.getByTestId('settings-tab-schedule'))

    expect(screen.getByTestId('schedule-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('general-settings')).not.toBeInTheDocument()
  })

  it('should pass onStartCalibration to GeneralSettings', () => {
    const mockOnStartCalibration = vi.fn()
    renderWithProvider(<SettingsLayout onStartCalibration={mockOnStartCalibration} />)

    fireEvent.click(screen.getByTestId('mock-calibration-btn'))

    expect(mockOnStartCalibration).toHaveBeenCalledTimes(1)
  })

  it('should render version text at the bottom of sidebar', () => {
    renderWithProvider(<SettingsLayout />)

    const versionText = screen.getByTestId('version-text')
    expect(versionText).toBeInTheDocument()
    expect(versionText).toHaveTextContent('v0.1.0')
  })

  it('should not show debug tab by default', () => {
    renderWithProvider(<SettingsLayout />)

    expect(screen.queryByTestId('settings-tab-debug')).not.toBeInTheDocument()
  })

  it('should show debug tab after 5 rapid clicks on version text', () => {
    renderWithProvider(<SettingsLayout />)

    const versionText = screen.getByTestId('version-text')

    for (let i = 0; i < 5; i++) {
      fireEvent.click(versionText)
    }

    expect(screen.getByTestId('settings-tab-debug')).toBeInTheDocument()
  })

  it('should show debug tab when settings have debugMode enabled', async () => {
    window.electronAPI = createMockElectronAPI({
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS,
        advanced: { debugMode: true },
      }),
    })

    renderWithProvider(<SettingsLayout />)

    // Settings load asynchronously; once loaded, debugMode=true should show the debug tab
    await waitFor(() => {
      expect(screen.getByTestId('settings-tab-debug')).toBeInTheDocument()
    })
  })

  it('should show debug-no-detection message when detection is not provided and debug tab active', () => {
    renderWithProvider(<SettingsLayout />)

    // Enable debug mode
    const versionText = screen.getByTestId('version-text')
    for (let i = 0; i < 5; i++) {
      fireEvent.click(versionText)
    }

    // Switch to debug tab
    fireEvent.click(screen.getByTestId('settings-tab-debug'))

    expect(screen.getByTestId('debug-no-detection')).toBeInTheDocument()
  })
})
