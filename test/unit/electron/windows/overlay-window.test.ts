import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockRelease, MockBrowserWindow, createMockBrowserWindow, mockRequireFn } = vi.hoisted(() => {
  const mockRelease = vi.fn().mockReturnValue('25.3.0')

  // Mock require function returned by createRequire — defaults to throwing (module not found)
  const mockRequireFn = vi.fn().mockImplementation(() => { throw new Error('module not found in test') })

  function createMockBrowserWindow() {
    return {
      show: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
      setOpacity: vi.fn(),
      getOpacity: vi.fn().mockReturnValue(1),
      setAlwaysOnTop: vi.fn(),
      setIgnoreMouseEvents: vi.fn(),
      setPosition: vi.fn(),
      setSize: vi.fn(),
      setBounds: vi.fn(),
      setVibrancy: vi.fn(),
      getNativeWindowHandle: vi.fn().mockReturnValue(Buffer.alloc(8)),
      loadURL: vi.fn().mockResolvedValue(undefined),
      isDestroyed: vi.fn().mockReturnValue(false),
      isVisible: vi.fn().mockReturnValue(false),
      removeAllListeners: vi.fn(),
      once: vi.fn(),
      on: vi.fn(),
    }
  }

  // Must use function() (not arrow) to be usable with `new`
  const MockBrowserWindow = vi.fn().mockImplementation(function () {
    return createMockBrowserWindow()
  })

  return { mockRelease, MockBrowserWindow, createMockBrowserWindow, mockRequireFn }
})

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  screen: {
    getPrimaryDisplay: () => ({
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    }),
  },
}))

vi.mock('os', () => ({
  default: { release: () => mockRelease() },
  release: () => mockRelease(),
}))

// Mock module — createRequire returns mockRequireFn (defaults to throwing, can be overridden per test)
vi.mock('module', () => {
  const createRequire = () => mockRequireFn
  return {
    default: { createRequire },
    createRequire,
  }
})

vi.mock('path', () => {
  const join = (...args: string[]) => args.join('/')
  return {
    default: { join },
    join,
  }
})

import {
  OverlayWindow,
  detectMacOSVibrancySupport,
  parseDarwinMajorVersion,
} from '@electron/windows/overlay-window'

const originalPlatform = process.platform

describe('parseDarwinMajorVersion', () => {
  it('parses standard Darwin release string', () => {
    expect(parseDarwinMajorVersion('25.3.0')).toBe(25)
  })

  it('parses legacy Darwin version', () => {
    expect(parseDarwinMajorVersion('22.1.0')).toBe(22)
  })

  it('returns null for empty string', () => {
    expect(parseDarwinMajorVersion('')).toBe(null)
  })

  it('returns null for non-numeric string', () => {
    expect(parseDarwinMajorVersion('abc.def')).toBe(null)
  })

  it('parses single-digit major version', () => {
    expect(parseDarwinMajorVersion('9.8.0')).toBe(9)
  })
})

describe('detectMacOSVibrancySupport', () => {
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('returns "modern" for macOS 26+ (Darwin 25.x)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(detectMacOSVibrancySupport('25.3.0')).toBe('modern')
  })

  it('returns "legacy" for macOS 13-15 (Darwin 22.x-24.x)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(detectMacOSVibrancySupport('23.1.0')).toBe('legacy')
  })

  it('returns "legacy" for Darwin 22.x (macOS 13)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(detectMacOSVibrancySupport('22.0.0')).toBe('legacy')
  })

  it('returns "unsupported" for older macOS (Darwin < 22)', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(detectMacOSVibrancySupport('21.6.0')).toBe('unsupported')
  })

  it('returns "unsupported" for non-macOS platform', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' })
    expect(detectMacOSVibrancySupport('25.3.0')).toBe('unsupported')
  })

  it('returns "unsupported" for Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })
    expect(detectMacOSVibrancySupport('25.3.0')).toBe('unsupported')
  })

  it('uses os.release() when no releaseString provided', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    mockRelease.mockReturnValue('24.0.0')
    expect(detectMacOSVibrancySupport()).toBe('legacy')
  })
})

describe('OverlayWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockBrowserWindow.mockImplementation(function () { return createMockBrowserWindow() })
    // Default: module not found (most tests don't need LG to load)
    mockRequireFn.mockImplementation(() => { throw new Error('module not found in test') })
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    mockRelease.mockReturnValue('25.3.0')
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  describe('constructor', () => {
    it('creates instance without options', () => {
      const overlay = new OverlayWindow()
      expect(overlay).toBeInstanceOf(OverlayWindow)
    })

    it('creates instance with vibrancy override', () => {
      const overlay = new OverlayWindow({ vibrancyType: 'hud' })
      expect(overlay).toBeInstanceOf(OverlayWindow)
    })

    it('creates instance with disableLiquidGlass', () => {
      const overlay = new OverlayWindow({ disableLiquidGlass: true })
      expect(overlay).toBeInstanceOf(OverlayWindow)
    })
  })

  describe('show', () => {
    it('creates a new BrowserWindow on first show', () => {
      const overlay = new OverlayWindow()
      overlay.show()

      expect(MockBrowserWindow).toHaveBeenCalledOnce()
      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.transparent).toBe(true)
      expect(config.frame).toBe(false)
      expect(config.enableLargerThanScreen).toBe(true)
      expect(config.skipTaskbar).toBe(true)
      expect(config.hasShadow).toBe(false)
      expect(config.focusable).toBe(false)
      expect(config.resizable).toBe(false)
      expect(config.movable).toBe(false)
      // alwaysOnTop with 'screen-saver' level is set via setAlwaysOnTop() after construction
      const mockInstance = MockBrowserWindow.mock.results[0].value
      expect(mockInstance.setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    })

    it('sets window to primary display bounds', () => {
      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.x).toBe(0)
      expect(config.y).toBe(0)
      expect(config.width).toBe(1920)
      expect(config.height).toBe(1080)
    })

    it('calls setIgnoreMouseEvents(true) for click-through', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(mockInstance.setIgnoreMouseEvents).toHaveBeenCalledWith(true)
    })

    it('loads a blank data URL', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(mockInstance.loadURL).toHaveBeenCalledWith(
        expect.stringContaining('data:text/html,')
      )
    })

    it('shows existing window if already created', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      MockBrowserWindow.mockClear()

      overlay.show()
      expect(MockBrowserWindow).not.toHaveBeenCalled()
      expect(mockInstance.show).toHaveBeenCalled()
    })

    it('skips vibrancy on modern macOS (Liquid Glass path)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const overlay = new OverlayWindow()
      overlay.show()

      // On macOS 26+, vibrancy is not set in constructor — Liquid Glass is attempted
      // in the ready-to-show callback, with vibrancy as fallback if LG fails.
      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBeUndefined()
      expect(config.visualEffectState).toBeUndefined()
    })

    it('uses under-window vibrancy on legacy macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('23.1.0')

      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBe('under-window')
      expect(config.visualEffectState).toBe('active')
    })

    it('skips vibrancy on unsupported platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })

      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBeUndefined()
      expect(config.visualEffectState).toBeUndefined()
    })

    it('uses vibrancy override when provided (bypasses Liquid Glass)', () => {
      const overlay = new OverlayWindow({ vibrancyType: 'hud' })
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBe('hud')
      expect(config.visualEffectState).toBe('active')
    })

    it('uses vibrancy when disableLiquidGlass is true on modern macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const overlay = new OverlayWindow({ disableLiquidGlass: true })
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBe('fullscreen-ui')
      expect(config.visualEffectState).toBe('active')
    })

    it('configures secure webPreferences', () => {
      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.webPreferences.contextIsolation).toBe(true)
      expect(config.webPreferences.nodeIntegration).toBe(false)
      expect(config.webPreferences.sandbox).toBe(true)
    })
  })

  describe('hide', () => {
    it('hides the window if created', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      overlay.hide()

      expect(mockInstance.hide).toHaveBeenCalled()
    })

    it('does nothing if window not created', () => {
      const overlay = new OverlayWindow()
      expect(() => overlay.hide()).not.toThrow()
    })
  })

  describe('setOpacity', () => {
    it('sets opacity on the window', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      overlay.setOpacity(0.5)

      expect(mockInstance.setOpacity).toHaveBeenCalledWith(0.5)
    })

    it('clamps opacity below 0 to 0', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      overlay.setOpacity(-0.5)

      expect(mockInstance.setOpacity).toHaveBeenCalledWith(0)
    })

    it('clamps opacity above 1 to 1', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      overlay.setOpacity(1.5)

      expect(mockInstance.setOpacity).toHaveBeenCalledWith(1)
    })

    it('does nothing if window not created', () => {
      const overlay = new OverlayWindow()
      expect(() => overlay.setOpacity(0.5)).not.toThrow()
    })
  })

  describe('getOpacity', () => {
    it('returns opacity from the window', () => {
      const mockInstance = createMockBrowserWindow()
      mockInstance.getOpacity.mockReturnValue(0.7)
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(overlay.getOpacity()).toBe(0.7)
    })

    it('returns 0 if window not created', () => {
      const overlay = new OverlayWindow()
      expect(overlay.getOpacity()).toBe(0)
    })
  })

  describe('isVisible', () => {
    it('returns true when window is visible', () => {
      const mockInstance = createMockBrowserWindow()
      mockInstance.isVisible.mockReturnValue(true)
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(overlay.isVisible()).toBe(true)
    })

    it('returns false when window is not created', () => {
      const overlay = new OverlayWindow()
      expect(overlay.isVisible()).toBe(false)
    })

    it('returns false when window is destroyed', () => {
      const mockInstance = createMockBrowserWindow()
      mockInstance.isDestroyed.mockReturnValue(true)
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(overlay.isVisible()).toBe(false)
    })
  })

  describe('isCreated', () => {
    it('returns true when window exists and not destroyed', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(overlay.isCreated()).toBe(true)
    })

    it('returns false before window is created', () => {
      const overlay = new OverlayWindow()
      expect(overlay.isCreated()).toBe(false)
    })
  })

  describe('getEffectType', () => {
    it('returns "transparent" before window is created', () => {
      const overlay = new OverlayWindow()
      expect(overlay.getEffectType()).toBe('transparent')
    })

    it('returns "vibrancy" on legacy macOS after show', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('23.1.0')

      const overlay = new OverlayWindow()
      overlay.show()

      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('returns "vibrancy" when vibrancy override is provided', () => {
      const overlay = new OverlayWindow({ vibrancyType: 'hud' })
      overlay.show()

      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('returns "vibrancy" when disableLiquidGlass is true on modern macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const overlay = new OverlayWindow({ disableLiquidGlass: true })
      overlay.show()

      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('returns "transparent" on unsupported platforms after show', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(overlay.getEffectType()).toBe('transparent')
    })

    it('resets to "transparent" after destroy', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('23.1.0')

      const overlay = new OverlayWindow()
      overlay.show()
      expect(overlay.getEffectType()).toBe('vibrancy')

      overlay.destroy()
      expect(overlay.getEffectType()).toBe('transparent')
    })

    it('resets to "transparent" when closed event fires', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('23.1.0')

      const mockInstance = createMockBrowserWindow()
      let closedCallback: (() => void) | undefined
      mockInstance.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'closed') {
          closedCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      expect(overlay.getEffectType()).toBe('vibrancy')

      closedCallback!()
      expect(overlay.getEffectType()).toBe('transparent')
    })
  })

  describe('three-tier degradation', () => {
    it('tier 1: attempts Liquid Glass on modern macOS (no vibrancy in constructor)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      // Vibrancy not set — Liquid Glass is attempted in ready-to-show
      expect(config.vibrancy).toBeUndefined()
      // In test env, LG module is not loadable, so effectType is still 'transparent'
      // (ready-to-show callback hasn't fired — it's registered with once())
      expect(overlay.getEffectType()).toBe('transparent')
    })

    it('tier 1→2: falls back to vibrancy when Liquid Glass module unavailable', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const mockInstance = createMockBrowserWindow()
      let readyCallback: (() => void) | undefined
      mockInstance.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'ready-to-show') {
          readyCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      // Simulate ready-to-show firing — LG module will fail, triggering fallback
      readyCallback!()

      // Should have fallen back to vibrancy
      expect(mockInstance.setVibrancy).toHaveBeenCalledWith('fullscreen-ui')
      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('tier 1→2: falls back to vibrancy when isGlassSupported() returns false', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      // Module loads successfully but reports glass as unsupported
      mockRequireFn.mockReturnValue({
        default: {
          isGlassSupported: () => false,
          addView: vi.fn(),
        },
      })

      const mockInstance = createMockBrowserWindow()
      let readyCallback: (() => void) | undefined
      mockInstance.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'ready-to-show') {
          readyCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      readyCallback!()

      expect(mockInstance.setVibrancy).toHaveBeenCalledWith('fullscreen-ui')
      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('tier 1: succeeds with Liquid Glass when module loads and glass is supported', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      // Module loads successfully and glass is supported
      mockRequireFn.mockReturnValue({
        default: {
          isGlassSupported: () => true,
          addView: vi.fn().mockReturnValue(42),
        },
      })

      const mockInstance = createMockBrowserWindow()
      let readyCallback: (() => void) | undefined
      mockInstance.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'ready-to-show') {
          readyCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      readyCallback!()

      // Liquid Glass succeeded — no vibrancy fallback
      expect(mockInstance.setVibrancy).not.toHaveBeenCalled()
      expect(overlay.getEffectType()).toBe('liquid-glass')
    })

    it('tier 2: uses vibrancy directly on legacy macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('23.1.0')

      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBe('under-window')
      expect(config.visualEffectState).toBe('active')
      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('tier 3: transparent window on unsupported platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' })

      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBeUndefined()
      expect(overlay.getEffectType()).toBe('transparent')
    })

    it('tier 3: transparent window on old macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('21.0.0')

      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBeUndefined()
      expect(overlay.getEffectType()).toBe('transparent')
    })

    it('does not crash if Liquid Glass throws during addView', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const mockInstance = createMockBrowserWindow()
      // Simulate getNativeWindowHandle throwing
      mockInstance.getNativeWindowHandle.mockImplementation(() => {
        throw new Error('handle unavailable')
      })
      let readyCallback: (() => void) | undefined
      mockInstance.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'ready-to-show') {
          readyCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      // Even if LG load fails and getNativeWindowHandle throws,
      // the window should still be usable with vibrancy fallback
      expect(() => readyCallback!()).not.toThrow()
      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('does not crash if addView throws after successful module load', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      // Module loads, glass supported, but addView throws
      mockRequireFn.mockReturnValue({
        default: {
          isGlassSupported: () => true,
          addView: () => { throw new Error('native addon crash') },
        },
      })

      const mockInstance = createMockBrowserWindow()
      let readyCallback: (() => void) | undefined
      mockInstance.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'ready-to-show') {
          readyCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(() => readyCallback!()).not.toThrow()
      // Falls back to vibrancy after addView throws
      expect(mockInstance.setVibrancy).toHaveBeenCalledWith('fullscreen-ui')
      expect(overlay.getEffectType()).toBe('vibrancy')
    })

    it('overlay window always shows regardless of effect failures', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const mockInstance = createMockBrowserWindow()
      let readyCallback: (() => void) | undefined
      mockInstance.once.mockImplementation((event: string, cb: () => void) => {
        if (event === 'ready-to-show') {
          readyCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      readyCallback!()

      // Window was shown despite LG failure
      expect(mockInstance.show).toHaveBeenCalled()
      expect(overlay.isCreated()).toBe(true)
    })
  })

  describe('destroy', () => {
    it('destroys the window and cleans up listeners', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      overlay.destroy()

      expect(mockInstance.removeAllListeners).toHaveBeenCalled()
      expect(mockInstance.destroy).toHaveBeenCalled()
    })

    it('sets window to null after destroy', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()
      overlay.destroy()

      expect(overlay.isCreated()).toBe(false)
      expect(overlay.getWindow()).toBe(null)
    })

    it('does nothing if window not created', () => {
      const overlay = new OverlayWindow()
      expect(() => overlay.destroy()).not.toThrow()
    })
  })

  describe('getWindow', () => {
    it('returns the BrowserWindow instance', () => {
      const mockInstance = createMockBrowserWindow()
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(overlay.getWindow()).toBe(mockInstance)
    })

    it('returns null when no window exists', () => {
      const overlay = new OverlayWindow()
      expect(overlay.getWindow()).toBe(null)
    })
  })

  describe('closed event handler', () => {
    it('nullifies window reference when closed event fires', () => {
      const mockInstance = createMockBrowserWindow()
      let closedCallback: (() => void) | undefined
      mockInstance.on.mockImplementation((event: string, cb: () => void) => {
        if (event === 'closed') {
          closedCallback = cb
        }
      })
      MockBrowserWindow.mockImplementation(function () { return mockInstance })

      const overlay = new OverlayWindow()
      overlay.show()

      expect(closedCallback).toBeDefined()
      closedCallback!()

      expect(overlay.getWindow()).toBe(null)
    })
  })
})
