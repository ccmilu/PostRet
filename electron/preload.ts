import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from './ipc/ipc-channels'
import type { IpcApi } from '../src/types/ipc'
import type { CalibrationData, PostureSettings } from '../src/types/settings'

const api: IpcApi = {
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  setSettings: (settings: PostureSettings) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, settings),

  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.STATUS_GET),

  requestCameraPermission: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CAMERA_PERMISSION),

  startCalibration: () =>
    ipcRenderer.invoke(IPC_CHANNELS.CALIBRATION_START),

  completeCalibration: (data: CalibrationData) =>
    ipcRenderer.invoke(IPC_CHANNELS.CALIBRATION_COMPLETE, data),

  onStatusChange: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string) =>
      callback(status as Parameters<typeof callback>[0])
    ipcRenderer.on(IPC_CHANNELS.STATUS_CHANGED, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.STATUS_CHANGED, listener)
    }
  },

  onPause: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(IPC_CHANNELS.APP_PAUSE, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.APP_PAUSE, listener)
    }
  },

  onResume: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(IPC_CHANNELS.APP_RESUME, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.APP_RESUME, listener)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)
