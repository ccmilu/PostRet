/**
 * Cross-testing: 4-step calibration wizard
 * Written by an independent tester (notification-dev) to verify wizard-dev's implementation.
 * Covers gaps not addressed in the original test suite.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { WizardStep } from '@/hooks/useCalibrationWizard'
import type { PositionCheckResult } from '@/components/calibration/position-check'
import { CalibrationPage } from '@/components/calibration/CalibrationPage'
import { WelcomeStep } from '@/components/calibration/WelcomeStep'
import { PositionCheckStep } from '@/components/calibration/PositionCheckStep'
import { CollectStep } from '@/components/calibration/CollectStep'
import { ConfirmStep } from '@/components/calibration/ConfirmStep'

// ─── CalibrationPage tests (mock hook) ───

const mockGoToStep2 = vi.fn()
const mockGoToStep3 = vi.fn()
const mockGoBackToStep1 = vi.fn()
const mockRecalibrate = vi.fn()
const mockConfirm = vi.fn()

let mockStep: WizardStep = 1
let mockProgress = 0
let mockError: string | null = null
let mockPositionResult: PositionCheckResult = {
  status: 'no_face',
  message: '未检测到人脸，请确保脸部在摄像头画面中',
}
let mockCanContinue = false

vi.mock('@/hooks/useCalibrationWizard', () => ({
  useCalibrationWizard: () => ({
    step: mockStep,
    progress: mockProgress,
    error: mockError,
    positionResult: mockPositionResult,
    canContinue: mockCanContinue,
    landmarks: undefined,
    goToStep2: mockGoToStep2,
    goToStep3: mockGoToStep3,
    goBackToStep1: mockGoBackToStep1,
    recalibrate: mockRecalibrate,
    confirm: mockConfirm,
  }),
}))

const mockGetUserMedia = vi.fn()
const mockPlay = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.useFakeTimers()
  mockStep = 1
  mockProgress = 0
  mockError = null
  mockPositionResult = {
    status: 'no_face',
    message: '未检测到人脸，请确保脸部在摄像头画面中',
  }
  mockCanContinue = false

  mockGoToStep2.mockClear()
  mockGoToStep3.mockClear()
  mockGoBackToStep1.mockClear()
  mockRecalibrate.mockClear()
  mockConfirm.mockClear()
  mockGetUserMedia.mockClear()
  mockPlay.mockClear()

  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1)
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockReturnValue(undefined)

  const mockTrack = { stop: vi.fn() }
  const mockStream = { getTracks: () => [mockTrack] }
  mockGetUserMedia.mockResolvedValue(mockStream)

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  })

  HTMLVideoElement.prototype.play = mockPlay
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Wizard error display ───

describe('CalibrationPage - wizard error handling', () => {
  it('shows wizard error when wizard.error is set', async () => {
    mockError = 'PoseDetector 初始化失败'

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByTestId('calibration-error')).toBeInTheDocument()
    expect(screen.getByText('PoseDetector 初始化失败')).toBeInTheDocument()
  })

  it('shows retry button for wizard error and calls recalibrate on click', async () => {
    mockError = '采集失败'

    await act(async () => {
      render(<CalibrationPage />)
    })

    const retryBtn = screen.getByTestId('calibration-retry-btn')
    expect(retryBtn).toBeInTheDocument()

    fireEvent.click(retryBtn)
    expect(mockRecalibrate).toHaveBeenCalledOnce()
  })

  it('hides step content when wizard error is present', async () => {
    mockError = '采集超时，请重试'

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.queryByTestId('wizard-step-1')).not.toBeInTheDocument()
  })

  it('prioritizes camera error over wizard error', async () => {
    mockError = '采集失败'
    mockGetUserMedia.mockRejectedValue(new Error('Not allowed'))

    await act(async () => {
      render(<CalibrationPage />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })

    expect(screen.getByTestId('calibration-camera-error')).toBeInTheDocument()
    expect(screen.queryByTestId('calibration-error')).not.toBeInTheDocument()
  })
})

// ─── Step indicator states ───

describe('CalibrationPage - step indicator', () => {
  it('marks step 1 as active when on step 1', async () => {
    mockStep = 1

    await act(async () => {
      render(<CalibrationPage />)
    })

    const indicator = screen.getByTestId('wizard-steps-indicator')
    const dots = indicator.querySelectorAll('.wizard-step-dot')
    expect(dots).toHaveLength(4)
    expect(dots[0]).toHaveClass('active')
    expect(dots[1]).not.toHaveClass('active')
    expect(dots[1]).not.toHaveClass('completed')
  })

  it('marks previous steps as completed and current as active', async () => {
    mockStep = 3

    await act(async () => {
      render(<CalibrationPage />)
    })

    const indicator = screen.getByTestId('wizard-steps-indicator')
    const dots = indicator.querySelectorAll('.wizard-step-dot')
    expect(dots[0]).toHaveClass('completed')
    expect(dots[1]).toHaveClass('completed')
    expect(dots[2]).toHaveClass('active')
    expect(dots[3]).not.toHaveClass('active')
    expect(dots[3]).not.toHaveClass('completed')
  })

  it('marks all previous steps as completed on step 4', async () => {
    mockStep = 4

    await act(async () => {
      render(<CalibrationPage />)
    })

    const indicator = screen.getByTestId('wizard-steps-indicator')
    const dots = indicator.querySelectorAll('.wizard-step-dot')
    expect(dots[0]).toHaveClass('completed')
    expect(dots[1]).toHaveClass('completed')
    expect(dots[2]).toHaveClass('completed')
    expect(dots[3]).toHaveClass('active')
  })
})

// ─── Video visibility per step ───

describe('CalibrationPage - video visibility', () => {
  it('video element is always in the DOM (stable ref for stream binding)', async () => {
    mockStep = 1

    await act(async () => {
      render(<CalibrationPage />)
    })

    // Video is always mounted to preserve stream binding across step transitions
    expect(screen.getByTestId('calibration-video')).toBeInTheDocument()
  })

  it('hides video container on step 1', async () => {
    mockStep = 1

    await act(async () => {
      render(<CalibrationPage />)
    })

    const container = screen.getByTestId('calibration-video').closest('.calibration-preview-container')
    expect(container).toHaveClass('calibration-preview-hidden')
  })

  it('shows video container on step 2', async () => {
    mockStep = 2

    await act(async () => {
      render(<CalibrationPage />)
    })

    const container = screen.getByTestId('calibration-video').closest('.calibration-preview-container')
    expect(container).not.toHaveClass('calibration-preview-hidden')
  })

  it('shows video container on step 3', async () => {
    mockStep = 3
    mockProgress = 0.3

    await act(async () => {
      render(<CalibrationPage />)
    })

    const container = screen.getByTestId('calibration-video').closest('.calibration-preview-container')
    expect(container).not.toHaveClass('calibration-preview-hidden')
  })

  it('hides video container on step 4', async () => {
    mockStep = 4

    await act(async () => {
      render(<CalibrationPage />)
    })

    const container = screen.getByTestId('calibration-video').closest('.calibration-preview-container')
    expect(container).toHaveClass('calibration-preview-hidden')
  })
})

// ─── Position status messages in step 2 ───

describe('CalibrationPage - position status messages', () => {
  beforeEach(() => {
    mockStep = 2
  })

  it('shows no_face message', async () => {
    mockPositionResult = { status: 'no_face', message: '未检测到人脸，请确保脸部在摄像头画面中' }

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('未检测到人脸，请确保脸部在摄像头画面中')).toBeInTheDocument()
  })

  it('shows too_far message', async () => {
    mockPositionResult = { status: 'too_far', message: '请靠近摄像头一些' }

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('请靠近摄像头一些')).toBeInTheDocument()
  })

  it('shows too_close message', async () => {
    mockPositionResult = { status: 'too_close', message: '距离太近，请稍微后退一些' }

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('距离太近，请稍微后退一些')).toBeInTheDocument()
  })

  it('shows off_center message', async () => {
    mockPositionResult = { status: 'off_center', message: '请将脸部移到画面中央' }

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('请将脸部移到画面中央')).toBeInTheDocument()
  })

  it('shows good message', async () => {
    mockPositionResult = { status: 'good', message: '位置合适！' }
    mockCanContinue = true

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('位置合适！')).toBeInTheDocument()
  })

  it('applies warning class for non-good status', async () => {
    mockPositionResult = { status: 'too_far', message: '请靠近摄像头一些' }

    await act(async () => {
      render(<CalibrationPage />)
    })

    const statusEl = screen.getByTestId('position-status')
    expect(statusEl).toHaveClass('position-status-warning')
  })

  it('applies good class for good status', async () => {
    mockPositionResult = { status: 'good', message: '位置合适！' }
    mockCanContinue = true

    await act(async () => {
      render(<CalibrationPage />)
    })

    const statusEl = screen.getByTestId('position-status')
    expect(statusEl).toHaveClass('position-status-good')
  })
})

// ─── CalibrationPage - confirm without onComplete callback ───

describe('CalibrationPage - confirm without onComplete', () => {
  it('does not throw when confirm is clicked without onComplete prop', async () => {
    mockStep = 4

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(() => {
      fireEvent.click(screen.getByTestId('wizard-confirm-btn'))
    }).not.toThrow()

    expect(mockConfirm).toHaveBeenCalledOnce()
  })
})

// ─── CalibrationPage - progress display at various values ───

describe('CalibrationPage - progress display values', () => {
  beforeEach(() => {
    mockStep = 3
  })

  it('shows 25% for progress 0.25', async () => {
    mockProgress = 0.25

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('shows 73% for progress 0.73', async () => {
    mockProgress = 0.73

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('73%')).toBeInTheDocument()
  })

  it('rounds 0.335 to 34%', async () => {
    mockProgress = 0.335

    await act(async () => {
      render(<CalibrationPage />)
    })

    expect(screen.getByText('34%')).toBeInTheDocument()
  })
})

// ─── WelcomeStep isolated tests ───

describe('WelcomeStep', () => {
  it('renders step title "姿态校准"', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByText('姿态校准')).toBeInTheDocument()
  })

  it('renders description about recording standard posture', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByText(/记录你的标准坐姿/)).toBeInTheDocument()
  })

  it('renders 3 tips', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByText(/坐正身体/)).toBeInTheDocument()
    expect(screen.getByText(/确保面部正对摄像头/)).toBeInTheDocument()
    expect(screen.getByText(/采集过程约 5 秒/)).toBeInTheDocument()
  })

  it('renders start button with text "开始校准"', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByTestId('wizard-start-btn')).toHaveTextContent('开始校准')
  })

  it('calls onStart when start button is clicked', () => {
    const onStart = vi.fn()
    render(<WelcomeStep onStart={onStart} />)

    fireEvent.click(screen.getByTestId('wizard-start-btn'))
    expect(onStart).toHaveBeenCalledOnce()
  })

  it('renders with correct data-testid', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByTestId('wizard-step-1')).toBeInTheDocument()
  })
})

// ─── PositionCheckStep isolated tests ───

describe('PositionCheckStep', () => {
  const defaultProps = {
    positionResult: { status: 'good' as const, message: '位置合适！' },
    canContinue: true,
    onContinue: vi.fn(),
    onBack: vi.fn(),
  }

  it('renders step title "位置检查"', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByText('位置检查')).toBeInTheDocument()
  })

  it('renders description about face position', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByText(/请确保脸部在画面中央/)).toBeInTheDocument()
  })

  it('shows position result message', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByText('位置合适！')).toBeInTheDocument()
  })

  it('shows no_face status message', () => {
    render(
      <PositionCheckStep
        {...defaultProps}
        positionResult={{ status: 'no_face', message: '未检测到人脸，请确保脸部在摄像头画面中' }}
        canContinue={false}
      />,
    )
    expect(screen.getByText('未检测到人脸，请确保脸部在摄像头画面中')).toBeInTheDocument()
  })

  it('disables continue button when canContinue is false', () => {
    render(
      <PositionCheckStep
        {...defaultProps}
        canContinue={false}
      />,
    )
    expect(screen.getByTestId('wizard-continue-btn')).toBeDisabled()
  })

  it('enables continue button when canContinue is true', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByTestId('wizard-continue-btn')).not.toBeDisabled()
  })

  it('calls onContinue when continue button is clicked', () => {
    const onContinue = vi.fn()
    render(<PositionCheckStep {...defaultProps} onContinue={onContinue} />)

    fireEvent.click(screen.getByTestId('wizard-continue-btn'))
    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    render(<PositionCheckStep {...defaultProps} onBack={onBack} />)

    fireEvent.click(screen.getByTestId('wizard-back-btn'))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('applies good status class when status is good', () => {
    render(<PositionCheckStep {...defaultProps} />)
    const statusEl = screen.getByTestId('position-status')
    expect(statusEl).toHaveClass('position-status-good')
  })

  it('applies warning status class when status is not good', () => {
    render(
      <PositionCheckStep
        {...defaultProps}
        positionResult={{ status: 'too_close', message: '距离太近，请稍微后退一些' }}
      />,
    )
    const statusEl = screen.getByTestId('position-status')
    expect(statusEl).toHaveClass('position-status-warning')
  })

  it('renders with correct data-testid', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByTestId('wizard-step-2')).toBeInTheDocument()
  })

  it('has both back and continue buttons', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByTestId('wizard-back-btn')).toHaveTextContent('返回')
    expect(screen.getByTestId('wizard-continue-btn')).toHaveTextContent('继续')
  })
})

// ─── CollectStep isolated tests ───

describe('CollectStep', () => {
  it('renders step title "正在采集"', () => {
    render(<CollectStep progress={0} />)
    expect(screen.getByText('正在采集')).toBeInTheDocument()
  })

  it('renders description "请保持姿势不动"', () => {
    render(<CollectStep progress={0} />)
    expect(screen.getByText('请保持姿势不动')).toBeInTheDocument()
  })

  it('shows 0% at progress 0', () => {
    render(<CollectStep progress={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows 50% at progress 0.5', () => {
    render(<CollectStep progress={0.5} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows 100% at progress 1', () => {
    render(<CollectStep progress={1} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('rounds progress correctly: 0.333 → 33%', () => {
    render(<CollectStep progress={0.333} />)
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('rounds progress correctly: 0.666 → 67%', () => {
    render(<CollectStep progress={0.666} />)
    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('rounds progress correctly: 0.999 → 100%', () => {
    render(<CollectStep progress={0.999} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('renders progress ring with SVG', () => {
    render(<CollectStep progress={0.5} />)
    expect(screen.getByTestId('calibration-progress-ring')).toBeInTheDocument()
    const svg = screen.getByTestId('calibration-progress-ring').querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('renders with correct data-testid', () => {
    render(<CollectStep progress={0} />)
    expect(screen.getByTestId('wizard-step-3')).toBeInTheDocument()
  })

  it('renders progress ring with proper strokeDashoffset at 0%', () => {
    render(<CollectStep progress={0} />)
    const circles = screen.getByTestId('calibration-progress-ring').querySelectorAll('circle')
    // Second circle is the progress circle
    const progressCircle = circles[1]
    // At 0% progress, strokeDashoffset should equal circumference
    const radius = (120 - 8) / 2 // (RING_SIZE - RING_STROKE) / 2
    const circumference = 2 * Math.PI * radius
    expect(progressCircle).toHaveAttribute(
      'stroke-dashoffset',
      String(circumference),
    )
  })

  it('renders progress ring with strokeDashoffset 0 at 100%', () => {
    render(<CollectStep progress={1} />)
    const circles = screen.getByTestId('calibration-progress-ring').querySelectorAll('circle')
    const progressCircle = circles[1]
    expect(progressCircle).toHaveAttribute('stroke-dashoffset', '0')
  })
})

// ─── ConfirmStep isolated tests ───

describe('ConfirmStep', () => {
  it('renders "校准完成" title', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('校准完成')).toBeInTheDocument()
  })

  it('renders success description', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText(/已成功记录你的标准坐姿基准/)).toBeInTheDocument()
  })

  it('renders recalibrate button with text "重新校准"', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByTestId('wizard-recalibrate-btn')).toHaveTextContent('重新校准')
  })

  it('renders confirm button with text "确认"', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByTestId('wizard-confirm-btn')).toHaveTextContent('确认')
  })

  it('calls onRecalibrate when recalibrate button is clicked', () => {
    const onRecalibrate = vi.fn()
    render(<ConfirmStep onRecalibrate={onRecalibrate} onConfirm={vi.fn()} />)

    fireEvent.click(screen.getByTestId('wizard-recalibrate-btn'))
    expect(onRecalibrate).toHaveBeenCalledOnce()
  })

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByTestId('wizard-confirm-btn'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('renders success icon SVG', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    const step = screen.getByTestId('wizard-step-4')
    const svg = step.querySelector('.wizard-confirm-icon svg')
    expect(svg).not.toBeNull()
  })

  it('renders with correct data-testid', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByTestId('wizard-step-4')).toBeInTheDocument()
  })
})
