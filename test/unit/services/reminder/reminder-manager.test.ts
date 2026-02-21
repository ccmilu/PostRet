import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReminderManager } from '@/services/reminder/reminder-manager'
import type { ReminderCallbacks, ReminderConfig } from '@/services/reminder/reminder-types'
import type { PostureStatus, PostureViolation } from '@/types/ipc'

function createMockCallbacks(): ReminderCallbacks {
  return {
    onBlurActivate: vi.fn(),
    onBlurDeactivate: vi.fn(),
    onNotify: vi.fn(),
    onSound: vi.fn(),
  }
}

function createConfig(overrides?: Partial<ReminderConfig>): ReminderConfig {
  return {
    blur: true,
    notification: true,
    sound: true,
    delayMs: 5000,
    fadeOutDurationMs: 1500,
    ignorePeriods: [],
    weekendIgnore: false,
    ...overrides,
  }
}

const sampleViolation: PostureViolation = {
  rule: 'FORWARD_HEAD',
  severity: 0.6,
  message: 'Head is leaning forward',
}

function badPosture(violations: readonly PostureViolation[] = [sampleViolation]): PostureStatus {
  return {
    isGood: false,
    violations,
    confidence: 0.9,
    timestamp: Date.now(),
  }
}

function goodPosture(): PostureStatus {
  return {
    isGood: true,
    violations: [],
    confidence: 0.9,
    timestamp: Date.now(),
  }
}

describe('ReminderManager', () => {
  let callbacks: ReminderCallbacks
  let config: ReminderConfig

  beforeEach(() => {
    vi.useFakeTimers()
    callbacks = createMockCallbacks()
    config = createConfig()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should start in idle state', () => {
      const manager = new ReminderManager(config, callbacks)
      expect(manager.getState()).toBe('idle')
      manager.dispose()
    })
  })

  describe('normal trigger flow', () => {
    it('should transition to delaying when receiving bad posture', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())

      expect(manager.getState()).toBe('delaying')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should trigger reminders after delay expires', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).toHaveBeenCalledOnce()
      manager.dispose()
    })

    it('should pass violations to onNotify callback', () => {
      const violations: readonly PostureViolation[] = [
        { rule: 'FORWARD_HEAD', severity: 0.6, message: 'Head is leaning forward' },
        { rule: 'HEAD_TILT', severity: 0.3, message: 'Head is tilted' },
      ]
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture(violations))
      vi.advanceTimersByTime(5000)

      expect(callbacks.onNotify).toHaveBeenCalledWith(violations)
      manager.dispose()
    })
  })

  describe('cancel during delay', () => {
    it('should cancel timer and return to idle when posture becomes good during delay', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      expect(manager.getState()).toBe('delaying')

      vi.advanceTimersByTime(3000) // 3s < 5s delay
      manager.onPostureUpdate(goodPosture())

      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).not.toHaveBeenCalled()

      // Advance past original delay to confirm it was cancelled
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should not trigger if posture becomes good exactly at delay boundary', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(4999)
      manager.onPostureUpdate(goodPosture())

      expect(manager.getState()).toBe('idle')

      vi.advanceTimersByTime(1)
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      manager.dispose()
    })
  })

  describe('recovery from triggered state', () => {
    it('should deactivate blur when posture recovers after trigger', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()

      manager.onPostureUpdate(goodPosture())

      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurDeactivate).toHaveBeenCalledOnce()
      manager.dispose()
    })

    it('should not call onBlurDeactivate if blur was not enabled', () => {
      const noBlurConfig = createConfig({ blur: false })
      const manager = new ReminderManager(noBlurConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('triggered')

      manager.onPostureUpdate(goodPosture())

      expect(callbacks.onBlurDeactivate).not.toHaveBeenCalled()
      manager.dispose()
    })
  })

  describe('no duplicate triggers', () => {
    it('should not re-trigger when already in triggered state', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).toHaveBeenCalledOnce()

      // Continue feeding bad posture
      manager.onPostureUpdate(badPosture())
      manager.onPostureUpdate(badPosture())
      manager.onPostureUpdate(badPosture())

      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).toHaveBeenCalledOnce()
      manager.dispose()
    })

    it('should not start delay timer when already in triggered state', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('triggered')

      manager.onPostureUpdate(badPosture())
      expect(manager.getState()).toBe('triggered')
      manager.dispose()
    })
  })

  describe('independent switches', () => {
    it('should only trigger blur when only blur is enabled', () => {
      const blurOnlyConfig = createConfig({ blur: true, notification: false, sound: false })
      const manager = new ReminderManager(blurOnlyConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should only trigger notification when only notification is enabled', () => {
      const notifOnlyConfig = createConfig({ blur: false, notification: true, sound: false })
      const manager = new ReminderManager(notifOnlyConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should only trigger sound when only sound is enabled', () => {
      const soundOnlyConfig = createConfig({ blur: false, notification: false, sound: true })
      const manager = new ReminderManager(soundOnlyConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).toHaveBeenCalledOnce()
      manager.dispose()
    })

    it('should trigger nothing when all switches are off', () => {
      const allOffConfig = createConfig({ blur: false, notification: false, sound: false })
      const manager = new ReminderManager(allOffConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      // State still transitions even with no reminders active
      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should trigger blur and notification when sound is off', () => {
      const noSoundConfig = createConfig({ blur: true, notification: true, sound: false })
      const manager = new ReminderManager(noSoundConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should trigger blur and sound when notification is off', () => {
      const noNotifConfig = createConfig({ blur: true, notification: false, sound: true })
      const manager = new ReminderManager(noNotifConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).toHaveBeenCalledOnce()
      manager.dispose()
    })

    it('should trigger notification and sound when blur is off', () => {
      const noBlurConfig = createConfig({ blur: false, notification: true, sound: true })
      const manager = new ReminderManager(noBlurConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).toHaveBeenCalledOnce()
      manager.dispose()
    })
  })

  describe('config update', () => {
    it('should apply new delayMs for subsequent triggers', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.updateConfig({ delayMs: 10000 })

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('delaying')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()

      vi.advanceTimersByTime(5000) // total 10s
      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      manager.dispose()
    })

    it('should apply updated switch settings on next trigger', () => {
      const manager = new ReminderManager(config, callbacks)

      // Disable sound after construction
      manager.updateConfig({ sound: false })

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should only merge provided fields, not reset others', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.updateConfig({ blur: false })

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      // blur off, but notification and sound still on (original config)
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).toHaveBeenCalledOnce()
      expect(callbacks.onSound).toHaveBeenCalledOnce()
      manager.dispose()
    })
  })

  describe('dispose', () => {
    it('should clear pending timer on dispose', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      expect(manager.getState()).toBe('delaying')

      manager.dispose()
      vi.advanceTimersByTime(10000)

      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).not.toHaveBeenCalled()
    })

    it('should reset state to idle after dispose', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('triggered')

      manager.dispose()
      expect(manager.getState()).toBe('idle')
    })
  })

  describe('rapid toggling', () => {
    it('should handle rapid good/bad alternation without confusion', () => {
      const manager = new ReminderManager(config, callbacks)

      // Rapid toggling - never stays bad long enough
      for (let i = 0; i < 10; i++) {
        manager.onPostureUpdate(badPosture())
        vi.advanceTimersByTime(1000)
        manager.onPostureUpdate(goodPosture())
        vi.advanceTimersByTime(500)
      }

      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should trigger after rapid toggling followed by sustained bad posture', () => {
      const manager = new ReminderManager(config, callbacks)

      // Brief toggling
      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(1000)
      manager.onPostureUpdate(goodPosture())
      vi.advanceTimersByTime(500)

      // Then sustained bad posture
      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      manager.dispose()
    })
  })

  describe('re-trigger after recovery', () => {
    it('should be able to trigger again after recovery cycle', () => {
      const manager = new ReminderManager(config, callbacks)

      // First trigger cycle
      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledTimes(1)

      // Recovery
      manager.onPostureUpdate(goodPosture())
      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurDeactivate).toHaveBeenCalledTimes(1)

      // Second trigger cycle
      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledTimes(2)
      expect(callbacks.onNotify).toHaveBeenCalledTimes(2)
      expect(callbacks.onSound).toHaveBeenCalledTimes(2)

      manager.dispose()
    })
  })

  describe('idle + good posture', () => {
    it('should remain idle when receiving good posture in idle state', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(goodPosture())
      manager.onPostureUpdate(goodPosture())
      manager.onPostureUpdate(goodPosture())

      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onBlurDeactivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })
  })

  describe('ignore periods', () => {
    it('should suppress reminders during an ignore period', () => {
      // Set up a period covering the fake time
      const now = new Date()
      const startH = now.getHours().toString().padStart(2, '0')
      const startM = now.getMinutes().toString().padStart(2, '0')
      const endH = ((now.getHours() + 1) % 24).toString().padStart(2, '0')
      const endM = startM

      const ignoringConfig = createConfig({
        ignorePeriods: [{ start: `${startH}:${startM}`, end: `${endH}:${endM}` }],
      })
      const manager = new ReminderManager(ignoringConfig, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)

      // Should not trigger anything because we're in ignore period
      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurActivate).not.toHaveBeenCalled()
      expect(callbacks.onNotify).not.toHaveBeenCalled()
      expect(callbacks.onSound).not.toHaveBeenCalled()
      manager.dispose()
    })

    it('should cancel pending delay when entering ignore period via config update', () => {
      const manager = new ReminderManager(config, callbacks)

      // Start bad posture
      manager.onPostureUpdate(badPosture())
      expect(manager.getState()).toBe('delaying')

      // Update config to add ignore period covering current time
      const now = new Date()
      const startH = now.getHours().toString().padStart(2, '0')
      const startM = now.getMinutes().toString().padStart(2, '0')
      const endH = ((now.getHours() + 1) % 24).toString().padStart(2, '0')
      const endM = startM

      manager.updateConfig({
        ignorePeriods: [{ start: `${startH}:${startM}`, end: `${endH}:${endM}` }],
      })

      // Next posture update should be treated as good
      manager.onPostureUpdate(badPosture())
      expect(manager.getState()).toBe('idle')
      manager.dispose()
    })

    it('should report isInIgnorePeriod correctly', () => {
      const now = new Date()
      const startH = now.getHours().toString().padStart(2, '0')
      const startM = now.getMinutes().toString().padStart(2, '0')
      const endH = ((now.getHours() + 1) % 24).toString().padStart(2, '0')
      const endM = startM

      const ignoringConfig = createConfig({
        ignorePeriods: [{ start: `${startH}:${startM}`, end: `${endH}:${endM}` }],
      })
      const manager = new ReminderManager(ignoringConfig, callbacks)

      expect(manager.isInIgnorePeriod()).toBe(true)
      manager.dispose()
    })

    it('should report isInIgnorePeriod false when not in any period', () => {
      const manager = new ReminderManager(config, callbacks)
      expect(manager.isInIgnorePeriod()).toBe(false)
      manager.dispose()
    })

    it('should deactivate triggered blur when ignore period becomes active', () => {
      const manager = new ReminderManager(config, callbacks)

      // First trigger reminders
      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(5000)
      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()

      // Now update config to add ignore period
      const now = new Date()
      const startH = now.getHours().toString().padStart(2, '0')
      const startM = now.getMinutes().toString().padStart(2, '0')
      const endH = ((now.getHours() + 1) % 24).toString().padStart(2, '0')
      const endM = startM

      manager.updateConfig({
        ignorePeriods: [{ start: `${startH}:${startM}`, end: `${endH}:${endM}` }],
      })

      // Next update should treat as good and deactivate
      manager.onPostureUpdate(badPosture())
      expect(manager.getState()).toBe('idle')
      expect(callbacks.onBlurDeactivate).toHaveBeenCalledOnce()
      manager.dispose()
    })
  })

  describe('delaying + continued bad posture', () => {
    it('should not restart timer when receiving bad posture in delaying state', () => {
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(3000)

      // Another bad posture update should NOT restart the timer
      manager.onPostureUpdate(badPosture())
      vi.advanceTimersByTime(2000) // 3000 + 2000 = 5000 from initial start

      expect(manager.getState()).toBe('triggered')
      expect(callbacks.onBlurActivate).toHaveBeenCalledOnce()
      manager.dispose()
    })

    it('should update stored violations during delay', () => {
      const violations1: readonly PostureViolation[] = [
        { rule: 'FORWARD_HEAD', severity: 0.3, message: 'Head is leaning forward' },
      ]
      const violations2: readonly PostureViolation[] = [
        { rule: 'FORWARD_HEAD', severity: 0.8, message: 'Head is leaning forward' },
        { rule: 'HEAD_TILT', severity: 0.5, message: 'Head is tilted' },
      ]
      const manager = new ReminderManager(config, callbacks)

      manager.onPostureUpdate(badPosture(violations1))
      vi.advanceTimersByTime(3000)
      manager.onPostureUpdate(badPosture(violations2))
      vi.advanceTimersByTime(2000)

      // Should use latest violations when triggering
      expect(callbacks.onNotify).toHaveBeenCalledWith(violations2)
      manager.dispose()
    })
  })
})
