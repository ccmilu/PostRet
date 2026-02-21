import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BlurController } from '@electron/blur/blur-controller'
import type { OverlayWindow } from '@electron/windows/overlay-window'

function createMockOverlayWindow(): OverlayWindow {
  return {
    show: vi.fn(),
    hide: vi.fn(),
    setOpacity: vi.fn(),
    getOpacity: vi.fn().mockReturnValue(1),
    isVisible: vi.fn().mockReturnValue(false),
    isCreated: vi.fn().mockReturnValue(false),
    destroy: vi.fn(),
    getWindow: vi.fn().mockReturnValue(null),
  } as unknown as OverlayWindow
}

describe('BlurController', () => {
  let mockOverlay: OverlayWindow
  let controller: BlurController

  beforeEach(() => {
    vi.useFakeTimers()
    mockOverlay = createMockOverlayWindow()
    controller = new BlurController({ overlayWindow: mockOverlay })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('starts in idle state', () => {
      expect(controller.getState()).toBe('idle')
    })
  })

  describe('activate', () => {
    it('transitions from idle to active', () => {
      controller.activate()
      expect(controller.getState()).toBe('active')
    })

    it('shows the overlay window', () => {
      controller.activate()
      expect(mockOverlay.show).toHaveBeenCalledOnce()
    })

    it('sets opacity to 1 before showing', () => {
      controller.activate()

      const setOpacityCall = (mockOverlay.setOpacity as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
      const showCall = (mockOverlay.show as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]
      expect(setOpacityCall).toBeLessThan(showCall)
      expect(mockOverlay.setOpacity).toHaveBeenCalledWith(1)
    })

    it('does nothing if already active', () => {
      controller.activate()
      vi.mocked(mockOverlay.show).mockClear()
      vi.mocked(mockOverlay.setOpacity).mockClear()

      controller.activate()
      expect(mockOverlay.show).not.toHaveBeenCalled()
      expect(controller.getState()).toBe('active')
    })

    it('cancels ongoing fade and reactivates when called during deactivating', () => {
      controller.activate()
      controller.deactivate()
      expect(controller.getState()).toBe('deactivating')

      vi.mocked(mockOverlay.show).mockClear()
      controller.activate()
      expect(controller.getState()).toBe('active')
      expect(mockOverlay.show).toHaveBeenCalled()
    })
  })

  describe('deactivate', () => {
    it('transitions from active to deactivating', () => {
      controller.activate()
      controller.deactivate()
      expect(controller.getState()).toBe('deactivating')
    })

    it('does nothing if already idle', () => {
      controller.deactivate()
      expect(controller.getState()).toBe('idle')
    })

    it('does nothing if already deactivating', () => {
      controller.activate()
      controller.deactivate()
      expect(controller.getState()).toBe('deactivating')

      // second deactivate should be a no-op
      controller.deactivate()
      expect(controller.getState()).toBe('deactivating')
    })

    it('completes fade and returns to idle after default 1.5s', () => {
      controller.activate()
      controller.deactivate()

      vi.advanceTimersByTime(1500)
      expect(controller.getState()).toBe('idle')
    })

    it('hides the overlay after fade completes', () => {
      controller.activate()
      controller.deactivate()

      vi.advanceTimersByTime(1500)
      expect(mockOverlay.hide).toHaveBeenCalled()
    })

    it('sets opacity to 0 after fade completes', () => {
      controller.activate()
      controller.deactivate()

      vi.advanceTimersByTime(1500)
      expect(mockOverlay.setOpacity).toHaveBeenCalledWith(0)
    })
  })

  describe('fade animation', () => {
    it('decreases opacity progressively over time', () => {
      controller.activate()
      vi.mocked(mockOverlay.setOpacity).mockClear()

      controller.deactivate()

      // After ~33ms (one frame), opacity should decrease
      vi.advanceTimersByTime(33)
      expect(mockOverlay.setOpacity).toHaveBeenCalled()

      const firstOpacity = vi.mocked(mockOverlay.setOpacity).mock.calls[0][0]
      expect(firstOpacity).toBeLessThan(1)
      expect(firstOpacity).toBeGreaterThan(0)
    })

    it('calls setOpacity multiple times during fade', () => {
      controller.activate()
      vi.mocked(mockOverlay.setOpacity).mockClear()

      controller.deactivate()

      // Advance halfway
      vi.advanceTimersByTime(750)
      const callCount = vi.mocked(mockOverlay.setOpacity).mock.calls.length
      expect(callCount).toBeGreaterThan(5)
    })

    it('reaches opacity 0 at the end of fade', () => {
      controller.activate()
      controller.deactivate()

      vi.advanceTimersByTime(1500)

      const allCalls = vi.mocked(mockOverlay.setOpacity).mock.calls
      const lastCall = allCalls[allCalls.length - 1]
      expect(lastCall[0]).toBe(0)
    })
  })

  describe('configurable fade duration', () => {
    it('accepts custom fade duration', () => {
      const customController = new BlurController(
        { overlayWindow: mockOverlay },
        { fadeDurationMs: 3000 }
      )

      customController.activate()
      customController.deactivate()

      // After 1.5s, should still be deactivating with 3s duration
      vi.advanceTimersByTime(1500)
      expect(customController.getState()).toBe('deactivating')

      // After 3s total, should be idle
      vi.advanceTimersByTime(1500)
      expect(customController.getState()).toBe('idle')
    })

    it('clamps fade duration to minimum 500ms', () => {
      const customController = new BlurController(
        { overlayWindow: mockOverlay },
        { fadeDurationMs: 100 }
      )

      customController.activate()
      customController.deactivate()

      // Should complete at 500ms (clamped minimum), not 100ms
      vi.advanceTimersByTime(100)
      expect(customController.getState()).toBe('deactivating')

      vi.advanceTimersByTime(400)
      expect(customController.getState()).toBe('idle')
    })

    it('clamps fade duration to maximum 5000ms', () => {
      const customController = new BlurController(
        { overlayWindow: mockOverlay },
        { fadeDurationMs: 10000 }
      )

      customController.activate()
      customController.deactivate()

      vi.advanceTimersByTime(5000)
      expect(customController.getState()).toBe('idle')
    })
  })

  describe('destroy', () => {
    it('cancels any ongoing fade', () => {
      controller.activate()
      controller.deactivate()
      expect(controller.getState()).toBe('deactivating')

      controller.destroy()
      expect(controller.getState()).toBe('idle')
    })

    it('hides and destroys the overlay window', () => {
      controller.activate()
      controller.destroy()

      expect(mockOverlay.hide).toHaveBeenCalled()
      expect(mockOverlay.destroy).toHaveBeenCalled()
    })

    it('returns to idle state', () => {
      controller.activate()
      controller.destroy()
      expect(controller.getState()).toBe('idle')
    })

    it('is safe to call when already idle', () => {
      expect(() => controller.destroy()).not.toThrow()
      expect(controller.getState()).toBe('idle')
    })
  })

  describe('state machine edge cases', () => {
    it('activate → deactivate → activate cancels fade and reactivates', () => {
      controller.activate()
      controller.deactivate()
      vi.advanceTimersByTime(500) // partially faded

      controller.activate()
      expect(controller.getState()).toBe('active')
      expect(mockOverlay.setOpacity).toHaveBeenCalledWith(1)

      // Advancing time should not cause further fade
      vi.mocked(mockOverlay.hide).mockClear()
      vi.advanceTimersByTime(2000)
      expect(mockOverlay.hide).not.toHaveBeenCalled()
      expect(controller.getState()).toBe('active')
    })

    it('multiple activate/deactivate cycles work correctly', () => {
      // Cycle 1
      controller.activate()
      controller.deactivate()
      vi.advanceTimersByTime(1500)
      expect(controller.getState()).toBe('idle')

      // Cycle 2
      controller.activate()
      expect(controller.getState()).toBe('active')
      controller.deactivate()
      vi.advanceTimersByTime(1500)
      expect(controller.getState()).toBe('idle')
    })
  })
})
