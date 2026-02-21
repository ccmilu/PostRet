import { useCallback } from 'react'
import { Card, Toggle, Slider } from '@/components/shared'
import { useSettings } from '@/hooks/useSettings'

function formatDelay(ms: number): string {
  const seconds = ms / 1000
  return `${seconds}s`
}

export function ReminderSettings() {
  const { settings, loading, updateReminder } = useSettings()

  const handleBlurChange = useCallback(
    (checked: boolean) => {
      updateReminder({ blur: checked })
    },
    [updateReminder],
  )

  const handleSoundChange = useCallback(
    (checked: boolean) => {
      updateReminder({ sound: checked })
    },
    [updateReminder],
  )

  const handleNotificationChange = useCallback(
    (checked: boolean) => {
      updateReminder({ notification: checked })
    },
    [updateReminder],
  )

  const handleDelayChange = useCallback(
    (value: number) => {
      updateReminder({ delayMs: value })
    },
    [updateReminder],
  )

  const handleFadeOutChange = useCallback(
    (value: number) => {
      updateReminder({ fadeOutDurationMs: value })
    },
    [updateReminder],
  )

  if (loading) {
    return (
      <div className="settings-panel" data-testid="reminder-settings-loading">
        <p className="settings-loading-text">加载中...</p>
      </div>
    )
  }

  const { blur, sound, notification, delayMs, fadeOutDurationMs } = settings.reminder

  return (
    <div className="settings-panel" data-testid="reminder-settings">
      <h2 className="settings-panel-title">提醒</h2>

      <Card title="提醒方式">
        <Toggle
          label="屏幕模糊"
          checked={blur}
          onChange={handleBlurChange}
          description="不良姿态时模糊整个屏幕"
        />
        <Toggle
          label="提示音"
          checked={sound}
          onChange={handleSoundChange}
          description="使用系统提示音进行提醒"
        />
        <Toggle
          label="系统通知"
          checked={notification}
          onChange={handleNotificationChange}
          description="发送 macOS 系统通知"
        />
      </Card>

      <Card title="延迟设置">
        <Slider
          label="触发延迟"
          value={delayMs}
          onChange={handleDelayChange}
          min={1000}
          max={15000}
          step={500}
          unit=""
        />
        <p className="settings-hint">
          延迟 {formatDelay(delayMs)} — 不良姿态持续此时间后触发提醒
        </p>
        <Slider
          label="渐变消除时长"
          value={fadeOutDurationMs}
          onChange={handleFadeOutChange}
          min={500}
          max={5000}
          step={100}
          unit=""
        />
        <p className="settings-hint">
          消除 {formatDelay(fadeOutDurationMs)} — 姿态纠正后模糊渐变消除的时长
        </p>
      </Card>
    </div>
  )
}
