import type { OverlayWindow } from '../windows/overlay-window'

export type BlurState = 'idle' | 'active' | 'deactivating'

const DEFAULT_FADE_DURATION_MS = 1500
const MIN_FADE_DURATION_MS = 500
const MAX_FADE_DURATION_MS = 5000
const FADE_FRAME_INTERVAL_MS = 33 // ~30fps

export interface BlurControllerOptions {
  readonly fadeDurationMs?: number
}

export interface BlurControllerDeps {
  readonly overlayWindow: OverlayWindow
}

function clampFadeDuration(ms: number): number {
  return Math.max(MIN_FADE_DURATION_MS, Math.min(MAX_FADE_DURATION_MS, ms))
}

export class BlurController {
  private state: BlurState = 'idle'
  private fadeTimer: ReturnType<typeof setInterval> | null = null
  private readonly overlayWindow: OverlayWindow
  private readonly fadeDurationMs: number

  constructor(deps: BlurControllerDeps, options?: BlurControllerOptions) {
    this.overlayWindow = deps.overlayWindow
    this.fadeDurationMs = clampFadeDuration(
      options?.fadeDurationMs ?? DEFAULT_FADE_DURATION_MS
    )
  }

  getState(): BlurState {
    return this.state
  }

  activate(): void {
    if (this.state === 'active') {
      return
    }

    this.cancelFade()
    this.overlayWindow.setOpacity(1)
    this.overlayWindow.show()
    this.state = 'active'
  }

  deactivate(): void {
    if (this.state === 'idle') {
      return
    }

    if (this.state === 'deactivating') {
      return
    }

    this.state = 'deactivating'
    this.startFade()
  }

  destroy(): void {
    this.cancelFade()
    this.overlayWindow.hide()
    this.overlayWindow.destroy()
    this.state = 'idle'
  }

  private startFade(): void {
    const totalSteps = Math.max(
      1,
      Math.floor(this.fadeDurationMs / FADE_FRAME_INTERVAL_MS)
    )
    const opacityStep = 1 / totalSteps
    let currentStep = 0

    this.fadeTimer = setInterval(() => {
      currentStep += 1
      const newOpacity = Math.max(0, 1 - opacityStep * currentStep)
      this.overlayWindow.setOpacity(newOpacity)

      if (currentStep >= totalSteps) {
        this.completeFade()
      }
    }, FADE_FRAME_INTERVAL_MS)
  }

  private completeFade(): void {
    this.cancelFade()
    this.overlayWindow.setOpacity(0)
    this.overlayWindow.hide()
    this.state = 'idle'
  }

  private cancelFade(): void {
    if (this.fadeTimer !== null) {
      clearInterval(this.fadeTimer)
      this.fadeTimer = null
    }
  }
}
