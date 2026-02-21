import type { PostureStatus, PostureViolation } from '@/types/ipc'
import type {
  ReminderCallbacks,
  ReminderConfig,
  ReminderState,
} from './reminder-types'
import { isInIgnorePeriod } from './ignore-period-checker'

export class ReminderManager {
  private config: ReminderConfig
  private readonly callbacks: ReminderCallbacks
  private state: ReminderState = 'idle'
  private delayTimer: ReturnType<typeof setTimeout> | null = null
  private lastViolations: readonly PostureViolation[] = []
  private blurActive = false

  constructor(config: ReminderConfig, callbacks: ReminderCallbacks) {
    this.config = config
    this.callbacks = callbacks
  }

  onPostureUpdate(status: PostureStatus): void {
    // If we're in an ignore period, treat as good posture (suppress all reminders)
    if (isInIgnorePeriod(this.config.ignorePeriods, this.config.weekendIgnore)) {
      this.handleGoodPosture()
      return
    }

    if (status.isGood) {
      this.handleGoodPosture()
    } else {
      this.handleBadPosture(status.violations)
    }
  }

  updateConfig(partial: Partial<ReminderConfig>): void {
    this.config = { ...this.config, ...partial }
  }

  getState(): ReminderState {
    return this.state
  }

  isInIgnorePeriod(): boolean {
    return isInIgnorePeriod(this.config.ignorePeriods, this.config.weekendIgnore)
  }

  dispose(): void {
    this.clearDelayTimer()
    this.state = 'idle'
    this.blurActive = false
    this.lastViolations = []
  }

  private handleGoodPosture(): void {
    switch (this.state) {
      case 'idle':
        // No-op
        break
      case 'delaying':
        this.clearDelayTimer()
        this.state = 'idle'
        break
      case 'triggered':
        this.deactivateReminders()
        this.state = 'idle'
        break
    }
  }

  private handleBadPosture(violations: readonly PostureViolation[]): void {
    this.lastViolations = violations

    switch (this.state) {
      case 'idle':
        this.state = 'delaying'
        this.startDelayTimer()
        break
      case 'delaying':
        // Timer already running, just update violations
        break
      case 'triggered':
        // Already triggered, do not re-trigger
        break
    }
  }

  private startDelayTimer(): void {
    this.delayTimer = setTimeout(() => {
      this.delayTimer = null
      this.triggerReminders()
    }, this.config.delayMs)
  }

  private triggerReminders(): void {
    this.state = 'triggered'

    if (this.config.blur) {
      this.blurActive = true
      this.callbacks.onBlurActivate()
    }

    if (this.config.notification) {
      this.callbacks.onNotify(this.lastViolations)
    }

    if (this.config.sound) {
      this.callbacks.onSound()
    }
  }

  private deactivateReminders(): void {
    if (this.blurActive) {
      this.blurActive = false
      this.callbacks.onBlurDeactivate()
    }
  }

  private clearDelayTimer(): void {
    if (this.delayTimer !== null) {
      clearTimeout(this.delayTimer)
      this.delayTimer = null
    }
  }
}
