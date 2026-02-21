import { useCallback, useState } from 'react'
import { Card, Toggle } from '@/components/shared'
import { useSettings } from '@/hooks/useSettings'
import type { IgnorePeriod } from '@/types/settings'

function createDefaultPeriod(): IgnorePeriod {
  return { start: '12:00', end: '13:00' }
}

export function IgnorePeriodsSettings() {
  const { settings, updateDisplay } = useSettings()
  const { ignorePeriods, weekendIgnore } = settings.display
  const [newPeriod, setNewPeriod] = useState<IgnorePeriod>(createDefaultPeriod)

  const handleWeekendToggle = useCallback(
    (checked: boolean) => {
      updateDisplay({ weekendIgnore: checked })
    },
    [updateDisplay],
  )

  const handleAddPeriod = useCallback(() => {
    if (newPeriod.start === newPeriod.end) return
    const updated = [...ignorePeriods, newPeriod]
    updateDisplay({ ignorePeriods: updated })
    setNewPeriod(createDefaultPeriod())
  }, [ignorePeriods, newPeriod, updateDisplay])

  const handleRemovePeriod = useCallback(
    (index: number) => {
      const updated = ignorePeriods.filter((_, i) => i !== index)
      updateDisplay({ ignorePeriods: updated })
    },
    [ignorePeriods, updateDisplay],
  )

  const handleNewStartChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewPeriod((prev) => ({ ...prev, start: e.target.value }))
    },
    [],
  )

  const handleNewEndChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewPeriod((prev) => ({ ...prev, end: e.target.value }))
    },
    [],
  )

  return (
    <>
      <Card title="忽略时段">
        <p className="settings-description">
          在忽略时段内，检测继续运行但不会触发任何提醒。
        </p>

        {ignorePeriods.length > 0 && (
          <ul className="ignore-period-list" data-testid="ignore-period-list">
            {ignorePeriods.map((period, index) => (
              <li key={`${period.start}-${period.end}-${index}`} className="ignore-period-item">
                <span className="ignore-period-time" data-testid={`ignore-period-${index}`}>
                  {period.start} - {period.end}
                </span>
                <button
                  className="ignore-period-remove"
                  onClick={() => handleRemovePeriod(index)}
                  data-testid={`remove-period-${index}`}
                  aria-label={`删除时段 ${period.start}-${period.end}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="ignore-period-add" data-testid="ignore-period-add">
          <input
            type="time"
            className="ignore-period-input"
            value={newPeriod.start}
            onChange={handleNewStartChange}
            data-testid="new-period-start"
            aria-label="开始时间"
          />
          <span className="ignore-period-separator">至</span>
          <input
            type="time"
            className="ignore-period-input"
            value={newPeriod.end}
            onChange={handleNewEndChange}
            data-testid="new-period-end"
            aria-label="结束时间"
          />
          <button
            className="settings-btn settings-btn-primary ignore-period-add-btn"
            onClick={handleAddPeriod}
            disabled={newPeriod.start === newPeriod.end}
            data-testid="add-period-btn"
          >
            添加
          </button>
        </div>
      </Card>

      <Card title="周末">
        <Toggle
          label="周末不检测"
          checked={weekendIgnore}
          onChange={handleWeekendToggle}
          description="周六、周日自动忽略所有检测提醒"
        />
      </Card>
    </>
  )
}
