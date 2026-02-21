import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsLayout } from '@/components/settings/SettingsLayout'

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

vi.mock('@/components/settings/ReminderSettings', () => ({
  ReminderSettings: () => <div data-testid="reminder-settings">reminder panel</div>,
}))

describe('SettingsLayout', () => {
  it('should render sidebar with two tabs', () => {
    render(<SettingsLayout />)

    expect(screen.getByTestId('settings-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-general')).toBeInTheDocument()
    expect(screen.getByTestId('settings-tab-reminder')).toBeInTheDocument()
  })

  it('should show GeneralSettings by default', () => {
    render(<SettingsLayout />)

    expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('reminder-settings')).not.toBeInTheDocument()
  })

  it('should switch to ReminderSettings when reminder tab is clicked', () => {
    render(<SettingsLayout />)

    fireEvent.click(screen.getByTestId('settings-tab-reminder'))

    expect(screen.getByTestId('reminder-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('general-settings')).not.toBeInTheDocument()
  })

  it('should switch back to GeneralSettings when general tab is clicked', () => {
    render(<SettingsLayout />)

    fireEvent.click(screen.getByTestId('settings-tab-reminder'))
    fireEvent.click(screen.getByTestId('settings-tab-general'))

    expect(screen.getByTestId('general-settings')).toBeInTheDocument()
    expect(screen.queryByTestId('reminder-settings')).not.toBeInTheDocument()
  })

  it('should mark active tab with aria-selected', () => {
    render(<SettingsLayout />)

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

  it('should pass onStartCalibration to GeneralSettings', () => {
    const mockOnStartCalibration = vi.fn()
    render(<SettingsLayout onStartCalibration={mockOnStartCalibration} />)

    fireEvent.click(screen.getByTestId('mock-calibration-btn'))

    expect(mockOnStartCalibration).toHaveBeenCalledTimes(1)
  })
})
