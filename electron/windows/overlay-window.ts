import { BrowserWindow, screen } from 'electron'
import { release } from 'os'
import { createRequire } from 'module'
import { join } from 'path'

export type VibrancyType = 'under-window' | 'fullscreen-ui' | 'hud' | 'sidebar'

export type VibrancySupport = 'modern' | 'legacy' | 'unsupported'

export interface OverlayWindowOptions {
  readonly vibrancyType?: VibrancyType
  readonly disableLiquidGlass?: boolean
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

// macOS 13-15 fallback: Electron built-in vibrancy (NSVisualEffectView)
function selectLegacyVibrancy(support: VibrancySupport): VibrancyType | undefined {
  if (support === 'legacy') {
    return 'under-window'
  }
  return undefined
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

/**
 * Try to load electron-liquid-glass. Returns null if unavailable.
 * Lazy-loaded to avoid hard dependency on the native module.
 */
function tryLoadLiquidGlass(): {
  addView: (handle: Buffer, options?: { cornerRadius?: number; tintColor?: string; opaque?: boolean }) => number
  isGlassSupported: () => boolean
} | null {
  try {
    // Native modules can't be bundled by Vite — resolve from project root's node_modules.
    // createRequire anchors module resolution to the project directory so that
    // require('electron-liquid-glass') finds ./node_modules/electron-liquid-glass
    // even when running from dist-electron/.
    const appRequire = createRequire(join(process.cwd(), 'package.json'))
    const mod = appRequire('electron-liquid-glass')
    return mod.default ?? mod
  } catch {
    return null
  }
}

export class OverlayWindow {
  private window: BrowserWindow | null = null
  private readonly vibrancyOverride: VibrancyType | undefined
  private readonly disableLiquidGlass: boolean
  private liquidGlassViewId: number = -1

  constructor(options?: OverlayWindowOptions) {
    this.vibrancyOverride = options?.vibrancyType
    this.disableLiquidGlass = options?.disableLiquidGlass ?? false
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
    this.liquidGlassViewId = -1
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  private createWindow(): void {
    const bounds = getPrimaryDisplayBounds()
    const support = detectMacOSVibrancySupport()

    // Determine blur strategy:
    // - macOS 26+ (no override): try Liquid Glass (NSGlassEffectView), fall back to vibrancy
    // - macOS 13-15 or explicit override: use built-in vibrancy (NSVisualEffectView)
    // - Liquid Glass and vibrancy must NOT be used simultaneously
    const useLiquidGlass = support === 'modern'
      && !this.disableLiquidGlass
      && this.vibrancyOverride === undefined
    const vibrancy = useLiquidGlass
      ? undefined
      : (this.vibrancyOverride ?? selectLegacyVibrancy(support))

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
    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.window.setIgnoreMouseEvents(true)

    // Body must have content for vibrancy/glass to render on.
    const overlayHtml = `data:text/html,<html><body style="margin:0;width:100vw;height:100vh;background:rgba(0,0,0,0.01)"></body></html>`
    this.window.loadURL(overlayHtml)

    this.window.once('ready-to-show', () => {
      this.window?.show()
      // Force position after show — macOS pushes windows into workArea;
      // re-applying display.bounds overrides that constraint.
      this.window?.setPosition(bounds.x, bounds.y, false)
      this.window?.setSize(bounds.width, bounds.height, false)

      // Apply Liquid Glass after window is shown and positioned
      if (useLiquidGlass && this.window && !this.window.isDestroyed()) {
        this.applyLiquidGlass()
      }
    })

    this.window.on('closed', () => {
      this.window = null
      this.liquidGlassViewId = -1
    })
  }

  private applyLiquidGlass(): void {
    const lg = tryLoadLiquidGlass()
    if (!lg || !lg.isGlassSupported() || !this.window) {
      // Liquid Glass unavailable — fall back to vibrancy on this window
      this.window?.setVibrancy('fullscreen-ui')
      return
    }

    try {
      const handle = this.window.getNativeWindowHandle()
      this.liquidGlassViewId = lg.addView(handle, {
        cornerRadius: 0,
      })
    } catch (err) {
      // Native module failed — fall back to vibrancy
      console.error('Liquid Glass failed, falling back to vibrancy:', err)
      this.window?.setVibrancy('fullscreen-ui')
    }
  }
}
