import { BrowserWindow, screen } from 'electron'
import { release } from 'os'

export type VibrancyType = 'under-window' | 'fullscreen-ui' | 'hud' | 'sidebar'

export type VibrancySupport = 'modern' | 'legacy' | 'unsupported'

export interface OverlayWindowOptions {
  readonly vibrancyType?: VibrancyType
}

interface DisplayBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Detect macOS version category for vibrancy selection.
 * macOS 26+ (Tahoe) → Darwin 25.x → 'modern'
 * macOS 13-15        → Darwin 22.x-24.x → 'legacy'
 * older / non-macOS  → 'unsupported'
 */
export function detectMacOSVibrancySupport(releaseString?: string): VibrancySupport {
  if (process.platform !== 'darwin') {
    return 'unsupported'
  }

  const darwinMajor = parseDarwinMajorVersion(releaseString ?? release())
  if (darwinMajor === null) {
    return 'unsupported'
  }

  if (darwinMajor >= 25) {
    return 'modern'
  }
  if (darwinMajor >= 22) {
    return 'legacy'
  }
  return 'unsupported'
}

export function parseDarwinMajorVersion(releaseString: string): number | null {
  const match = /^(\d+)\./.exec(releaseString)
  if (!match) {
    return null
  }
  const major = Number(match[1])
  return Number.isFinite(major) ? major : null
}

// NOTE: Electron's built-in vibrancy uses NSVisualEffectView, which provides
// a standard Gaussian blur effect. macOS 26 Tahoe introduced "Liquid Glass"
// (NSGlassEffectView — a private API with refraction/reflection effects),
// but Electron does not expose it. To get true Liquid Glass, the
// `electron-liquid-glass` native module would be needed. Current approach
// uses NSVisualEffectView as a cross-version fallback that works on
// macOS 13+ through 26+. See: https://github.com/Meridius-Labs/electron-liquid-glass
function selectVibrancy(support: 'modern' | 'legacy' | 'unsupported'): VibrancyType | undefined {
  switch (support) {
    case 'modern':
      return 'fullscreen-ui'
    case 'legacy':
      return 'under-window'
    case 'unsupported':
      return undefined
  }
}

function getPrimaryDisplayBounds(): DisplayBounds {
  const { bounds } = screen.getPrimaryDisplay()
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  }
}

export class OverlayWindow {
  private window: BrowserWindow | null = null
  private readonly vibrancyOverride: VibrancyType | undefined

  constructor(options?: OverlayWindowOptions) {
    this.vibrancyOverride = options?.vibrancyType
  }

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      return
    }
    this.createWindow()
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide()
    }
  }

  setOpacity(opacity: number): void {
    if (this.window && !this.window.isDestroyed()) {
      const clamped = Math.max(0, Math.min(1, opacity))
      this.window.setOpacity(clamped)
    }
  }

  getOpacity(): number {
    if (this.window && !this.window.isDestroyed()) {
      return this.window.getOpacity()
    }
    return 0
  }

  isVisible(): boolean {
    return this.window !== null && !this.window.isDestroyed() && this.window.isVisible()
  }

  isCreated(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.removeAllListeners()
      this.window.destroy()
    }
    this.window = null
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  private createWindow(): void {
    const bounds = getPrimaryDisplayBounds()
    const support = detectMacOSVibrancySupport()
    const vibrancy = this.vibrancyOverride ?? selectVibrancy(support)

    this.window = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      transparent: true,
      frame: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: false,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      ...(vibrancy ? { vibrancy, visualEffectState: 'active' } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    // 'screen-saver' level sits above menubar/Dock, ensuring full-screen coverage.
    // Must be set after construction (constructor 'alwaysOnTop' doesn't accept level).
    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.window.setIgnoreMouseEvents(true)

    // Body must have content for vibrancy to render on;
    // a full-viewport element with minimal background ensures
    // NSVisualEffectView has a surface to composite onto.
    const overlayHtml = `data:text/html,<html><body style="margin:0;width:100vw;height:100vh;background:rgba(0,0,0,0.01)"></body></html>`
    this.window.loadURL(overlayHtml)

    this.window.once('ready-to-show', () => {
      this.window?.show()
      // Force position after show — macOS pushes windows into workArea on creation;
      // re-applying display.bounds after show overrides that constraint.
      this.window?.setPosition(bounds.x, bounds.y, false)
      this.window?.setSize(bounds.width, bounds.height, false)
    })

    this.window.on('closed', () => {
      this.window = null
    })
  }
}
