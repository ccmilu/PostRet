import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ThresholdTuner } from '@/components/settings/ThresholdTuner'
import { SettingsProvider } from '@/hooks/useSettings'
import { DEFAULT_THRESHOLDS } from '@/services/posture-analysis/thresholds'
import type { CustomThresholds } from '@/types/settings'

// Mock electronAPI
const mockSetSettings = vi.fn().mockResolvedValue(undefined)
const mockGetSettings = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockGetSettings.mockResolvedValue({
    detection: {
      enabled: true,
      intervalMs: 500,
      sensitivity: 0.5,
      rules: {
        forwardHead: true,
        slouch: false,
        headTilt: true,
        tooClose: true,
        shoulderAsymmetry: true,
      },
    },
    reminder: {
      blur: true,
      sound: false,
      notification: true,
      delayMs: 5000,
      fadeOutDurationMs: 1500,
    },
    calibration: null,
    display: {
      selectedCamera: '',
      autoLaunch: false,
      ignorePeriods: [],
      weekendIgnore: false,
    },
    advanced: {
      debugMode: true,
    },
  })

  Object.defineProperty(window, 'electronAPI', {
    value: {
      getSettings: mockGetSettings,
      setSettings: mockSetSettings,
      requestCameraPermission: vi.fn().mockResolvedValue('granted'),
      onSettingsChanged: vi.fn(),
      onPause: vi.fn(),
      onResume: vi.fn(),
      onStatusChange: vi.fn(),
    },
    writable: true,
    configurable: true,
  })
})

function renderWithProvider(ui: React.ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>)
}

describe('ThresholdTuner', () => {
  it('should render the threshold tuning section', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByTestId('threshold-tuner')).toBeInTheDocument()
    })
  })

  it('should render sliders for all 4 tunable thresholds', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByLabelText('头部前倾阈值')).toBeInTheDocument()
      expect(screen.getByLabelText('歪头阈值')).toBeInTheDocument()
      expect(screen.getByLabelText('距屏幕太近阈值')).toBeInTheDocument()
      expect(screen.getByLabelText('肩膀不对称阈值')).toBeInTheDocument()
    })
  })

  it('should render notification interval slider', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByLabelText('通知间隔')).toBeInTheDocument()
    })
  })

  it('should display default threshold values initially', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      const forwardHead = screen.getByLabelText('头部前倾阈值') as HTMLInputElement
      expect(forwardHead.value).toBe(String(DEFAULT_THRESHOLDS.forwardHead))
    })
  })

  it('should display default notification interval (30s)', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      const intervalSlider = screen.getByLabelText('通知间隔') as HTMLInputElement
      expect(intervalSlider.value).toBe('30')
    })
  })

  it('should render restore defaults button', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByTestId('restore-defaults-btn')).toBeInTheDocument()
    })
  })

  it('should update threshold value when slider changes', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByLabelText('头部前倾阈值')).toBeInTheDocument()
    })

    const slider = screen.getByLabelText('头部前倾阈值') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '12' } })

    await waitFor(() => {
      expect(slider.value).toBe('12')
    })
  })

  it('should update notification interval when slider changes', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByLabelText('通知间隔')).toBeInTheDocument()
    })

    const slider = screen.getByLabelText('通知间隔') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '60' } })

    await waitFor(() => {
      expect(slider.value).toBe('60')
    })
  })

  it('should persist threshold changes via settings', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByLabelText('歪头阈值')).toBeInTheDocument()
    })

    const slider = screen.getByLabelText('歪头阈值') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '20' } })

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          advanced: expect.objectContaining({
            customThresholds: expect.objectContaining({
              headTilt: 20,
            }),
          }),
        }),
      )
    })
  })

  it('should persist notification interval changes via settings', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByLabelText('通知间隔')).toBeInTheDocument()
    })

    const slider = screen.getByLabelText('通知间隔') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '45' } })

    await waitFor(() => {
      expect(mockSetSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          advanced: expect.objectContaining({
            notificationIntervalMs: 45_000,
          }),
        }),
      )
    })
  })

  it('should show default value hint for each slider', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByTestId('default-hint-forwardHead')).toHaveTextContent(
        `默认: ${DEFAULT_THRESHOLDS.forwardHead}`,
      )
      expect(screen.getByTestId('default-hint-headTilt')).toHaveTextContent(
        `默认: ${DEFAULT_THRESHOLDS.headTilt}`,
      )
    })
  })

  it('should restore all defaults when restore button is clicked', async () => {
    renderWithProvider(<ThresholdTuner />)
    await waitFor(() => {
      expect(screen.getByLabelText('头部前倾阈值')).toBeInTheDocument()
    })

    // Change a value first
    const slider = screen.getByLabelText('头部前倾阈值') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '16' } })

    await waitFor(() => {
      expect(slider.value).toBe('16')
    })

    // Click restore defaults
    const restoreBtn = screen.getByTestId('restore-defaults-btn')
    fireEvent.click(restoreBtn)

    await waitFor(() => {
      const forwardHead = screen.getByLabelText('头部前倾阈值') as HTMLInputElement
      expect(forwardHead.value).toBe(String(DEFAULT_THRESHOLDS.forwardHead))
    })
  })

  it('should load saved custom thresholds from settings', async () => {
    mockGetSettings.mockResolvedValue({
      detection: {
        enabled: true,
        intervalMs: 500,
        sensitivity: 0.5,
        rules: {
          forwardHead: true,
          slouch: false,
          headTilt: true,
          tooClose: true,
          shoulderAsymmetry: true,
        },
      },
      reminder: {
        blur: true,
        sound: false,
        notification: true,
        delayMs: 5000,
        fadeOutDurationMs: 1500,
      },
      calibration: null,
      display: {
        selectedCamera: '',
        autoLaunch: false,
        ignorePeriods: [],
        weekendIgnore: false,
      },
      advanced: {
        debugMode: true,
        customThresholds: {
          forwardHead: 15,
          headTilt: 18,
        },
        notificationIntervalMs: 60_000,
      },
    })

    renderWithProvider(<ThresholdTuner />)

    await waitFor(() => {
      const forwardHead = screen.getByLabelText('头部前倾阈值') as HTMLInputElement
      expect(forwardHead.value).toBe('15')
    })

    const headTilt = screen.getByLabelText('歪头阈值') as HTMLInputElement
    expect(headTilt.value).toBe('18')

    const interval = screen.getByLabelText('通知间隔') as HTMLInputElement
    expect(interval.value).toBe('60')
  })
})
