import { useCallback } from 'react'
import { Slider, Card } from '@/components/shared'
import { useSettings } from '@/hooks/useSettings'
import { DEFAULT_THRESHOLDS } from '@/services/posture-analysis/thresholds'
import type { CustomThresholds } from '@/types/settings'

const DEFAULT_NOTIFICATION_INTERVAL_S = 30

interface ThresholdConfig {
  readonly key: keyof CustomThresholds
  readonly label: string
  readonly defaultValue: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly unit: string
}

const THRESHOLD_CONFIGS: readonly ThresholdConfig[] = [
  {
    key: 'forwardHead',
    label: '头部前倾阈值',
    defaultValue: DEFAULT_THRESHOLDS.forwardHead,
    min: 1,
    max: 30,
    step: 1,
    unit: '°',
  },
  {
    key: 'headTilt',
    label: '歪头阈值',
    defaultValue: DEFAULT_THRESHOLDS.headTilt,
    min: 1,
    max: 30,
    step: 1,
    unit: '°',
  },
  {
    key: 'tooClose',
    label: '距屏幕太近阈值',
    defaultValue: DEFAULT_THRESHOLDS.forwardHead,
    min: 1,
    max: 30,
    step: 1,
    unit: '°',
  },
  {
    key: 'shoulderAsymmetry',
    label: '肩膀不对称阈值',
    defaultValue: DEFAULT_THRESHOLDS.shoulderAsymmetry,
    min: 1,
    max: 30,
    step: 1,
    unit: '°',
  },
]

function getThresholdValue(
  customThresholds: CustomThresholds | undefined,
  key: keyof CustomThresholds,
  defaultValue: number,
): number {
  return customThresholds?.[key] ?? defaultValue
}

export function ThresholdTuner() {
  const { settings, updateAdvanced } = useSettings()

  const customThresholds = settings.advanced.customThresholds
  const notificationIntervalMs = settings.advanced.notificationIntervalMs
  const notificationIntervalS = notificationIntervalMs !== undefined
    ? Math.round(notificationIntervalMs / 1000)
    : DEFAULT_NOTIFICATION_INTERVAL_S

  const handleThresholdChange = useCallback(
    (key: keyof CustomThresholds, value: number) => {
      const nextThresholds: CustomThresholds = {
        ...customThresholds,
        [key]: value,
      }
      updateAdvanced({ customThresholds: nextThresholds })
    },
    [customThresholds, updateAdvanced],
  )

  const handleIntervalChange = useCallback(
    (seconds: number) => {
      updateAdvanced({ notificationIntervalMs: seconds * 1000 })
    },
    [updateAdvanced],
  )

  const handleRestoreDefaults = useCallback(() => {
    updateAdvanced({
      customThresholds: undefined,
      notificationIntervalMs: undefined,
    })
  }, [updateAdvanced])

  return (
    <div data-testid="threshold-tuner">
      <Card title="阈值调参">
        {THRESHOLD_CONFIGS.map((config) => (
          <div key={config.key}>
            <Slider
              label={config.label}
              value={getThresholdValue(customThresholds, config.key, config.defaultValue)}
              onChange={(v) => handleThresholdChange(config.key, v)}
              min={config.min}
              max={config.max}
              step={config.step}
              unit={config.unit}
            />
            <span
              className="settings-hint"
              data-testid={`default-hint-${config.key}`}
            >
              默认: {config.defaultValue}{config.unit}
            </span>
          </div>
        ))}
      </Card>

      <Card title="通知限流">
        <Slider
          label="通知间隔"
          value={notificationIntervalS}
          onChange={handleIntervalChange}
          min={5}
          max={120}
          step={5}
          unit="s"
        />
        <span className="settings-hint" data-testid="default-hint-interval">
          默认: {DEFAULT_NOTIFICATION_INTERVAL_S}s
        </span>
      </Card>

      <button
        className="settings-btn settings-btn-primary"
        data-testid="restore-defaults-btn"
        onClick={handleRestoreDefaults}
      >
        恢复默认值
      </button>
    </div>
  )
}
