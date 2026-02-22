import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getNotificationContent,
  createNotificationSender,
} from '../../../../src/services/reminder/notification-sender'
import type { PostureViolation } from '../../../../src/types/ipc'

// ─── helpers ───

function makeViolation(rule: PostureViolation['rule'], severity = 0.5): PostureViolation {
  return { rule, severity, message: `${rule} detected` }
}

// ─── getNotificationContent (pure function) ───

describe('getNotificationContent', () => {
  it('should return forwardHead content for single FORWARD_HEAD violation', () => {
    const content = getNotificationContent([makeViolation('FORWARD_HEAD')])
    expect(content.title).toBe('头部前倾')
    expect(content.body).toBe('试试收回下巴，保持好姿势哦~')
  })

  it('should return headTilt content for single HEAD_TILT violation', () => {
    const content = getNotificationContent([makeViolation('HEAD_TILT')])
    expect(content.title).toBe('头部侧倾')
    expect(content.body).toBe('注意头部保持端正~')
  })

  it('should return tooClose content for single TOO_CLOSE violation', () => {
    const content = getNotificationContent([makeViolation('TOO_CLOSE')])
    expect(content.title).toBe('距离太近')
    expect(content.body).toBe('适当后移一些，保护视力哦~')
  })

  it('should return shoulderAsymmetry content for single SHOULDER_ASYMMETRY violation', () => {
    const content = getNotificationContent([makeViolation('SHOULDER_ASYMMETRY')])
    expect(content.title).toBe('肩膀不平')
    expect(content.body).toBe('注意双肩保持水平~')
  })

  it('should return general content for multiple violations', () => {
    const violations = [
      makeViolation('FORWARD_HEAD'),
      makeViolation('HEAD_TILT'),
    ]
    const content = getNotificationContent(violations)
    expect(content.title).toBe('坐姿提醒')
    expect(content.body).toBe('调整一下姿势，你的身体会感谢你的~')
  })

  it('should return general content for empty violations list', () => {
    const content = getNotificationContent([])
    expect(content.title).toBe('坐姿提醒')
    expect(content.body).toBe('调整一下姿势，你的身体会感谢你的~')
  })

  it('should return general content for SLOUCH violation (no specific mapping)', () => {
    const content = getNotificationContent([makeViolation('SLOUCH')])
    expect(content.title).toBe('坐姿提醒')
    expect(content.body).toBe('调整一下姿势，你的身体会感谢你的~')
  })
})

// ─── createNotificationSender (with rate limiting) ───

describe('createNotificationSender', () => {
  let mockShow: ReturnType<typeof vi.fn>
  let mockNotificationFactory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    mockShow = vi.fn()
    mockNotificationFactory = vi.fn().mockReturnValue({ show: mockShow })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should send notification on first call and return true', () => {
    const sender = createNotificationSender({ createNotification: mockNotificationFactory })
    const result = sender.send([makeViolation('FORWARD_HEAD')])

    expect(result).toBe(true)
    expect(mockNotificationFactory).toHaveBeenCalledWith({
      title: '头部前倾',
      body: '试试收回下巴，保持好姿势哦~',
    })
    expect(mockShow).toHaveBeenCalledTimes(1)
  })

  it('should return false when called within 30 seconds (rate limited)', () => {
    const sender = createNotificationSender({ createNotification: mockNotificationFactory })

    const first = sender.send([makeViolation('FORWARD_HEAD')])
    expect(first).toBe(true)

    vi.advanceTimersByTime(15_000) // 15 seconds

    const second = sender.send([makeViolation('HEAD_TILT')])
    expect(second).toBe(false)
    expect(mockNotificationFactory).toHaveBeenCalledTimes(1) // only first call
  })

  it('should allow sending after 30 seconds have elapsed', () => {
    const sender = createNotificationSender({ createNotification: mockNotificationFactory })

    sender.send([makeViolation('FORWARD_HEAD')])
    expect(mockNotificationFactory).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(30_001) // just past 30s

    const result = sender.send([makeViolation('HEAD_TILT')])
    expect(result).toBe(true)
    expect(mockNotificationFactory).toHaveBeenCalledTimes(2)
    expect(mockNotificationFactory).toHaveBeenLastCalledWith({
      title: '头部侧倾',
      body: '注意头部保持端正~',
    })
  })

  it('should allow sending at exactly 30 seconds', () => {
    const sender = createNotificationSender({ createNotification: mockNotificationFactory })

    sender.send([makeViolation('FORWARD_HEAD')])
    vi.advanceTimersByTime(30_000) // exactly 30s

    const result = sender.send([makeViolation('TOO_CLOSE')])
    expect(result).toBe(true)
    expect(mockNotificationFactory).toHaveBeenCalledTimes(2)
  })

  it('should reset rate limit timer after each successful send', () => {
    const sender = createNotificationSender({ createNotification: mockNotificationFactory })

    sender.send([makeViolation('FORWARD_HEAD')])
    vi.advanceTimersByTime(30_001)

    sender.send([makeViolation('HEAD_TILT')])
    // Rate limit resets here; 15s is not enough
    vi.advanceTimersByTime(15_000)

    const result = sender.send([makeViolation('TOO_CLOSE')])
    expect(result).toBe(false)
    expect(mockNotificationFactory).toHaveBeenCalledTimes(2)
  })

  it('should use general content for multiple violations', () => {
    const sender = createNotificationSender({ createNotification: mockNotificationFactory })

    sender.send([makeViolation('FORWARD_HEAD'), makeViolation('HEAD_TILT')])

    expect(mockNotificationFactory).toHaveBeenCalledWith({
      title: '坐姿提醒',
      body: '调整一下姿势，你的身体会感谢你的~',
    })
  })

  it('should not call show when rate limited', () => {
    const sender = createNotificationSender({ createNotification: mockNotificationFactory })

    sender.send([makeViolation('FORWARD_HEAD')])
    sender.send([makeViolation('HEAD_TILT')]) // rate limited

    expect(mockShow).toHaveBeenCalledTimes(1)
  })

  it('should support custom interval via options', () => {
    const sender = createNotificationSender({
      createNotification: mockNotificationFactory,
      minIntervalMs: 10_000,
    })

    sender.send([makeViolation('FORWARD_HEAD')])
    vi.advanceTimersByTime(10_000)

    const result = sender.send([makeViolation('HEAD_TILT')])
    expect(result).toBe(true)
    expect(mockNotificationFactory).toHaveBeenCalledTimes(2)
  })

  it('should dynamically update minInterval via updateMinInterval', () => {
    const sender = createNotificationSender({
      createNotification: mockNotificationFactory,
      minIntervalMs: 30_000,
    })

    sender.send([makeViolation('FORWARD_HEAD')])
    expect(sender.getMinInterval()).toBe(30_000)

    // Shorten interval to 5s
    sender.updateMinInterval(5_000)
    expect(sender.getMinInterval()).toBe(5_000)

    vi.advanceTimersByTime(5_000)

    const result = sender.send([makeViolation('HEAD_TILT')])
    expect(result).toBe(true)
    expect(mockNotificationFactory).toHaveBeenCalledTimes(2)
  })

  it('should respect new longer interval after updateMinInterval', () => {
    const sender = createNotificationSender({
      createNotification: mockNotificationFactory,
      minIntervalMs: 5_000,
    })

    sender.send([makeViolation('FORWARD_HEAD')])

    // Lengthen interval to 60s
    sender.updateMinInterval(60_000)

    vi.advanceTimersByTime(30_000) // only 30s, not enough

    const result = sender.send([makeViolation('HEAD_TILT')])
    expect(result).toBe(false)
  })

  it('getMinInterval returns default when not explicitly set', () => {
    const sender = createNotificationSender({
      createNotification: mockNotificationFactory,
    })

    expect(sender.getMinInterval()).toBe(30_000)
  })
})
