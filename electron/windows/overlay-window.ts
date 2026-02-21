import { BrowserWindow, screen } from 'electron'
import { release } from 'os'
import { createRequire } from 'module'
import { join } from 'path'

export type VibrancyType = 'under-window' | 'fullscreen-ui' | 'hud' | 'sidebar'

export type VibrancySupport = 'modern' | 'legacy' | 'unsupported'

export type EffectType = 'liquid-glass' | 'vibrancy' | 'transparent'

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

/**
 * Select vibrancy type for legacy macOS (13-15) or as fallback for modern macOS.
 * - modern (macOS 26+): 'fullscreen-ui' (used as Liquid Glass fallback)
 * - legacy (macOS 13-15): 'under-window'
 * - unsupported: undefined (transparent only)
 */
function selectVibrancyForSupport(support: VibrancySupport): VibrancyType | undefined {
  switch (support) {
    case 'modern':
      return 'fullscreen-ui'
    case 'legacy':
      return 'under-window'
    case 'unsupported':
      return undefined
  }
}

function getPrimaryDisplayWorkArea(): DisplayBounds {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
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
  private effectType: EffectType = 'transparent'

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

  /** Returns the actual blur effect currently in use. */
  getEffectType(): EffectType {
    return this.effectType
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.removeAllListeners()
      this.window.destroy()
    }
    this.window = null
    this.liquidGlassViewId = -1
    this.effectType = 'transparent'
  }

  getWindow(): BrowserWindow | null {
    return this.window
  }

  private createWindow(): void {
    const bounds = getPrimaryDisplayWorkArea()
    const support = detectMacOSVibrancySupport()

    // Three-tier blur strategy:
    // 1. macOS 26+ (no vibrancy override): try Liquid Glass (NSGlassEffectView)
    // 2. Fallback / macOS 13-15 / explicit override: vibrancy (NSVisualEffectView)
    // 3. Unsupported platforms: transparent window (no blur)
    //
    // Liquid Glass and vibrancy must NOT be used simultaneously on the same window.
    const shouldTryLiquidGlass = support === 'modern'
      && !this.disableLiquidGlass
      && this.vibrancyOverride === undefined

    // When trying Liquid Glass, don't set vibrancy in constructor — it will be
    // applied in ready-to-show, with vibrancy as fallback if LG fails.
    const constructorVibrancy = shouldTryLiquidGlass
      ? undefined
      : (this.vibrancyOverride ?? selectVibrancyForSupport(support))

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
      ...(constructorVibrancy ? { vibrancy: constructorVibrancy, visualEffectState: 'active' as const } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    // Track effect type based on constructor vibrancy
    if (constructorVibrancy) {
      this.effectType = 'vibrancy'
    }

    // 'floating' level stays above normal windows but below system notifications
    // and does not cover the menubar/Dock.
    this.window.setAlwaysOnTop(true, 'floating')
    this.window.setIgnoreMouseEvents(true)

    // Body must have content for vibrancy/glass to render on.
    const overlayHtml = `data:text/html,<html><body style="margin:0;width:100vw;height:100vh;background:rgba(0,0,0,0.01)"></body></html>`
    this.window.loadURL(overlayHtml)

    this.window.once('ready-to-show', () => {
      this.window?.show()

      // Apply Liquid Glass after window is shown and positioned
      if (shouldTryLiquidGlass && this.window && !this.window.isDestroyed()) {
        this.applyLiquidGlass(support)
      }
    })

    this.window.on('closed', () => {
      this.window = null
      this.liquidGlassViewId = -1
      this.effectType = 'transparent'
    })
  }

  /**
   * Attempt Liquid Glass (tier 1). On any failure, fall back to vibrancy (tier 2).
   * Catches all exceptions to ensure the overlay window always displays.
   */
  private applyLiquidGlass(support: VibrancySupport): void {
    try {
      const lg = tryLoadLiquidGlass()

      if (!lg) {
        console.warn('[overlay] electron-liquid-glass module not found, falling back to vibrancy')
        this.fallbackToVibrancy(support)
        return
      }

      if (!lg.isGlassSupported()) {
        console.warn('[overlay] Liquid Glass not supported on this system, falling back to vibrancy')
        this.fallbackToVibrancy(support)
        return
      }

      if (!this.window || this.window.isDestroyed()) {
        return
      }

      const handle = this.window.getNativeWindowHandle()
      this.liquidGlassViewId = lg.addView(handle, {
        cornerRadius: 0,
      })
      this.effectType = 'liquid-glass'
    } catch (err) {
      console.warn('[overlay] Liquid Glass failed, falling back to vibrancy:', err)
      this.fallbackToVibrancy(support)
    }
  }

  /** Tier 2 fallback: apply vibrancy (NSVisualEffectView) to the existing window. */
  private fallbackToVibrancy(support: VibrancySupport): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }
    const vibrancy = selectVibrancyForSupport(support)
    if (vibrancy) {
      this.window.setVibrancy(vibrancy)
      this.effectType = 'vibrancy'
    }
    // If no vibrancy available (unsupported), effectType stays 'transparent' (tier 3)
  }
}
