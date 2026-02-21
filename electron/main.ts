import { app, Notification } from 'electron'
import { exec } from 'child_process'
import { TrayManager } from './tray/tray-manager'
import { SettingsWindow } from './windows/settings-window'
import { OverlayWindow } from './windows/overlay-window'
import { BlurController } from './blur/blur-controller'
import { ConfigStore } from './store/config-store'
import { registerIpcHandlers } from './ipc/ipc-handlers'
import { ReminderManager } from '../src/services/reminder/reminder-manager'
import { createNotificationSender } from '../src/services/reminder/notification-sender'
import { createSoundPlayer } from '../src/services/reminder/sound-player'
import type { AppStatus } from '../src/types/ipc'
import type { ReminderConfig } from '../src/services/reminder/reminder-types'

const isSingleInstance = app.requestSingleInstanceLock()
if (!isSingleInstance) {
  app.quit()
}

let trayManager: TrayManager | null = null
let settingsWindow: SettingsWindow | null = null
let configStore: ConfigStore | null = null
let overlayWindow: OverlayWindow | null = null
let blurController: BlurController | null = null
let reminderManager: ReminderManager | null = null
let appStatus: AppStatus = 'paused'
let isQuitting = false

function getAppStatus(): AppStatus {
  return appStatus
}

function setAppStatus(status: AppStatus): void {
  appStatus = status
  trayManager?.updateStatus(status)
  settingsWindow?.sendStatusChange(status)
}

function buildReminderConfig(store: ConfigStore): ReminderConfig {
  const settings = store.getSettings()
  return {
    blur: settings.reminder.blur,
    notification: settings.reminder.notification,
    sound: settings.reminder.sound,
    delayMs: settings.reminder.delayMs,
    fadeOutDurationMs: settings.reminder.fadeOutDurationMs,
  }
}

app.whenReady().then(() => {
  // macOS: hide from Dock, show only in menu bar
  app.dock?.hide()

  configStore = new ConfigStore()

  settingsWindow = new SettingsWindow()

  // Phase 1.5: Blur overlay
  overlayWindow = new OverlayWindow()
  blurController = new BlurController({ overlayWindow })

  // Phase 1.5: Notification and sound
  const notificationSender = createNotificationSender({
    createNotification: (opts) => new Notification(opts),
  })

  const soundPlayer = createSoundPlayer({ exec })

  // Phase 1.5: Reminder manager
  reminderManager = new ReminderManager(buildReminderConfig(configStore), {
    onBlurActivate: () => blurController?.activate(),
    onBlurDeactivate: () => blurController?.deactivate(),
    onNotify: (violations) => notificationSender.send(violations),
    onSound: () => soundPlayer.playAlertSound(),
  })

  trayManager = new TrayManager({
    onShowSettings: () => settingsWindow?.show(),
    onStartCalibration: () => {
      setAppStatus('calibrating')
      settingsWindow?.show()
    },
    onPauseResume: () => {
      if (appStatus === 'detecting') {
        setAppStatus('paused')
        settingsWindow?.sendPause()
      } else if (appStatus === 'paused') {
        setAppStatus('detecting')
        settingsWindow?.sendResume()
      }
    },
    onQuit: () => app.quit(),
  })

  registerIpcHandlers({
    configStore,
    getAppStatus,
    setAppStatus,
    onShowSettings: () => settingsWindow?.show(),
    onPostureStatus: (status) => reminderManager?.onPostureUpdate(status),
    onSettingsChanged: () => {
      if (configStore && reminderManager) {
        reminderManager.updateConfig(buildReminderConfig(configStore))
      }
    },
  })

  trayManager.updateStatus(appStatus)

  // Expose for E2E testing
  ;(global as Record<string, unknown>).__postret = {
    showSettings: () => settingsWindow?.show(),
    destroyAllWindows: () => {
      settingsWindow?.destroy()
      overlayWindow?.destroy()
    },
    // Phase 1.5: blur & reminder test hooks
    activateBlur: () => blurController?.activate(),
    deactivateBlur: () => blurController?.deactivate(),
    getBlurState: () => blurController?.getState(),
    isOverlayVisible: () => overlayWindow?.isVisible(),
    getOverlayOpacity: () => overlayWindow?.getOpacity(),
    triggerNotification: () => {
      const sender = createNotificationSender({
        createNotification: (opts) => new Notification(opts),
        minIntervalMs: 0,
      })
      sender.send([{ rule: 'FORWARD_HEAD' as const, severity: 0.8, message: '头部前倾' }])
    },
    triggerSound: () => {
      exec('afplay /System/Library/Sounds/Tink.aiff', (err) => {
        if (err) console.error('Sound test failed:', err.message)
      })
    },
    // Reminder manager test hooks
    getReminderState: () => reminderManager?.getState(),
    simulateBadPosture: () => {
      reminderManager?.onPostureUpdate({
        isGood: false,
        violations: [{ rule: 'FORWARD_HEAD' as const, severity: 0.8, message: '头部前倾' }],
        confidence: 0.9,
        timestamp: Date.now(),
      })
    },
    simulateGoodPosture: () => {
      reminderManager?.onPostureUpdate({
        isGood: true,
        violations: [],
        confidence: 0.9,
        timestamp: Date.now(),
      })
    },
  }
})

app.on('second-instance', () => {
  settingsWindow?.show()
})

app.on('window-all-closed', () => {
  // Tray app: don't quit when all windows are closed
  // Do nothing — keep the app running
})

app.on('before-quit', (e) => {
  if (isQuitting) {
    return
  }
  isQuitting = true
  e.preventDefault()

  reminderManager?.dispose()
  blurController?.destroy()
  trayManager?.destroy()

  // Release camera directly in renderer before destroying windows
  const win = settingsWindow?.getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents
      .executeJavaScript(
        `document.querySelectorAll('video').forEach(v => {
          const s = v.srcObject;
          if (s && s.getTracks) s.getTracks().forEach(t => t.stop());
          v.srcObject = null;
        }); true`
      )
      .catch(() => {})
      .finally(() => {
        settingsWindow?.destroy()
        overlayWindow?.destroy()
        app.exit(0)
      })
  } else {
    settingsWindow?.destroy()
    overlayWindow?.destroy()
    app.exit(0)
  }
})
