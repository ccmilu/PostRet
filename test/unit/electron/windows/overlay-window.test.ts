import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockRelease, MockBrowserWindow, createMockBrowserWindow } = vi.hoisted(() => {
  const mockRelease = vi.fn().mockReturnValue('25.3.0')

  function createMockBrowserWindow() {
    return {
      show: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
      setOpacity: vi.fn(),
      getOpacity: vi.fn().mockReturnValue(1),
      setIgnoreMouseEvents: vi.fn(),
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

  return { mockRelease, MockBrowserWindow, createMockBrowserWindow }
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
  })

  describe('show', () => {
    it('creates a new BrowserWindow on first show', () => {
      const overlay = new OverlayWindow()
      overlay.show()

      expect(MockBrowserWindow).toHaveBeenCalledOnce()
      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.transparent).toBe(true)
      expect(config.frame).toBe(false)
      expect(config.alwaysOnTop).toBe(true)
      expect(config.skipTaskbar).toBe(true)
      expect(config.hasShadow).toBe(false)
      expect(config.focusable).toBe(false)
      expect(config.resizable).toBe(false)
      expect(config.movable).toBe(false)
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

    it('uses fullscreen-ui vibrancy on modern macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' })
      mockRelease.mockReturnValue('25.3.0')

      const overlay = new OverlayWindow()
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBe('fullscreen-ui')
      expect(config.visualEffectState).toBe('active')
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

    it('uses vibrancy override when provided', () => {
      const overlay = new OverlayWindow({ vibrancyType: 'hud' })
      overlay.show()

      const config = MockBrowserWindow.mock.calls[0][0]
      expect(config.vibrancy).toBe('hud')
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
