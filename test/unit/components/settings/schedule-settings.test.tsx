import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ScheduleSettings } from '@/components/settings/ScheduleSettings'
import { SettingsProvider } from '@/hooks/useSettings'

function renderWithProvider(ui: ReactNode) {
  return render(<SettingsProvider>{ui}</SettingsProvider>)
}

describe('ScheduleSettings', () => {
  it('should render with panel title "计划"', async () => {
    renderWithProvider(<ScheduleSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('schedule-settings')).toBeInTheDocument()
    })

    expect(screen.getByText('计划')).toBeInTheDocument()
  })

  it('should render IgnorePeriodsSettings inside', async () => {
    renderWithProvider(<ScheduleSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('ignore-period-add')).toBeInTheDocument()
    })

    expect(screen.getByLabelText('周末不检测')).toBeInTheDocument()
  })
})
