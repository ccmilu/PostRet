import type { IpcApi } from './ipc'

declare global {
  interface Window {
    electronAPI: IpcApi
  }
}
