import type { UsePostureDetectionReturn } from '@/hooks/usePostureDetection'
import type { CalibrationData } from '@/types/settings'

export interface DebugPanelProps {
  readonly detection: UsePostureDetectionReturn
  readonly calibration: CalibrationData | null
  readonly onClose: () => void
}

function formatAngle(value: number): string {
  return value.toFixed(1)
}

function formatRatio(value: number): string {
  return value.toFixed(3)
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

export function DebugPanel({ detection, calibration, onClose }: DebugPanelProps) {
  const { state, lastStatus, lastAngles, lastDeviations } = detection
  const hasData = lastAngles !== null

  return (
    <div className="settings-panel debug-panel-container" data-testid="debug-panel">
      <div className="debug-panel-header">
        <h2 className="settings-panel-title">调试</h2>
        <button
          className="debug-close-btn"
          onClick={onClose}
          data-testid="debug-close-btn"
          aria-label="关闭调试面板"
        >
          ✕
        </button>
      </div>

      {/* Detection Status */}
      <div className="debug-card" data-testid="debug-status-section">
        <span className="debug-card-title">检测状态</span>
        <div className="debug-data-row">
          <span className="debug-data-label">状态</span>
          <span className="debug-data-value" data-testid="debug-detection-state">
            {state}
          </span>
        </div>
        <div className="debug-data-row">
          <span className="debug-data-label">置信度</span>
          <span className="debug-data-value" data-testid="debug-detection-confidence">
            {lastStatus ? `${(lastStatus.confidence * 100).toFixed(0)}%` : '-'}
          </span>
        </div>
        <div className="debug-data-row">
          <span className="debug-data-label">姿态</span>
          <span
            className={`debug-data-value ${lastStatus ? (lastStatus.isGood ? 'debug-good' : 'debug-bad') : ''}`}
            data-testid="debug-posture-status"
          >
            {lastStatus ? (lastStatus.isGood ? '良好' : '不良') : '-'}
          </span>
        </div>
        {lastStatus && (
          <div className="debug-data-row">
            <span className="debug-data-label">最后检测</span>
            <span className="debug-data-value" data-testid="debug-last-timestamp">
              {formatTimestamp(lastStatus.timestamp)}
            </span>
          </div>
        )}
        {lastStatus && !lastStatus.isGood && lastStatus.violations.length > 0 && (
          <div className="debug-violations-section" data-testid="debug-violations-list">
            <span className="debug-data-label">违规项</span>
            {lastStatus.violations.map((v) => (
              <div
                key={v.rule}
                className="debug-violation-entry"
                data-testid={`debug-violation-${v.rule}`}
              >
                <span className="debug-bad">{v.rule}</span>
                <span className="debug-data-value">
                  {v.message} ({(v.severity * 100).toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!hasData && (
        <div className="debug-card debug-placeholder" data-testid="debug-no-data">
          <span className="debug-data-label">暂无检测数据，请确保检测已启动并完成校准</span>
        </div>
      )}

      {/* Angles Table */}
      {hasData && (
        <div className="debug-card" data-testid="debug-angles-section">
          <span className="debug-card-title">角度数值</span>
          <table className="debug-table">
            <thead>
              <tr>
                <th>指标</th>
                <th>当前值</th>
                <th>基准值</th>
                <th>偏差</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>headForward</td>
                <td data-testid="debug-val-headForward">
                  {formatAngle(lastAngles.headForwardAngle)}°
                </td>
                <td data-testid="debug-baseline-headForward">
                  {calibration ? `${formatAngle(calibration.headForwardAngle)}°` : '-'}
                </td>
                <td data-testid="debug-dev-headForward">
                  {lastDeviations ? `${formatAngle(lastDeviations.headForward)}°` : '-'}
                </td>
              </tr>
              <tr>
                <td>headTilt</td>
                <td data-testid="debug-val-headTilt">
                  {formatAngle(lastAngles.headTiltAngle)}°
                </td>
                <td data-testid="debug-baseline-headTilt">
                  {calibration ? `${formatAngle(calibration.headTiltAngle)}°` : '-'}
                </td>
                <td data-testid="debug-dev-headTilt">
                  {lastDeviations ? `${formatAngle(lastDeviations.headTilt)}°` : '-'}
                </td>
              </tr>
              <tr>
                <td>faceFrameRatio</td>
                <td data-testid="debug-val-faceFrameRatio">
                  {formatRatio(lastAngles.faceFrameRatio)}
                </td>
                <td data-testid="debug-baseline-faceFrameRatio">
                  {calibration ? formatRatio(calibration.faceFrameRatio) : '-'}
                </td>
                <td data-testid="debug-dev-faceFrameRatio">
                  {lastDeviations ? formatRatio(lastDeviations.faceFrameRatio) : '-'}
                </td>
              </tr>
              <tr>
                <td>shoulderDiff</td>
                <td data-testid="debug-val-shoulderDiff">
                  {formatAngle(lastAngles.shoulderDiff)}°
                </td>
                <td data-testid="debug-baseline-shoulderDiff">
                  {calibration ? `${formatAngle(calibration.shoulderDiff)}°` : '-'}
                </td>
                <td data-testid="debug-dev-shoulderDiff">
                  {lastDeviations ? `${formatAngle(lastDeviations.shoulderDiff)}°` : '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Calibration baseline */}
      {!calibration && (
        <div className="debug-card debug-placeholder" data-testid="debug-no-calibration">
          <span className="debug-data-label">未校准 — 基准值不可用</span>
        </div>
      )}

      {/* Additional raw values */}
      {hasData && (
        <div className="debug-card" data-testid="debug-raw-section">
          <span className="debug-card-title">其他数值</span>
          <div className="debug-data-row">
            <span className="debug-data-label">faceY</span>
            <span className="debug-data-value" data-testid="debug-val-faceY">
              {formatRatio(lastAngles.faceY)}
            </span>
          </div>
          <div className="debug-data-row">
            <span className="debug-data-label">noseToEarAvg</span>
            <span className="debug-data-value" data-testid="debug-val-noseToEarAvg">
              {formatRatio(lastAngles.noseToEarAvg)}
            </span>
          </div>
          <div className="debug-data-row">
            <span className="debug-data-label">torsoAngle</span>
            <span className="debug-data-value" data-testid="debug-val-torsoAngle">
              {formatAngle(lastAngles.torsoAngle)}°
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
