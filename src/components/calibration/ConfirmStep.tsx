export interface ConfirmStepProps {
  readonly onRecalibrate: () => void
  readonly onConfirm: () => void
}

export function ConfirmStep({ onRecalibrate, onConfirm }: ConfirmStepProps) {
  return (
    <div className="wizard-step wizard-confirm" data-testid="wizard-step-4">
      <div className="wizard-confirm-icon">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#248a3d"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      </div>

      <h2 className="wizard-step-title wizard-confirm-title">校准完成</h2>
      <p className="wizard-step-description">
        已成功记录你的标准坐姿基准
      </p>

      <div className="wizard-btn-group">
        <button
          className="calibration-btn calibration-btn-secondary"
          onClick={onRecalibrate}
          data-testid="wizard-recalibrate-btn"
        >
          重新校准
        </button>
        <button
          className="calibration-btn calibration-btn-confirm"
          onClick={onConfirm}
          data-testid="wizard-confirm-btn"
        >
          确认
        </button>
      </div>
    </div>
  )
}
