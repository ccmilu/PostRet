import { app } from 'electron'
import { TrayManager } from './tray/tray-manager'
import { SettingsWindow } from './windows/settings-window'
import { ConfigStore } from './store/config-store'
import { registerIpcHandlers } from './ipc/ipc-handlers'
import type { AppStatus } from '../src/types/ipc'

const isSingleInstance = app.requestSingleInstanceLock()
if (!isSingleInstance) {
  app.quit()
}

let trayManager: TrayManager | null = null
let settingsWindow: SettingsWindow | null = null
let configStore: ConfigStore | null = null
let appStatus: AppStatus = 'paused'

function getAppStatus(): AppStatus {
  return appStatus
}

function setAppStatus(status: AppStatus): void {
  appStatus = status
  trayManager?.updateStatus(status)
  settingsWindow?.sendStatusChange(status)
}

app.whenReady().then(() => {
  // macOS: hide from Dock, show only in menu bar
  app.dock?.hide()

  configStore = new ConfigStore()

  settingsWindow = new SettingsWindow()

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
  })

  trayManager.updateStatus(appStatus)

  // Expose for E2E testing
  ;(global as Record<string, unknown>).__postret = {
    showSettings: () => settingsWindow?.show(),
    destroyAllWindows: () => settingsWindow?.destroy(),
  }
})

app.on('second-instance', () => {
  settingsWindow?.show()
})

app.on('window-all-closed', () => {
  // Tray app: don't quit when all windows are closed
  // Do nothing — keep the app running
})

app.on('before-quit', () => {
  trayManager?.destroy()
})
