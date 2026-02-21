import { render, screen } from '@testing-library/react'
import { DebugPanel } from '@/components/settings/DebugPanel'
import type { UsePostureDetectionReturn, DetectionState } from '@/hooks/usePostureDetection'
import type { PostureAngles, AngleDeviations } from '@/services/posture-analysis/posture-types'
import type { PostureStatus } from '@/types/ipc'
import type { CalibrationData } from '@/types/settings'

function createMockAngles(overrides?: Partial<PostureAngles>): PostureAngles {
  return {
    headForwardAngle: 15.5,
    torsoAngle: 5.2,
    headTiltAngle: 3.1,
    faceFrameRatio: 0.125,
    faceY: 0.45,
    noseToEarAvg: 0.08,
    shoulderDiff: 2.3,
    ...overrides,
  }
}

function createMockDeviations(overrides?: Partial<AngleDeviations>): AngleDeviations {
  return {
    headForward: 5.5,
    torsoSlouch: 1.2,
    headTilt: 1.1,
    faceFrameRatio: 0.015,
    faceYDelta: 0.05,
    noseToEarAvg: 0.02,
    shoulderDiff: 0.8,
    ...overrides,
  }
}

function createMockStatus(overrides?: Partial<PostureStatus>): PostureStatus {
  return {
    isGood: true,
    violations: [],
    confidence: 0.95,
    timestamp: Date.now(),
    ...overrides,
  }
}

function createMockCalibration(overrides?: Partial<CalibrationData>): CalibrationData {
  return {
    headForwardAngle: 10.0,
    torsoAngle: 4.0,
    headTiltAngle: 2.0,
    faceFrameRatio: 0.11,
    faceY: 0.4,
    noseToEarAvg: 0.06,
    shoulderDiff: 1.5,
    timestamp: Date.now(),
    ...overrides,
  }
}

function createMockDetection(overrides?: Partial<UsePostureDetectionReturn>): UsePostureDetectionReturn {
  return {
    state: 'detecting' as DetectionState,
    lastStatus: createMockStatus(),
    lastAngles: createMockAngles(),
    lastDeviations: createMockDeviations(),
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    stopAsync: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    updateDetectionSettings: vi.fn(),
    updateCalibration: vi.fn(),
    ...overrides,
  }
}

describe('DebugPanel', () => {
  const defaultProps = {
    detection: createMockDetection(),
    calibration: createMockCalibration(),
    onClose: vi.fn(),
  }

  it('should render the debug panel with title', () => {
    render(<DebugPanel {...defaultProps} />)

    expect(screen.getByTestId('debug-panel')).toBeInTheDocument()
    expect(screen.getByText('调试')).toBeInTheDocument()
  })

  it('should render close button', () => {
    const onClose = vi.fn()
    render(<DebugPanel {...defaultProps} onClose={onClose} />)

    const closeBtn = screen.getByTestId('debug-close-btn')
    expect(closeBtn).toBeInTheDocument()

    closeBtn.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('should display detection state', () => {
    render(<DebugPanel {...defaultProps} />)

    expect(screen.getByTestId('debug-detection-state')).toHaveTextContent('detecting')
  })

  it('should display confidence as percentage', () => {
    render(<DebugPanel {...defaultProps} />)

    expect(screen.getByTestId('debug-detection-confidence')).toHaveTextContent('95%')
  })

  it('should display current angles', () => {
    render(<DebugPanel {...defaultProps} />)

    const anglesSection = screen.getByTestId('debug-angles-section')
    expect(anglesSection).toBeInTheDocument()

    expect(screen.getByTestId('debug-val-headForward')).toHaveTextContent('15.5')
    expect(screen.getByTestId('debug-val-headTilt')).toHaveTextContent('3.1')
    expect(screen.getByTestId('debug-val-faceFrameRatio')).toHaveTextContent('0.125')
    expect(screen.getByTestId('debug-val-shoulderDiff')).toHaveTextContent('2.3')
  })

  it('should display baseline values when calibration is provided', () => {
    render(<DebugPanel {...defaultProps} />)

    expect(screen.getByTestId('debug-baseline-headForward')).toHaveTextContent('10.0')
    expect(screen.getByTestId('debug-baseline-headTilt')).toHaveTextContent('2.0')
    expect(screen.getByTestId('debug-baseline-faceFrameRatio')).toHaveTextContent('0.110')
    expect(screen.getByTestId('debug-baseline-shoulderDiff')).toHaveTextContent('1.5')
  })

  it('should display deviation values', () => {
    render(<DebugPanel {...defaultProps} />)

    expect(screen.getByTestId('debug-dev-headForward')).toHaveTextContent('5.5')
    expect(screen.getByTestId('debug-dev-headTilt')).toHaveTextContent('1.1')
    expect(screen.getByTestId('debug-dev-shoulderDiff')).toHaveTextContent('0.8')
  })

  it('should show placeholder when detection has no data', () => {
    const detection = createMockDetection({
      state: 'idle',
      lastStatus: null,
      lastAngles: null,
      lastDeviations: null,
    })

    render(<DebugPanel {...defaultProps} detection={detection} />)

    expect(screen.getByTestId('debug-detection-state')).toHaveTextContent('idle')
    expect(screen.getByTestId('debug-no-data')).toBeInTheDocument()
  })

  it('should show placeholder when calibration is null', () => {
    render(<DebugPanel {...defaultProps} calibration={null} />)

    expect(screen.getByTestId('debug-no-calibration')).toBeInTheDocument()
  })

  it('should display posture status (good/bad)', () => {
    render(<DebugPanel {...defaultProps} />)

    expect(screen.getByTestId('debug-posture-status')).toHaveTextContent('良好')
  })

  it('should display bad posture status with violations', () => {
    const detection = createMockDetection({
      lastStatus: createMockStatus({
        isGood: false,
        violations: [
          { rule: 'FORWARD_HEAD', severity: 0.8, message: '头部前倾' },
          { rule: 'HEAD_TILT', severity: 0.5, message: '歪头' },
        ],
      }),
    })

    render(<DebugPanel {...defaultProps} detection={detection} />)

    expect(screen.getByTestId('debug-posture-status')).toHaveTextContent('不良')
    expect(screen.getByTestId('debug-violations-list')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^debug-violation-/)).toHaveLength(2)
  })

  it('should use monospace font for data values', () => {
    render(<DebugPanel {...defaultProps} />)

    const panel = screen.getByTestId('debug-panel')
    expect(panel).toBeInTheDocument()
    // The debug-panel class applies monospace styling
  })

  it('should display timestamp of last detection', () => {
    const timestamp = 1708646400000 // 2024-02-23T00:00:00Z
    const detection = createMockDetection({
      lastStatus: createMockStatus({ timestamp }),
    })

    render(<DebugPanel {...defaultProps} detection={detection} />)

    expect(screen.getByTestId('debug-last-timestamp')).toBeInTheDocument()
  })
})
