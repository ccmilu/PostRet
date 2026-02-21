/**
 * Cross-test for auto-launch module.
 * Focus: integration with IPC handlers, settings roundtrip,
 * idempotency, and edge cases.
 * Written by impl-settings-schedule as cross-tester for impl-camera-autolaunch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostureSettings } from '@/types/settings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { AppStatus } from '@/types/ipc'
import type { ConfigStore } from '@electron/store/config-store'

// Mock ipcMain to capture handlers
const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
  app: {
    setLoginItemSettings: vi.fn(),
    getLoginItemSettings: vi.fn().mockReturnValue({ openAtLogin: false }),
    isPackaged: true,
  },
}))

import { app } from 'electron'
import { registerIpcHandlers } from '@electron/ipc/ipc-handlers'
import { IPC_CHANNELS } from '@electron/ipc/ipc-channels'

function createMockConfigStore(initialSettings?: Partial<PostureSettings>): ConfigStore {
  let settings: PostureSettings = { ...DEFAULT_SETTINGS, ...initialSettings }
  return {
    getSettings: vi.fn(() => settings),
    setSettings: vi.fn((s: PostureSettings) => { settings = s }),
  }
}

describe('auto-launch integration cross-tests', () => {
  let configStore: ConfigStore
  let onSettingsChanged: ReturnType<typeof vi.fn>

  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    onSettingsChanged = vi.fn()
  })

  function setupIpc(storeOverrides?: Partial<PostureSettings>): void {
    configStore = createMockConfigStore(storeOverrides)
    registerIpcHandlers({
      configStore,
      getAppStatus: () => 'detecting' as AppStatus,
      setAppStatus: vi.fn(),
      onSettingsChanged,
    })
  }

  describe('autoLaunch change detection', () => {
    it('should call syncAutoLaunch(true) when autoLaunch changes from false to true', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: true },
      }
      handler({}, newSettings)

      expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
    })

    it('should call syncAutoLaunch(false) when autoLaunch changes from true to false', () => {
      setupIpc({
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: true },
      })
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: false },
      }
      handler({}, newSettings)

      expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false })
    })

    it('should NOT call syncAutoLaunch when autoLaunch value is unchanged', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      // Change other settings but keep autoLaunch the same (false → false)
      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        reminder: { ...DEFAULT_SETTINGS.reminder, blur: false },
      }
      handler({}, newSettings)

      expect(app.setLoginItemSettings).not.toHaveBeenCalled()
    })
  })

  describe('settings persistence and autoLaunch', () => {
    it('should persist settings before syncing auto-launch', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      const callOrder: string[] = []
      ;(configStore.setSettings as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callOrder.push('setSettings')
      })
      ;(app.setLoginItemSettings as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callOrder.push('syncAutoLaunch')
      })

      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: true },
      }
      handler({}, newSettings)

      expect(callOrder).toEqual(['setSettings', 'syncAutoLaunch'])
    })

    it('should still call onSettingsChanged when autoLaunch changes', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: true },
      }
      handler({}, newSettings)

      expect(onSettingsChanged).toHaveBeenCalledOnce()
    })
  })

  describe('concurrent settings updates', () => {
    it('should handle multiple rapid settings updates with autoLaunch toggle', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      // Rapidly toggle autoLaunch on/off/on
      handler({}, {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: true },
      })
      handler({}, {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: false },
      })
      handler({}, {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, autoLaunch: true },
      })

      // Should have been called 3 times with alternating values
      expect(app.setLoginItemSettings).toHaveBeenCalledTimes(3)
      expect((app.setLoginItemSettings as ReturnType<typeof vi.fn>).mock.calls[0][0]).toEqual({ openAtLogin: true })
      expect((app.setLoginItemSettings as ReturnType<typeof vi.fn>).mock.calls[1][0]).toEqual({ openAtLogin: false })
      expect((app.setLoginItemSettings as ReturnType<typeof vi.fn>).mock.calls[2][0]).toEqual({ openAtLogin: true })
    })
  })

  describe('settings roundtrip with other display fields', () => {
    it('should not trigger autoLaunch sync when only selectedCamera changes', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        display: { ...DEFAULT_SETTINGS.display, selectedCamera: 'new-cam' },
      }
      handler({}, newSettings)

      expect(app.setLoginItemSettings).not.toHaveBeenCalled()
    })

    it('should not trigger autoLaunch sync when only ignorePeriods changes', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        display: {
          ...DEFAULT_SETTINGS.display,
          ignorePeriods: [{ start: '12:00', end: '13:00' }],
        },
      }
      handler({}, newSettings)

      expect(app.setLoginItemSettings).not.toHaveBeenCalled()
    })

    it('should trigger autoLaunch sync even when multiple display fields change simultaneously', () => {
      setupIpc()
      const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!

      const newSettings: PostureSettings = {
        ...DEFAULT_SETTINGS,
        display: {
          ...DEFAULT_SETTINGS.display,
          autoLaunch: true,
          selectedCamera: 'new-cam',
          weekendIgnore: true,
        },
      }
      handler({}, newSettings)

      expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
    })
  })
})
