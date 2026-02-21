import { useCallback } from 'react'
import { Card, Toggle } from '@/components/shared'
import { useSettings } from '@/hooks/useSettings'
import type { UsePostureDetectionReturn, DetectionState } from '@/hooks/usePostureDetection'

export interface GeneralSettingsProps {
  readonly onStartCalibration?: () => void
  readonly detection?: UsePostureDetectionReturn
}

const STATE_LABELS: Record<DetectionState, { text: string; className: string }> = {
  idle: { text: '未启动', className: 'status-paused' },
  initializing: { text: '初始化中...', className: 'status-uncalibrated' },
  detecting: { text: '检测中', className: 'status-detecting' },
  paused: { text: '已暂停', className: 'status-paused' },
  error: { text: '错误', className: 'status-error' },
  'no-camera': { text: '无摄像头', className: 'status-error' },
}

function getStatusFromDetection(
  detection: UsePostureDetectionReturn | undefined,
  enabled: boolean,
  hasCalibration: boolean,
): { text: string; className: string } {
  if (detection) {
    return STATE_LABELS[detection.state]
  }
  // Fallback when detection is not passed (e.g. in tests)
  if (!enabled) {
    return { text: '已暂停', className: 'status-paused' }
  }
  if (!hasCalibration) {
    return { text: '未校准', className: 'status-uncalibrated' }
  }
  return { text: '检测中', className: 'status-detecting' }
}

function formatAngle(value: number): string {
  return `${value.toFixed(1)}\u00B0`
}

function formatRatio(value: number): string {
  return value.toFixed(3)
}

export function GeneralSettings({ onStartCalibration, detection }: GeneralSettingsProps) {
  const { settings, loading, updateDetection } = useSettings()

  const handleEnabledChange = useCallback(
    (checked: boolean) => {
      updateDetection({ enabled: checked })
    },
    [updateDetection],
  )

  if (loading) {
    return (
      <div className="settings-panel" data-testid="general-settings-loading">
        <p className="settings-loading-text">加载中...</p>
      </div>
    )
  }

  const { enabled } = settings.detection
  const hasCalibration = settings.calibration !== null
  const status = getStatusFromDetection(detection, enabled, hasCalibration)

  return (
    <div className="settings-panel" data-testid="general-settings">
      <h2 className="settings-panel-title">通用</h2>

      <Card title="检测">
        <Toggle
          label="启用姿态检测"
          checked={enabled}
          onChange={handleEnabledChange}
          description="开启后将通过摄像头实时检测坐姿"
        />
        <div className="status-indicator" data-testid="status-indicator">
          <span className="status-label">当前状态</span>
          <span className={`status-badge ${status.className}`} data-testid="status-badge">
            {status.text}
          </span>
        </div>
        {detection?.error && (
          <p className="detection-error-text" data-testid="detection-error">
            {detection.error}
          </p>
        )}
      </Card>

      <Card title="校准">
        <p className="settings-description">
          校准将采集你的正确坐姿作为基准，以提高检测准确度。
        </p>
        <button
          className="settings-btn settings-btn-primary"
          onClick={onStartCalibration}
          data-testid="start-calibration-btn"
        >
          开始校准
        </button>
        {hasCalibration && (
          <p className="settings-hint" data-testid="calibration-done-hint">
            上次校准: {new Date(settings.calibration!.timestamp).toLocaleString()}
          </p>
        )}
      </Card>

      {detection && (detection.state === 'detecting' || detection.state === 'paused') && (
        <Card title="检测状态">
          <div className="detection-debug" data-testid="detection-debug">
            {detection.lastStatus && (
              <div className="debug-section" data-testid="debug-posture-status">
                <div className="debug-row">
                  <span className="debug-label">姿态</span>
                  <span
                    className={`debug-value ${detection.lastStatus.isGood ? 'debug-good' : 'debug-bad'}`}
                    data-testid="debug-posture-good"
                  >
                    {detection.lastStatus.isGood ? '良好' : '不良'}
                  </span>
                </div>
                <div className="debug-row">
                  <span className="debug-label">置信度</span>
                  <span className="debug-value" data-testid="debug-confidence">
                    {(detection.lastStatus.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {detection.lastStatus.violations.length > 0 && (
                  <div className="debug-violations" data-testid="debug-violations">
                    <span className="debug-label">违规项</span>
                    <ul className="debug-violation-list">
                      {detection.lastStatus.violations.map((v) => (
                        <li key={v.rule} className="debug-violation-item">
                          {v.message} ({(v.severity * 100).toFixed(0)}%)
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {detection.lastAngles && (
              <div className="debug-section" data-testid="debug-angles">
                <span className="debug-section-title">当前角度</span>
                <div className="debug-row">
                  <span className="debug-label">头部前倾</span>
                  <span className="debug-value" data-testid="debug-angle-head-forward">
                    {formatAngle(detection.lastAngles.headForwardAngle)}
                  </span>
                </div>
                <div className="debug-row">
                  <span className="debug-label">歪头</span>
                  <span className="debug-value" data-testid="debug-angle-head-tilt">
                    {formatAngle(detection.lastAngles.headTiltAngle)}
                  </span>
                </div>
                <div className="debug-row">
                  <span className="debug-label">面部比例</span>
                  <span className="debug-value" data-testid="debug-angle-face-ratio">
                    {formatRatio(detection.lastAngles.faceFrameRatio)}
                  </span>
                </div>
                <div className="debug-row">
                  <span className="debug-label">肩膀差异</span>
                  <span className="debug-value" data-testid="debug-angle-shoulder">
                    {formatAngle(detection.lastAngles.shoulderDiff)}
                  </span>
                </div>
              </div>
            )}

            {detection.lastDeviations && (
              <div className="debug-section" data-testid="debug-deviations">
                <span className="debug-section-title">偏差值</span>
                <div className="debug-row">
                  <span className="debug-label">头部前倾偏差</span>
                  <span className="debug-value" data-testid="debug-dev-head-forward">
                    {formatAngle(detection.lastDeviations.headForward)}
                  </span>
                </div>
                <div className="debug-row">
                  <span className="debug-label">歪头偏差</span>
                  <span className="debug-value" data-testid="debug-dev-head-tilt">
                    {formatAngle(detection.lastDeviations.headTilt)}
                  </span>
                </div>
                <div className="debug-row">
                  <span className="debug-label">肩膀偏差</span>
                  <span className="debug-value" data-testid="debug-dev-shoulder">
                    {formatAngle(detection.lastDeviations.shoulderDiff)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
