import { TOTAL_ANGLES } from '@/hooks/useCalibrationWizard'

export interface CollectStepProps {
  readonly progress: number // 0-1
  readonly angleIndex: number
  readonly angleLabel: number
}

const RING_SIZE = 120
const RING_STROKE = 8
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

export function CollectStep({ progress, angleIndex, angleLabel }: CollectStepProps) {
  const percent = Math.round(progress * 100)
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress)

  return (
    <div className="wizard-step wizard-collect" data-testid="wizard-step-3">
      <h2 className="wizard-step-title">正在采集</h2>
      <p className="wizard-step-description">
        请保持姿势不动
      </p>

      <p
        className="calibration-hint"
        data-testid="collect-angle-label"
      >
        第 {angleIndex + 1} 个角度 ({angleIndex + 1}/{TOTAL_ANGLES}) - {angleLabel}°
      </p>

      <div
        className="calibration-progress-ring"
        data-testid="calibration-progress-ring"
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        >
          {/* Background circle */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="#d2d2d7"
            strokeWidth={RING_STROKE}
          />
          {/* Progress circle */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="#007aff"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            className="progress-ring-circle"
          />
        </svg>
        <span className="progress-ring-text">{percent}%</span>
      </div>
    </div>
  )
}
