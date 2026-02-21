import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PostureSettings, CalibrationData } from '@/types/settings'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { AppStatus, PostureStatus } from '@/types/ipc'
import type { ConfigStore } from '@electron/store/config-store'

// Mock ipcMain.handle to capture registered handlers
const handlers = new Map<string, (...args: unknown[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
}))

const mockSyncAutoLaunch = vi.fn()
vi.mock('@electron/auto-launch/auto-launch', () => ({
  syncAutoLaunch: (...args: unknown[]) => mockSyncAutoLaunch(...args),
}))

// Must import after mock setup
import { registerIpcHandlers } from '@electron/ipc/ipc-handlers'
import { IPC_CHANNELS } from '@electron/ipc/ipc-channels'

function createMockConfigStore(): ConfigStore {
  let settings: PostureSettings = { ...DEFAULT_SETTINGS }
  return {
    getSettings: vi.fn(() => settings),
    setSettings: vi.fn((s: PostureSettings) => { settings = s }),
  }
}

describe('registerIpcHandlers', () => {
  let configStore: ConfigStore
  let getAppStatus: ReturnType<typeof vi.fn>
  let setAppStatus: ReturnType<typeof vi.fn>
  let onShowSettings: ReturnType<typeof vi.fn>
  let onPostureStatus: ReturnType<typeof vi.fn>
  let onSettingsChanged: ReturnType<typeof vi.fn>

  beforeEach(() => {
    handlers.clear()
    mockSyncAutoLaunch.mockClear()
    configStore = createMockConfigStore()
    getAppStatus = vi.fn(() => 'detecting' as AppStatus)
    setAppStatus = vi.fn()
    onShowSettings = vi.fn()
    onPostureStatus = vi.fn()
    onSettingsChanged = vi.fn()

    registerIpcHandlers({
      configStore,
      getAppStatus,
      setAppStatus,
      onShowSettings,
      onPostureStatus,
      onSettingsChanged,
    })
  })

  it('should register all expected IPC channels', () => {
    expect(handlers.has(IPC_CHANNELS.SETTINGS_GET)).toBe(true)
    expect(handlers.has(IPC_CHANNELS.SETTINGS_SET)).toBe(true)
    expect(handlers.has(IPC_CHANNELS.STATUS_GET)).toBe(true)
    expect(handlers.has(IPC_CHANNELS.CAMERA_PERMISSION)).toBe(true)
    expect(handlers.has(IPC_CHANNELS.CALIBRATION_START)).toBe(true)
    expect(handlers.has(IPC_CHANNELS.CALIBRATION_COMPLETE)).toBe(true)
    expect(handlers.has(IPC_CHANNELS.WINDOW_SETTINGS_OPEN)).toBe(true)
    expect(handlers.has(IPC_CHANNELS.POSTURE_STATUS)).toBe(true)
  })

  it('SETTINGS_GET should return settings from config store', () => {
    const handler = handlers.get(IPC_CHANNELS.SETTINGS_GET)!
    const result = handler()
    expect(configStore.getSettings).toHaveBeenCalled()
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('SETTINGS_SET should update settings and notify', () => {
    const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!
    const newSettings = { ...DEFAULT_SETTINGS, reminder: { ...DEFAULT_SETTINGS.reminder, blur: false } }
    handler({}, newSettings)
    expect(configStore.setSettings).toHaveBeenCalledWith(newSettings)
    expect(onSettingsChanged).toHaveBeenCalled()
  })

  it('STATUS_GET should return current app status', () => {
    const handler = handlers.get(IPC_CHANNELS.STATUS_GET)!
    const result = handler()
    expect(result).toBe('detecting')
    expect(getAppStatus).toHaveBeenCalled()
  })

  it('CALIBRATION_START should set status to calibrating', () => {
    const handler = handlers.get(IPC_CHANNELS.CALIBRATION_START)!
    handler()
    expect(setAppStatus).toHaveBeenCalledWith('calibrating')
  })

  it('CALIBRATION_COMPLETE should save calibration data and set status to detecting', () => {
    const handler = handlers.get(IPC_CHANNELS.CALIBRATION_COMPLETE)!
    const calibrationData: CalibrationData = {
      headForwardAngle: 10,
      torsoAngle: 5,
      headTiltAngle: 2,
      faceFrameRatio: 0.15,
      shoulderDiff: 1,
      timestamp: Date.now(),
    }
    handler({}, calibrationData)
    expect(configStore.setSettings).toHaveBeenCalled()
    expect(setAppStatus).toHaveBeenCalledWith('detecting')
  })

  it('WINDOW_SETTINGS_OPEN should call onShowSettings', () => {
    const handler = handlers.get(IPC_CHANNELS.WINDOW_SETTINGS_OPEN)!
    handler()
    expect(onShowSettings).toHaveBeenCalled()
  })

  it('POSTURE_STATUS should forward status to callback', () => {
    const handler = handlers.get(IPC_CHANNELS.POSTURE_STATUS)!
    const status: PostureStatus = {
      isGood: false,
      violations: [{ rule: 'FORWARD_HEAD', severity: 0.5, message: 'test' }],
      confidence: 0.9,
      timestamp: Date.now(),
    }
    handler({}, status)
    expect(onPostureStatus).toHaveBeenCalledWith(status)
  })

  it('SETTINGS_SET should sync auto-launch when autoLaunch changes', () => {
    const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!
    const newSettings = {
      ...DEFAULT_SETTINGS,
      display: { ...DEFAULT_SETTINGS.display, autoLaunch: true },
    }
    handler({}, newSettings)
    expect(mockSyncAutoLaunch).toHaveBeenCalledWith(true)
  })

  it('SETTINGS_SET should not sync auto-launch when autoLaunch unchanged', () => {
    const handler = handlers.get(IPC_CHANNELS.SETTINGS_SET)!
    const newSettings = {
      ...DEFAULT_SETTINGS,
      reminder: { ...DEFAULT_SETTINGS.reminder, blur: false },
    }
    handler({}, newSettings)
    expect(mockSyncAutoLaunch).not.toHaveBeenCalled()
  })
})
