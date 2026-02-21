import { useCallback } from 'react'
import { Card, Toggle } from '@/components/shared'
import { useSettings } from '@/hooks/useSettings'

export interface GeneralSettingsProps {
  readonly onStartCalibration?: () => void
}

function getStatusLabel(
  enabled: boolean,
  hasCalibration: boolean,
): { text: string; className: string } {
  if (!enabled) {
    return { text: '已暂停', className: 'status-paused' }
  }
  if (!hasCalibration) {
    return { text: '未校准', className: 'status-uncalibrated' }
  }
  return { text: '检测中', className: 'status-detecting' }
}

export function GeneralSettings({ onStartCalibration }: GeneralSettingsProps) {
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
  const status = getStatusLabel(enabled, hasCalibration)

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
    </div>
  )
}
