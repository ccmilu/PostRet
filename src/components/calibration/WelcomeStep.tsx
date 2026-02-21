export interface WelcomeStepProps {
  readonly onStart: () => void
}

export function WelcomeStep({ onStart }: WelcomeStepProps) {
  return (
    <div className="wizard-step wizard-welcome" data-testid="wizard-step-1">
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
          <path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z" />
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        </svg>
      </div>

      <h2 className="wizard-step-title">姿态校准</h2>

      <p className="wizard-step-description">
        记录你的标准坐姿，在 3 个屏幕角度下分别采样，提高检测精度。
      </p>

      <div className="wizard-welcome-tips">
        <div className="wizard-tip">
          <span className="wizard-tip-number">1</span>
          <span className="wizard-tip-text">坐正身体，保持你认为舒适的标准坐姿</span>
        </div>
        <div className="wizard-tip">
          <span className="wizard-tip-number">2</span>
          <span className="wizard-tip-text">确保面部正对摄像头，距离适中</span>
        </div>
        <div className="wizard-tip">
          <span className="wizard-tip-number">3</span>
          <span className="wizard-tip-text">按提示调整屏幕开合角度（约 90°/110°/130°），每个角度采集约 5 秒</span>
        </div>
      </div>

      <button
        className="calibration-btn calibration-btn-start"
        onClick={onStart}
        data-testid="wizard-start-btn"
      >
        开始校准
      </button>
    </div>
  )
}
