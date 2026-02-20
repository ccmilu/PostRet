import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DEFAULT_SETTINGS, type PostureSettings } from '../../src/types/settings'

// Mock electron-store since we're running in jsdom environment
const mockStore = new Map<string, unknown>()

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        if (opts?.defaults) {
          for (const [key, value] of Object.entries(opts.defaults)) {
            mockStore.set(key, structuredClone(value))
          }
        }
      }
      get(key: string, defaultValue?: unknown) {
        return mockStore.has(key) ? mockStore.get(key) : defaultValue
      }
      set(key: string, value: unknown) {
        mockStore.set(key, structuredClone(value))
      }
      get path() {
        return '/tmp/test-config.json'
      }
      clear() {
        mockStore.clear()
      }
    },
  }
})

import { ConfigStore } from '../../electron/store/config-store'

describe('ConfigStore', () => {
  let store: ConfigStore

  beforeEach(() => {
    mockStore.clear()
    store = new ConfigStore()
  })

  it('should return default settings on first access', () => {
    const settings = store.getSettings()
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('should have correct default detection settings', () => {
    const settings = store.getSettings()
    expect(settings.detection.enabled).toBe(true)
    expect(settings.detection.intervalMs).toBe(500)
    expect(settings.detection.sensitivity).toBe(0.5)
  })

  it('should have correct default rule toggles', () => {
    const { rules } = store.getSettings().detection
    expect(rules.forwardHead).toBe(true)
    expect(rules.slouch).toBe(false) // disabled: front camera cannot reliably detect slouch
    expect(rules.headTilt).toBe(true)
    expect(rules.tooClose).toBe(true)
    expect(rules.shoulderAsymmetry).toBe(true)
  })

  it('should have correct default reminder settings', () => {
    const settings = store.getSettings()
    expect(settings.reminder.blur).toBe(true)
    expect(settings.reminder.sound).toBe(false)
    expect(settings.reminder.notification).toBe(true)
    expect(settings.reminder.delayMs).toBe(5000)
  })

  it('should have no calibration data by default', () => {
    const settings = store.getSettings()
    expect(settings.calibration).toBeNull()
  })

  it('should persist settings after set', () => {
    const modified: PostureSettings = {
      ...DEFAULT_SETTINGS,
      detection: {
        ...DEFAULT_SETTINGS.detection,
        intervalMs: 1000,
        sensitivity: 0.8,
      },
    }
    store.setSettings(modified)

    const retrieved = store.getSettings()
    expect(retrieved.detection.intervalMs).toBe(1000)
    expect(retrieved.detection.sensitivity).toBe(0.8)
  })

  it('should persist calibration data', () => {
    const calibration = {
      headForwardAngle: 5.2,
      torsoAngle: 3.1,
      headTiltAngle: 1.0,
      faceFrameRatio: 0.2,
      shoulderDiff: 0.5,
      timestamp: Date.now(),
    }
    const modified: PostureSettings = {
      ...DEFAULT_SETTINGS,
      calibration,
    }
    store.setSettings(modified)

    const retrieved = store.getSettings()
    expect(retrieved.calibration).toEqual(calibration)
  })

  it('should not mutate original settings object', () => {
    const original = store.getSettings()
    const modified: PostureSettings = {
      ...original,
      detection: { ...original.detection, intervalMs: 2000 },
    }
    store.setSettings(modified)

    // Re-read should give modified value
    const retrieved = store.getSettings()
    expect(retrieved.detection.intervalMs).toBe(2000)
    // Original object unchanged
    expect(original.detection.intervalMs).toBe(500)
  })

  it('should return config file path', () => {
    expect(store.getPath()).toBe('/tmp/test-config.json')
  })

  it('should reset to defaults after clear and re-init', () => {
    store.setSettings({
      ...DEFAULT_SETTINGS,
      detection: { ...DEFAULT_SETTINGS.detection, intervalMs: 2000 },
    })
    store.clear()

    const newStore = new ConfigStore()
    const settings = newStore.getSettings()
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })
})
