import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './ipc-channels'
import { handleCameraPermission } from '../permissions/camera-permission'
import { syncAutoLaunch } from '../auto-launch/auto-launch'
import type { ConfigStore } from '../store/config-store'
import type { AppStatus, PostureStatus } from '../../src/types/ipc'
import type { CalibrationData, PostureSettings } from '../../src/types/settings'

interface IpcHandlerDeps {
  configStore: ConfigStore
  getAppStatus: () => AppStatus
  setAppStatus: (status: AppStatus) => void
  onShowSettings?: () => void
  onPostureStatus?: (status: PostureStatus) => void
  onSettingsChanged?: () => void
}

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { configStore, getAppStatus, setAppStatus } = deps

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return configStore.getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings: PostureSettings) => {
    const previous = configStore.getSettings()
    configStore.setSettings(settings)

    if (settings.display.autoLaunch !== previous.display.autoLaunch) {
      syncAutoLaunch(settings.display.autoLaunch)
    }

    deps.onSettingsChanged?.()
  })

  ipcMain.handle(IPC_CHANNELS.STATUS_GET, () => {
    return getAppStatus()
  })

  ipcMain.handle(IPC_CHANNELS.CAMERA_PERMISSION, async () => {
    return handleCameraPermission()
  })

  ipcMain.handle(IPC_CHANNELS.CALIBRATION_START, () => {
    setAppStatus('calibrating')
  })

  ipcMain.handle(IPC_CHANNELS.CALIBRATION_COMPLETE, (_event, data: CalibrationData) => {
    const settings = configStore.getSettings()
    configStore.setSettings({ ...settings, calibration: data })
    setAppStatus('detecting')
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_SETTINGS_OPEN, () => {
    deps.onShowSettings?.()
  })

  ipcMain.handle(IPC_CHANNELS.POSTURE_STATUS, (_event, status: PostureStatus) => {
    // Auto-sync appStatus when renderer starts reporting posture
    if (getAppStatus() !== 'detecting') {
      setAppStatus('detecting')
    }
    deps.onPostureStatus?.(status)
  })
}
