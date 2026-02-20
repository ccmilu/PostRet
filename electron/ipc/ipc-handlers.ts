import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './ipc-channels'
import { handleCameraPermission } from '../permissions/camera-permission'
import type { ConfigStore } from '../store/config-store'
import type { AppStatus } from '../../src/types/ipc'
import type { CalibrationData, PostureSettings } from '../../src/types/settings'

interface IpcHandlerDeps {
  configStore: ConfigStore
  getAppStatus: () => AppStatus
  setAppStatus: (status: AppStatus) => void
  onShowSettings?: () => void
}

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const { configStore, getAppStatus, setAppStatus } = deps

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => {
    return configStore.getSettings()
  })

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_event, settings: PostureSettings) => {
    configStore.setSettings(settings)
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
}
