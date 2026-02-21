import { useCallback } from 'react'
import { Card, Toggle, Slider } from '@/components/shared'
import { useSettings } from '@/hooks/useSettings'
import type { RuleToggles } from '@/types/settings'

const RULE_LABELS: Record<keyof RuleToggles, { label: string; description: string }> = {
  forwardHead: { label: '头部前倾', description: '检测头部是否过于靠近屏幕' },
  headTilt: { label: '歪头', description: '检测头部是否倾斜' },
  tooClose: { label: '距屏幕太近', description: '检测面部是否离屏幕过近' },
  shoulderAsymmetry: { label: '肩膀不对称', description: '检测两肩是否高低不平' },
  slouch: { label: '驼背弯腰', description: '检测上半身是否前倾（暂不启用）' },
}

const DISPLAYED_RULES: readonly (keyof RuleToggles)[] = [
  'forwardHead',
  'headTilt',
  'tooClose',
  'shoulderAsymmetry',
]

function formatInterval(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${ms}ms`
}

export function DetectionSettings() {
  const { settings, loading, updateDetection } = useSettings()

  const handleRuleToggle = useCallback(
    (rule: keyof RuleToggles) => (checked: boolean) => {
      const nextRules: RuleToggles = {
        ...settings.detection.rules,
        [rule]: checked,
      }
      updateDetection({ rules: nextRules })
    },
    [settings.detection.rules, updateDetection],
  )

  const handleIntervalChange = useCallback(
    (value: number) => {
      updateDetection({ intervalMs: value })
    },
    [updateDetection],
  )

  const handleSensitivityChange = useCallback(
    (value: number) => {
      updateDetection({ sensitivity: value })
    },
    [updateDetection],
  )

  if (loading) {
    return (
      <div className="settings-panel" data-testid="detection-settings-loading">
        <p className="settings-loading-text">加载中...</p>
      </div>
    )
  }

  const { rules, intervalMs, sensitivity } = settings.detection

  return (
    <div className="settings-panel" data-testid="detection-settings">
      <h2 className="settings-panel-title">检测</h2>

      <Card title="检测规则">
        {DISPLAYED_RULES.map((rule) => (
          <Toggle
            key={rule}
            label={RULE_LABELS[rule].label}
            checked={rules[rule]}
            onChange={handleRuleToggle(rule)}
            description={RULE_LABELS[rule].description}
          />
        ))}
      </Card>

      <Card title="检测参数">
        <Slider
          label="检测频率"
          value={intervalMs}
          onChange={handleIntervalChange}
          min={100}
          max={2000}
          step={100}
          unit=""
        />
        <p className="settings-hint">
          每 {formatInterval(intervalMs)} 检测一次 — 更短间隔更灵敏但更耗电
        </p>
        <Slider
          label="检测灵敏度"
          value={sensitivity}
          onChange={handleSensitivityChange}
          min={0}
          max={1}
          step={0.05}
        />
      </Card>
    </div>
  )
}
