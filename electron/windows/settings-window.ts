import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { IPC_CHANNELS } from '../ipc/ipc-channels'
import type { AppStatus } from '../../src/types/ipc'

const SETTINGS_WINDOW_WIDTH = 800
const SETTINGS_WINDOW_HEIGHT = 600

export class SettingsWindow {
  private window: BrowserWindow | null = null

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      return
    }
    this.createWindow({ showOnReady: true })
  }

  /**
   * Ensure the renderer process is loaded (for background detection)
   * without showing the window to the user.
   */
  ensureCreated(): void {
    if (this.window && !this.window.isDestroyed()) {
      return
    }
    this.createWindow({ showOnReady: false })
  }

  private createWindow({ showOnReady }: { showOnReady: boolean }): void {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize

    this.window = new BrowserWindow({
      width: SETTINGS_WINDOW_WIDTH,
      height: SETTINGS_WINDOW_HEIGHT,
      x: Math.round((width - SETTINGS_WINDOW_WIDTH) / 2),
      y: Math.round((height - SETTINGS_WINDOW_HEIGHT) / 2),
      show: false,
      resizable: true,
      minimizable: true,
      maximizable: false,
      title: 'PostRet 设置',
      webPreferences: {
        preload: join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    // Load the renderer
    if (process.env.VITE_DEV_SERVER_URL) {
      this.window.loadURL(process.env.VITE_DEV_SERVER_URL)
    } else {
      this.window.loadFile(join(__dirname, '../dist/index.html'))
    }

    if (showOnReady) {
      this.window.once('ready-to-show', () => {
        this.window?.show()
      })
    }

    // Hide instead of close (Tray app behavior)
    this.window.on('close', (e) => {
      e.preventDefault()
      this.window?.hide()
    })

    this.window.on('closed', () => {
      this.window = null
    })
  }

  sendStatusChange(status: AppStatus): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.STATUS_CHANGED, status)
    }
  }

  sendPause(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.APP_PAUSE)
    }
  }

  sendResume(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.APP_RESUME)
    }
  }

  isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible()
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.removeAllListeners('close')
      this.window.destroy()
    }
    this.window = null
  }
}
