import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_SETTINGS, type CalibrationData, type PostureSettings } from '@/types/settings'
import type { UsePostureDetectionReturn, DetectionState } from '@/hooks/usePostureDetection'
import type { UseSettingsReturn } from '@/hooks/useSettings'

// --- Mocks ---

const mockDetection: UsePostureDetectionReturn = {
  state: 'idle' as DetectionState,
  lastStatus: null,
  lastAngles: null,
  lastDeviations: null,
  error: null,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  updateDetectionSettings: vi.fn(),
  updateCalibration: vi.fn(),
}

const MOCK_CALIBRATION: CalibrationData = {
  headForwardAngle: 10,
  torsoAngle: 5,
  headTiltAngle: 0,
  faceFrameRatio: 0.15,
  shoulderDiff: 0,
  timestamp: Date.now(),
}

let mockSettings: PostureSettings = { ...DEFAULT_SETTINGS }
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

// Import after mocks
import { App } from '@/App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDetection.state = 'idle'
    mockDetection.lastStatus = null
    mockDetection.lastAngles = null
    mockDetection.lastDeviations = null
    mockDetection.error = null
    mockSettings = { ...DEFAULT_SETTINGS }
    mockLoading = false
  })

  describe('page rendering', () => {
    it('should render settings page by default', () => {
      render(<App />)
      expect(screen.getByTestId('settings-layout')).toBeTruthy()
    })

    it('should switch to calibration page when start calibration is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      await user.click(screen.getByTestId('start-calibration-btn'))

      expect(screen.getByTestId('calibration-page')).toBeTruthy()
    })

    it('should switch back to settings after calibration completes', async () => {
      const user = userEvent.setup()
      render(<App />)

      await user.click(screen.getByTestId('start-calibration-btn'))
      expect(screen.getByTestId('calibration-page')).toBeTruthy()

      await user.click(screen.getByTestId('calibration-complete-btn'))
      expect(screen.getByTestId('settings-layout')).toBeTruthy()
    })
  })

  describe('auto-start detection', () => {
    it('should auto-start detection when calibration data exists and not loading', () => {
      mockSettings = { ...DEFAULT_SETTINGS, calibration: MOCK_CALIBRATION }
      mockLoading = false
      mockDetection.state = 'idle'

      render(<App />)

      expect(mockDetection.start).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
        mockSettings.detection,
      )
    })

    it('should not start detection while loading', () => {
      mockSettings = { ...DEFAULT_SETTINGS, calibration: MOCK_CALIBRATION }
      mockLoading = true

      render(<App />)

      expect(mockDetection.start).not.toHaveBeenCalled()
    })

    it('should not start detection without calibration data', () => {
      mockSettings = { ...DEFAULT_SETTINGS, calibration: null }
      mockLoading = false

      render(<App />)

      expect(mockDetection.start).not.toHaveBeenCalled()
    })

    it('should not start detection when already detecting', () => {
      mockSettings = { ...DEFAULT_SETTINGS, calibration: MOCK_CALIBRATION }
      mockLoading = false
      mockDetection.state = 'detecting'

      render(<App />)

      expect(mockDetection.start).not.toHaveBeenCalled()
    })

    it('should retry detection when state is error (auto-recovery)', () => {
      mockSettings = { ...DEFAULT_SETTINGS, calibration: MOCK_CALIBRATION }
      mockLoading = false
      mockDetection.state = 'error'

      render(<App />)

      expect(mockDetection.start).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
        mockSettings.detection,
      )
    })

    it('should not start detection when detection is disabled', () => {
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }
      mockLoading = false

      render(<App />)

      expect(mockDetection.start).not.toHaveBeenCalled()
    })
  })

  describe('detection enabled toggle', () => {
    it('should stop detection when enabled changes to false while detecting', () => {
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }
      mockLoading = false
      mockDetection.state = 'detecting'

      render(<App />)

      expect(mockDetection.stop).toHaveBeenCalled()
    })

    it('should stop detection when enabled changes to false while paused', () => {
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }
      mockLoading = false
      mockDetection.state = 'paused'

      render(<App />)

      expect(mockDetection.stop).toHaveBeenCalled()
    })

    it('should stop detection when enabled changes to false while initializing', () => {
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }
      mockLoading = false
      mockDetection.state = 'initializing'

      render(<App />)

      expect(mockDetection.stop).toHaveBeenCalled()
    })

    it('should not stop detection when enabled is false but state is idle', () => {
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }
      mockLoading = false
      mockDetection.state = 'idle'

      render(<App />)

      expect(mockDetection.stop).not.toHaveBeenCalled()
    })

    it('should not stop when still loading even if enabled is false', () => {
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }
      mockLoading = true
      mockDetection.state = 'detecting'

      render(<App />)

      expect(mockDetection.stop).not.toHaveBeenCalled()
    })
  })

  describe('settings sync', () => {
    it('should sync detection settings when detecting', () => {
      mockDetection.state = 'detecting'
      mockSettings = { ...DEFAULT_SETTINGS, calibration: MOCK_CALIBRATION }

      render(<App />)

      expect(mockDetection.updateDetectionSettings).toHaveBeenCalledWith(
        mockSettings.detection,
      )
    })

    it('should sync calibration when detecting', () => {
      mockDetection.state = 'detecting'
      mockSettings = { ...DEFAULT_SETTINGS, calibration: MOCK_CALIBRATION }

      render(<App />)

      expect(mockDetection.updateCalibration).toHaveBeenCalledWith(MOCK_CALIBRATION)
    })

    it('should not sync settings when idle', () => {
      mockDetection.state = 'idle'
      mockSettings = { ...DEFAULT_SETTINGS }

      render(<App />)

      expect(mockDetection.updateDetectionSettings).not.toHaveBeenCalled()
    })
  })

  describe('calibration flow', () => {
    it('should stop detection when navigating to calibration', async () => {
      const user = userEvent.setup()
      render(<App />)

      await user.click(screen.getByTestId('start-calibration-btn'))

      expect(mockDetection.stop).toHaveBeenCalled()
    })

    it('should call reloadSettings when calibration completes', async () => {
      const user = userEvent.setup()
      render(<App />)

      // Navigate to calibration
      await user.click(screen.getByTestId('start-calibration-btn'))
      expect(screen.getByTestId('calibration-page')).toBeTruthy()

      // Complete calibration
      await user.click(screen.getByTestId('calibration-complete-btn'))

      // Should reload settings to pick up new calibration data
      expect(mockUseSettings.reloadSettings).toHaveBeenCalled()
    })

    it('should return to settings page after calibration completes', async () => {
      const user = userEvent.setup()
      render(<App />)

      await user.click(screen.getByTestId('start-calibration-btn'))
      await user.click(screen.getByTestId('calibration-complete-btn'))

      expect(screen.getByTestId('settings-layout')).toBeTruthy()
    })

    it('should auto-start detection after reload if calibration data is now available', () => {
      // Simulate state after reloadSettings: calibration data exists
      mockSettings = { ...DEFAULT_SETTINGS, calibration: MOCK_CALIBRATION }
      mockLoading = false
      mockDetection.state = 'idle'

      render(<App />)

      // Detection should start because calibration data exists and state is idle
      expect(mockDetection.start).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
        mockSettings.detection,
      )
    })

    it('should not auto-start detection if detection.enabled is false after reload', () => {
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: false },
      }
      mockLoading = false
      mockDetection.state = 'idle'

      render(<App />)

      expect(mockDetection.start).not.toHaveBeenCalled()
    })
  })

  describe('calibration-to-detection integration', () => {
    it('should start detection when calibration data exists and enabled is true', () => {
      // Initial state: has calibration data + enabled=true + idle => detection.start() called
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: true },
      }
      mockLoading = false
      mockDetection.state = 'idle'

      render(<App />)

      expect(mockDetection.start).toHaveBeenCalledTimes(1)
      expect(mockDetection.start).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
        mockSettings.detection,
      )
    })

    it('should reload settings after calibration completes and auto-start detection', async () => {
      // Start with no calibration data
      mockSettings = { ...DEFAULT_SETTINGS, calibration: null }
      mockLoading = false
      mockDetection.state = 'idle'

      const user = userEvent.setup()
      const { rerender } = render(<App />)

      // detection should NOT have started (no calibration data)
      expect(mockDetection.start).not.toHaveBeenCalled()

      // Navigate to calibration
      await user.click(screen.getByTestId('start-calibration-btn'))
      expect(screen.getByTestId('calibration-page')).toBeTruthy()

      // Complete calibration — this triggers reloadSettings
      await user.click(screen.getByTestId('calibration-complete-btn'))

      // reloadSettings should have been called
      expect(mockUseSettings.reloadSettings).toHaveBeenCalled()

      // Simulate what reloadSettings does: settings now include calibration
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: true },
      }

      // Re-render to reflect updated settings
      rerender(<App />)

      // Now detection.start should be called because calibration data is available
      expect(mockDetection.start).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
        expect.objectContaining({ enabled: true }),
      )
    })

    it('should report posture status when detection is in detecting state (via mock)', () => {
      // When detection is in 'detecting' state, the App syncs settings and
      // calibration. This test verifies that updateDetectionSettings and
      // updateCalibration are called when state is 'detecting'.
      mockSettings = {
        ...DEFAULT_SETTINGS,
        calibration: MOCK_CALIBRATION,
        detection: { ...DEFAULT_SETTINGS.detection, enabled: true },
      }
      mockLoading = false
      mockDetection.state = 'detecting'

      render(<App />)

      // The App should sync detection settings and calibration when detecting
      expect(mockDetection.updateDetectionSettings).toHaveBeenCalledWith(
        mockSettings.detection,
      )
      expect(mockDetection.updateCalibration).toHaveBeenCalledWith(
        MOCK_CALIBRATION,
      )
    })
  })
})
