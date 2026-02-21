import { IgnorePeriodsSettings } from './IgnorePeriodsSettings'

export function ScheduleSettings() {
  return (
    <div className="settings-panel" data-testid="schedule-settings">
      <h2 className="settings-panel-title">计划</h2>

      <IgnorePeriodsSettings />

      {/* 开机自启由 impl-auto-launch teammate 实现，此处预留集成点 */}
    </div>
  )
}
