/**
 * Cross-testing: App.tsx stopAsync integration
 * Written by notification-dev to verify handleStartCalibration awaits stopAsync
 * before switching to calibration page.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_SETTINGS, type CalibrationData, type PostureSettings } from '@/types/settings'
import type { UsePostureDetectionReturn, DetectionState } from '@/hooks/usePostureDetection'
import type { UseSettingsReturn } from '@/hooks/useSettings'

// --- Mocks ---

let stopAsyncResolve: (() => void) | null = null

const mockDetection: UsePostureDetectionReturn = {
  state: 'detecting' as DetectionState,
  lastStatus: null,
  lastAngles: null,
  lastDeviations: null,
  error: null,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  stopAsync: vi.fn().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        stopAsyncResolve = resolve
      }),
  ),
  pause: vi.fn(),
  resume: vi.fn(),
  updateDetectionSettings: vi.fn(),
  updateCalibration: vi.fn(),
}

const CALIBRATION: CalibrationData = {
  headForwardAngle: 10,
  torsoAngle: 5,
  headTiltAngle: 0,
  faceFrameRatio: 0.15,
  shoulderDiff: 0,
  timestamp: Date.now(),
}

let mockSettings: PostureSettings = {
  ...DEFAULT_SETTINGS,
  calibration: CALIBRATION,
}
let mockLoading = false

const mockUseSettings: UseSettingsReturn = {
  settings: mockSettings,
  loading: mockLoading,
  error: null,
  updateSettings: vi.fn().mockResolvedValue(undefined),
  updateDetection: vi.fn().mockResolvedValue(undefined),
  updateReminder: vi.fn().mockResolvedValue(undefined),
  reloadSettings: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/hooks/usePostureDetection', () => ({
  usePostureDetection: () => mockDetection,
}))

vi.mock('@/hooks/useSettings', () => ({
  useSettings: () => ({
    ...mockUseSettings,
    settings: mockSettings,
    loading: mockLoading,
  }),
}))

vi.mock('@/components/settings/SettingsLayout', () => ({
  SettingsLayout: ({ onStartCalibration }: { onStartCalibration?: () => void }) => (
    <div data-testid="settings-layout">
      <button data-testid="start-calibration-btn" onClick={onStartCalibration}>
        Start Calibration
      </button>
    </div>
  ),
}))

vi.mock('@/components/calibration/CalibrationPage', () => ({
  CalibrationPage: ({ onComplete }: { onComplete?: () => void }) => (
    <div data-testid="calibration-page">
      <button data-testid="calibration-complete-btn" onClick={onComplete}>
        Complete
      </button>
    </div>
  ),
}))

import { App } from '@/App'

describe('App - stopAsync integration (cross-test)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stopAsyncResolve = null
    mockDetection.state = 'detecting'
    mockDetection.stopAsync = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          stopAsyncResolve = resolve
        }),
    )
    mockSettings = { ...DEFAULT_SETTINGS, calibration: CALIBRATION }
    mockLoading = false
  })

  it('does NOT navigate to calibration page until stopAsync resolves', async () => {
    const user = userEvent.setup()
    render(<App />)

    // Click the calibration button — handleStartCalibration fires
    await user.click(screen.getByTestId('start-calibration-btn'))

    // stopAsync was called
    expect(mockDetection.stopAsync).toHaveBeenCalled()

    // But page should still show settings because stopAsync hasn't resolved
    expect(screen.queryByTestId('settings-layout')).toBeTruthy()
    expect(screen.queryByTestId('calibration-page')).toBeNull()

    // Now resolve stopAsync
    await vi.waitFor(() => {
      expect(stopAsyncResolve).not.toBeNull()
    })
    stopAsyncResolve?.()

    // After resolution, calibration page should appear
    await vi.waitFor(() => {
      expect(screen.queryByTestId('calibration-page')).toBeTruthy()
    })
  })

  it('calls stopAsync instead of synchronous stop when entering calibration', async () => {
    const user = userEvent.setup()
    // Make stopAsync resolve immediately for this test
    mockDetection.stopAsync = vi.fn().mockResolvedValue(undefined)

    render(<App />)

    await user.click(screen.getByTestId('start-calibration-btn'))

    expect(mockDetection.stopAsync).toHaveBeenCalled()
    // Synchronous stop should NOT have been called directly
    expect(mockDetection.stop).not.toHaveBeenCalled()
  })

  it('navigates to calibration even if detection was idle (stopAsync is still called)', async () => {
    const user = userEvent.setup()
    mockDetection.state = 'idle'
    mockDetection.stopAsync = vi.fn().mockResolvedValue(undefined)

    render(<App />)

    await user.click(screen.getByTestId('start-calibration-btn'))

    // stopAsync is called unconditionally — the hook handles the no-stream case
    expect(mockDetection.stopAsync).toHaveBeenCalled()

    // Should navigate to calibration
    await vi.waitFor(() => {
      expect(screen.queryByTestId('calibration-page')).toBeTruthy()
    })
  })
})
