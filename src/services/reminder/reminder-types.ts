import type { PostureViolation } from '@/types/ipc'

export interface ReminderConfig {
  readonly blur: boolean
  readonly notification: boolean
  readonly sound: boolean
  readonly delayMs: number
  readonly fadeOutDurationMs: number
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
} as const
