import type { PositionCheckResult } from './position-check'

export interface PositionCheckStepProps {
  readonly positionResult: PositionCheckResult
  readonly canContinue: boolean
  readonly onContinue: () => void
  readonly onBack: () => void
}

export function PositionCheckStep({
  positionResult,
  canContinue,
  onContinue,
  onBack,
}: PositionCheckStepProps) {
  const statusClassName = positionResult.status === 'good'
    ? 'position-status-good'
    : 'position-status-warning'

  return (
    <div className="wizard-step wizard-position-check" data-testid="wizard-step-2">
      <h2 className="wizard-step-title">位置检查</h2>
      <p className="wizard-step-description">
        请确保脸部在画面中央，距离适中
      </p>

      <div
        className={`position-status ${statusClassName}`}
        data-testid="position-status"
      >
        {positionResult.message}
      </div>

      <div className="wizard-btn-group">
        <button
          className="calibration-btn calibration-btn-secondary"
          onClick={onBack}
          data-testid="wizard-back-btn"
        >
          返回
        </button>
        <button
          className="calibration-btn calibration-btn-start"
          onClick={onContinue}
          disabled={!canContinue}
          data-testid="wizard-continue-btn"
        >
          继续
        </button>
      </div>
    </div>
  )
}
