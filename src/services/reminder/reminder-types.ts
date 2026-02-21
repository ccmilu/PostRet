import type { PostureViolation } from '@/types/ipc'
import type { IgnorePeriod } from '@/types/settings'

export interface ReminderConfig {
  readonly blur: boolean
  readonly notification: boolean
  readonly sound: boolean
  readonly delayMs: number
  readonly fadeOutDurationMs: number
  readonly ignorePeriods: readonly IgnorePeriod[]
  readonly weekendIgnore: boolean
}

export interface ReminderCallbacks {
  readonly onBlurActivate: () => void
  readonly onBlurDeactivate: () => void
  readonly onNotify: (violations: readonly PostureViolation[]) => void
  readonly onSound: () => void
}

export type ReminderState = 'idle' | 'delaying' | 'triggered'

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  blur: true,
  notification: true,
  sound: false,
  delayMs: 5000,
  fadeOutDurationMs: 1500,
  ignorePeriods: [],
  weekendIgnore: false,
} as const
