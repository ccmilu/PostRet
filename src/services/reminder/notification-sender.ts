import type { PostureViolation, PostureRule } from '@/types/ipc'

export interface NotificationContent {
  readonly title: string
  readonly body: string
}

interface NotificationLike {
  show(): void
}

export interface NotificationSenderOptions {
  readonly createNotification: (opts: NotificationContent) => NotificationLike
  readonly minIntervalMs?: number
}

export interface NotificationSender {
  send(violations: readonly PostureViolation[]): boolean
}

const NOTIFICATION_MAP: Readonly<Record<string, NotificationContent>> = {
  FORWARD_HEAD: {
    title: '头部前倾',
    body: '试试收回下巴，保持好姿势哦~',
  },
  HEAD_TILT: {
    title: '头部侧倾',
    body: '注意头部保持端正~',
  },
  TOO_CLOSE: {
    title: '距离太近',
    body: '稍微往后坐一点，保护眼睛~',
  },
  SHOULDER_ASYMMETRY: {
    title: '肩膀不对称',
    body: '注意双肩保持平衡~',
  },
}

const GENERAL_NOTIFICATION: NotificationContent = {
  title: '坐姿提醒',
  body: '调整一下姿势，你的身体会感谢你的~',
}

const DEFAULT_MIN_INTERVAL_MS = 30_000

export function getNotificationContent(
  violations: readonly PostureViolation[],
): NotificationContent {
  if (violations.length === 1) {
    const mapped = NOTIFICATION_MAP[violations[0].rule]
    if (mapped !== undefined) {
      return mapped
    }
  }
  return GENERAL_NOTIFICATION
}

export function createNotificationSender(
  options: NotificationSenderOptions,
): NotificationSender {
  const minInterval = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
  let lastSentTime = 0

  return {
    send(violations: readonly PostureViolation[]): boolean {
      const now = Date.now()
      if (now - lastSentTime < minInterval) {
        return false
      }

      const content = getNotificationContent(violations)
      const notification = options.createNotification(content)
      notification.show()
      lastSentTime = now
      return true
    },
  }
}
