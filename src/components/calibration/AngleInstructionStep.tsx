import { TOTAL_ANGLES } from '@/hooks/useCalibrationWizard'

export interface AngleInstructionStepProps {
  readonly angleIndex: number
  readonly angleLabel: number
  readonly onContinue: () => void
}

function getAngleDescription(angleLabel: number): string {
  switch (angleLabel) {
    case 90:
      return '将屏幕打开到约 90 度（近乎垂直）'
    case 110:
      return '将屏幕打开到约 110 度（正常使用角度）'
    case 130:
      return '将屏幕打开到约 130 度（向后倾斜较多）'
    default:
      return `将屏幕调整到约 ${angleLabel} 度`
  }
}

export function AngleInstructionStep({
  angleIndex,
  angleLabel,
  onContinue,
}: AngleInstructionStepProps) {
  return (
    <div
      className="wizard-step wizard-angle-instruction"
      data-testid="angle-instruction-step"
    >
      <div className="wizard-welcome-icon">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="2" y1="20" x2="22" y2="20" />
          <line x1="12" y1="17" x2="12" y2="20" />
        </svg>
      </div>

      <h2 className="wizard-step-title">
        调整屏幕角度 ({angleIndex + 1}/{TOTAL_ANGLES})
      </h2>

      <p className="wizard-step-description">
        {getAngleDescription(angleLabel)}
      </p>

      <p className="wizard-step-description">
        调整完成后保持姿势不动，点击继续开始采集
      </p>

      <button
        className="calibration-btn calibration-btn-start"
        onClick={onContinue}
        data-testid="angle-instruction-continue-btn"
      >
        继续采集
      </button>
    </div>
  )
}
