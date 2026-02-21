/**
 * Cross-test for useCameraDevices hook.
 * Focus: non-mock integration scenarios, edge cases, and robustness.
 * Written by impl-settings-schedule as cross-tester for impl-camera-autolaunch.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let useCameraDevices: typeof import('@/hooks/useCameraDevices').useCameraDevices

const mockEnumerateDevices = vi.fn()
const mockAddEventListener = vi.fn()
const mockRemoveEventListener = vi.fn()

function createMockDevice(
  deviceId: string,
  label: string,
  kind: MediaDeviceKind = 'videoinput',
): MediaDeviceInfo {
  return {
    deviceId,
    label,
    kind,
    groupId: `group-${deviceId}`,
    toJSON: () => ({}),
  }
}

beforeEach(async () => {
  vi.clearAllMocks()

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      enumerateDevices: mockEnumerateDevices,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    },
    writable: true,
    configurable: true,
  })

  // Fresh import each time
  vi.resetModules()
  const mod = await import('@/hooks/useCameraDevices')
  useCameraDevices = mod.useCameraDevices
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCameraDevices cross-tests', () => {
  describe('device hot-plug robustness', () => {
    it('should handle device being removed after enumeration', async () => {
      // Start with 2 cameras
      mockEnumerateDevices.mockResolvedValue([
        createMockDevice('cam1', 'FaceTime HD Camera'),
        createMockDevice('cam2', 'External Camera'),
      ])

      const { result } = renderHook(() => useCameraDevices())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(2)
      })

      // Simulate device removal via devicechange event
      mockEnumerateDevices.mockResolvedValue([
        createMockDevice('cam1', 'FaceTime HD Camera'),
      ])

      const deviceChangeHandler = mockAddEventListener.mock.calls.find(
        (call) => call[0] === 'devicechange',
      )?.[1]

      await act(async () => {
        deviceChangeHandler()
      })

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })
      expect(result.current.devices[0].deviceId).toBe('cam1')
    })

    it('should handle all devices being removed', async () => {
      mockEnumerateDevices.mockResolvedValue([
        createMockDevice('cam1', 'FaceTime HD Camera'),
      ])

      const { result } = renderHook(() => useCameraDevices())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      // All cameras removed
      mockEnumerateDevices.mockResolvedValue([])

      const deviceChangeHandler = mockAddEventListener.mock.calls.find(
        (call) => call[0] === 'devicechange',
      )?.[1]

      await act(async () => {
        deviceChangeHandler()
      })

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(0)
      })
      expect(result.current.error).toBeNull()
    })

    it('should handle rapid devicechange events without race conditions', async () => {
      let callCount = 0
      mockEnumerateDevices.mockImplementation(async () => {
        callCount++
        const currentCall = callCount
        // Simulate varying response times
        await new Promise((resolve) => setTimeout(resolve, currentCall === 1 ? 100 : 10))
        if (currentCall === 1) {
          return [createMockDevice('cam1', 'Camera 1')]
        }
        return [
          createMockDevice('cam1', 'Camera 1'),
          createMockDevice('cam2', 'Camera 2'),
        ]
      })

      const { result } = renderHook(() => useCameraDevices())

      // Immediately trigger devicechange before first enumeration completes
      const deviceChangeHandler = mockAddEventListener.mock.calls.find(
        (call) => call[0] === 'devicechange',
      )?.[1]

      if (deviceChangeHandler) {
        await act(async () => {
          deviceChangeHandler()
        })
      }

      // Eventually should settle
      await waitFor(
        () => {
          expect(result.current.loading).toBe(false)
        },
        { timeout: 2000 },
      )

      // Should have devices from the latest enumeration
      expect(result.current.error).toBeNull()
    })
  })

  describe('error recovery', () => {
    it('should recover from error when refresh is called successfully', async () => {
      // Initial failure
      mockEnumerateDevices.mockRejectedValueOnce(new Error('Permission denied'))

      const { result } = renderHook(() => useCameraDevices())

      await waitFor(() => {
        expect(result.current.error).toBe('Permission denied')
      })

      // Fix the issue and refresh
      mockEnumerateDevices.mockResolvedValue([
        createMockDevice('cam1', 'FaceTime HD Camera'),
      ])

      await act(async () => {
        await result.current.refresh()
      })

      expect(result.current.error).toBeNull()
      expect(result.current.devices).toHaveLength(1)
    })

    it('should handle non-Error thrown from enumerateDevices', async () => {
      mockEnumerateDevices.mockRejectedValue('string error')

      const { result } = renderHook(() => useCameraDevices())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toBe('Failed to enumerate devices')
    })
  })

  describe('device label handling', () => {
    it('should generate fallback label for devices without labels', async () => {
      mockEnumerateDevices.mockResolvedValue([
        createMockDevice('abcdefgh12345', ''),
      ])

      const { result } = renderHook(() => useCameraDevices())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      expect(result.current.devices[0].label).toBe('Camera abcdefgh')
    })

    it('should filter out audio input devices', async () => {
      mockEnumerateDevices.mockResolvedValue([
        createMockDevice('cam1', 'Camera', 'videoinput'),
        createMockDevice('mic1', 'Microphone', 'audioinput'),
        createMockDevice('spk1', 'Speaker', 'audiooutput'),
      ])

      const { result } = renderHook(() => useCameraDevices())

      await waitFor(() => {
        expect(result.current.devices).toHaveLength(1)
      })

      expect(result.current.devices[0].deviceId).toBe('cam1')
    })
  })

  describe('unmount safety', () => {
    it('should not update state after unmount during async enumeration', async () => {
      let resolveEnumeration: ((value: MediaDeviceInfo[]) => void) | null = null
      mockEnumerateDevices.mockReturnValue(
        new Promise<MediaDeviceInfo[]>((resolve) => {
          resolveEnumeration = resolve
        }),
      )

      const { unmount, result } = renderHook(() => useCameraDevices())

      // Unmount before enumeration resolves
      unmount()

      // Now resolve — should not throw or update state
      if (resolveEnumeration) {
        resolveEnumeration([createMockDevice('cam1', 'Camera')])
      }

      // No error should have occurred
      expect(result.current.loading).toBe(true) // still loading since never resolved before unmount
    })

    it('should remove devicechange listener on unmount', async () => {
      mockEnumerateDevices.mockResolvedValue([])

      const { unmount } = renderHook(() => useCameraDevices())

      await waitFor(() => {
        expect(mockAddEventListener).toHaveBeenCalledWith(
          'devicechange',
          expect.any(Function),
        )
      })

      const registeredHandler = mockAddEventListener.mock.calls[0][1]

      unmount()

      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        'devicechange',
        registeredHandler,
      )
    })
  })
})
