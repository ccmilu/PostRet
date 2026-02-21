import { render, screen, fireEvent } from '@testing-library/react'
import { WelcomeStep } from '@/components/calibration/WelcomeStep'
import { PositionCheckStep } from '@/components/calibration/PositionCheckStep'
import { CollectStep } from '@/components/calibration/CollectStep'
import { ConfirmStep } from '@/components/calibration/ConfirmStep'
import type { PositionCheckResult } from '@/components/calibration/position-check'

describe('WelcomeStep', () => {
  it('renders with correct test id', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByTestId('wizard-step-1')).toBeInTheDocument()
  })

  it('displays calibration title', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByText('姿态校准')).toBeInTheDocument()
  })

  it('displays calibration description', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByText(/记录你的标准坐姿/)).toBeInTheDocument()
  })

  it('displays 3 tips', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    expect(screen.getByText(/坐正身体/)).toBeInTheDocument()
    expect(screen.getByText(/确保面部正对/)).toBeInTheDocument()
    expect(screen.getByText(/采集过程约 5 秒/)).toBeInTheDocument()
  })

  it('shows start button with correct test id', () => {
    render(<WelcomeStep onStart={vi.fn()} />)
    const btn = screen.getByTestId('wizard-start-btn')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('开始校准')
  })

  it('calls onStart when start button is clicked', () => {
    const onStart = vi.fn()
    render(<WelcomeStep onStart={onStart} />)

    fireEvent.click(screen.getByTestId('wizard-start-btn'))

    expect(onStart).toHaveBeenCalledOnce()
  })
})

describe('PositionCheckStep', () => {
  const defaultProps = {
    positionResult: { status: 'no_face' as const, message: '未检测到人脸' },
    canContinue: false,
    onContinue: vi.fn(),
    onBack: vi.fn(),
  }

  it('renders with correct test id', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByTestId('wizard-step-2')).toBeInTheDocument()
  })

  it('displays position check title', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByText('位置检查')).toBeInTheDocument()
  })

  it('displays position status message', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByTestId('position-status')).toHaveTextContent('未检测到人脸')
  })

  it('shows warning style when position is not good', () => {
    render(<PositionCheckStep {...defaultProps} />)
    const status = screen.getByTestId('position-status')
    expect(status.className).toContain('position-status-warning')
  })

  it('shows good style when position is good', () => {
    const props = {
      ...defaultProps,
      positionResult: { status: 'good' as const, message: '位置合适！' },
    }
    render(<PositionCheckStep {...props} />)
    const status = screen.getByTestId('position-status')
    expect(status.className).toContain('position-status-good')
  })

  it('disables continue button when canContinue is false', () => {
    render(<PositionCheckStep {...defaultProps} />)
    expect(screen.getByTestId('wizard-continue-btn')).toBeDisabled()
  })

  it('enables continue button when canContinue is true', () => {
    const props = { ...defaultProps, canContinue: true }
    render(<PositionCheckStep {...props} />)
    expect(screen.getByTestId('wizard-continue-btn')).not.toBeDisabled()
  })

  it('calls onContinue when continue button is clicked', () => {
    const onContinue = vi.fn()
    const props = { ...defaultProps, canContinue: true, onContinue }
    render(<PositionCheckStep {...props} />)

    fireEvent.click(screen.getByTestId('wizard-continue-btn'))

    expect(onContinue).toHaveBeenCalledOnce()
  })

  it('calls onBack when back button is clicked', () => {
    const onBack = vi.fn()
    const props = { ...defaultProps, onBack }
    render(<PositionCheckStep {...props} />)

    fireEvent.click(screen.getByTestId('wizard-back-btn'))

    expect(onBack).toHaveBeenCalledOnce()
  })

  it('displays different messages for different statuses', () => {
    const statuses: Array<{ status: PositionCheckResult; expected: string }> = [
      { status: { status: 'too_far', message: '请靠近摄像头一些' }, expected: '请靠近' },
      { status: { status: 'too_close', message: '距离太近，请稍微后退一些' }, expected: '后退' },
      { status: { status: 'off_center', message: '请将脸部移到画面中央' }, expected: '中央' },
      { status: { status: 'good', message: '位置合适！' }, expected: '合适' },
    ]

    for (const { status, expected } of statuses) {
      const { unmount } = render(
        <PositionCheckStep {...defaultProps} positionResult={status} />,
      )
      expect(screen.getByTestId('position-status').textContent).toContain(expected)
      unmount()
    }
  })
})

describe('CollectStep', () => {
  it('renders with correct test id', () => {
    render(<CollectStep progress={0} />)
    expect(screen.getByTestId('wizard-step-3')).toBeInTheDocument()
  })

  it('displays collecting title', () => {
    render(<CollectStep progress={0} />)
    expect(screen.getByText('正在采集')).toBeInTheDocument()
  })

  it('displays progress ring', () => {
    render(<CollectStep progress={0.5} />)
    expect(screen.getByTestId('calibration-progress-ring')).toBeInTheDocument()
  })

  it('shows 0% at start', () => {
    render(<CollectStep progress={0} />)
    expect(screen.getByText('0%')).toBeInTheDocument()
  })

  it('shows 50% for half progress', () => {
    render(<CollectStep progress={0.5} />)
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows 100% when complete', () => {
    render(<CollectStep progress={1} />)
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('rounds progress percentage', () => {
    render(<CollectStep progress={0.333} />)
    expect(screen.getByText('33%')).toBeInTheDocument()
  })

  it('contains SVG progress circle', () => {
    const { container } = render(<CollectStep progress={0.5} />)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2) // background + progress
  })
})

describe('ConfirmStep', () => {
  it('renders with correct test id', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByTestId('wizard-step-4')).toBeInTheDocument()
  })

  it('displays completion title', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText('校准完成')).toBeInTheDocument()
  })

  it('displays success description', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    expect(screen.getByText(/已成功记录/)).toBeInTheDocument()
  })

  it('shows recalibrate button', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    const btn = screen.getByTestId('wizard-recalibrate-btn')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('重新校准')
  })

  it('shows confirm button', () => {
    render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    const btn = screen.getByTestId('wizard-confirm-btn')
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveTextContent('确认')
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

  it('contains checkmark SVG icon', () => {
    const { container } = render(<ConfirmStep onRecalibrate={vi.fn()} onConfirm={vi.fn()} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
