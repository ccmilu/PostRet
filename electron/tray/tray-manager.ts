import { Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import type { AppStatus } from '../../src/types/ipc'

export interface TrayCallbacks {
  onShowSettings: () => void
  onStartCalibration: () => void
  onPauseResume: () => void
  onQuit: () => void
}

const STATUS_LABELS: Record<AppStatus, string> = {
  detecting: '✅ 检测中',
  paused: '⏸ 已暂停',
  calibrating: '📐 校准中...',
  'no-camera': '📷 无摄像头',
  error: '❌ 错误',
}

export class TrayManager {
  private tray: Tray | null = null
  private readonly callbacks: TrayCallbacks
  private currentStatus: AppStatus = 'paused'

  constructor(callbacks: TrayCallbacks) {
    this.callbacks = callbacks
    this.createTray()
  }

  private createTray(): void {
    const iconPath = join(__dirname, '../assets/icons/tray-icon.png')
    const icon = nativeImage.createFromPath(iconPath)
    // Resize for macOS menu bar (16x16 @1x, template image)
    const resized = icon.resize({ width: 16, height: 16 })
    resized.setTemplateImage(true)

    this.tray = new Tray(resized)
    this.tray.setToolTip('PostRet - 姿态矫正')
    this.rebuildMenu()
  }

  private rebuildMenu(): void {
    if (!this.tray) return

    const isPaused = this.currentStatus === 'paused'
    const isDetecting = this.currentStatus === 'detecting'

    const contextMenu = Menu.buildFromTemplate([
      {
        label: STATUS_LABELS[this.currentStatus],
        enabled: false,
      },
      { type: 'separator' },
      {
        label: isPaused ? '▶ 恢复检测' : '⏸ 暂停检测',
        enabled: isPaused || isDetecting,
        click: () => this.callbacks.onPauseResume(),
      },
      { type: 'separator' },
      {
        label: '⚙ 设置',
        click: () => this.callbacks.onShowSettings(),
      },
      {
        label: '📐 校准',
        click: () => this.callbacks.onStartCalibration(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => this.callbacks.onQuit(),
      },
    ])

    this.tray.setContextMenu(contextMenu)
  }

  updateStatus(status: AppStatus): void {
    this.currentStatus = status
    this.rebuildMenu()

    // Switch tray icon based on status
    const iconName = status === 'error' || status === 'no-camera'
      ? 'tray-icon-alert.png'
      : 'tray-icon.png'
    const iconPath = join(__dirname, '../assets/icons/', iconName)
    const icon = nativeImage.createFromPath(iconPath)
    const resized = icon.resize({ width: 16, height: 16 })
    resized.setTemplateImage(true)
    this.tray?.setImage(resized)
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
