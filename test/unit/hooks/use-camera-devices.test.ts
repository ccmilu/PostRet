import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Defer import so we can set up global mocks first
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

  // Set up navigator.mediaDevices mock
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      enumerateDevices: mockEnumerateDevices,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    },
    writable: true,
    configurable: true,
  })

  // Dynamic import to pick up fresh mocks
  const mod = await import('@/hooks/useCameraDevices')
  useCameraDevices = mod.useCameraDevices
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useCameraDevices', () => {
  it('should enumerate video input devices on mount', async () => {
    const devices = [
      createMockDevice('cam1', 'FaceTime HD Camera'),
      createMockDevice('cam2', 'External USB Camera'),
    ]
    mockEnumerateDevices.mockResolvedValue([
      ...devices,
      createMockDevice('mic1', 'Internal Microphone', 'audioinput'),
    ])

    const { result } = renderHook(() => useCameraDevices())

    await waitFor(() => {
      expect(result.current.devices).toHaveLength(2)
    })

    expect(result.current.devices[0].deviceId).toBe('cam1')
    expect(result.current.devices[0].label).toBe('FaceTime HD Camera')
    expect(result.current.devices[1].deviceId).toBe('cam2')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should handle empty device list', async () => {
    mockEnumerateDevices.mockResolvedValue([])

    const { result } = renderHook(() => useCameraDevices())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.devices).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('should handle enumerateDevices errors', async () => {
    mockEnumerateDevices.mockRejectedValue(new Error('Permission denied'))

    const { result } = renderHook(() => useCameraDevices())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.devices).toHaveLength(0)
    expect(result.current.error).toBe('Permission denied')
  })

  it('should listen for devicechange event', async () => {
    mockEnumerateDevices.mockResolvedValue([
      createMockDevice('cam1', 'FaceTime HD Camera'),
    ])

    const { result } = renderHook(() => useCameraDevices())

    await waitFor(() => {
      expect(result.current.devices).toHaveLength(1)
    })

    expect(mockAddEventListener).toHaveBeenCalledWith(
      'devicechange',
      expect.any(Function),
    )
  })

  it('should update devices on devicechange event', async () => {
    mockEnumerateDevices.mockResolvedValue([
      createMockDevice('cam1', 'FaceTime HD Camera'),
    ])

    const { result } = renderHook(() => useCameraDevices())

    await waitFor(() => {
      expect(result.current.devices).toHaveLength(1)
    })

    // Simulate a new device being plugged in
    mockEnumerateDevices.mockResolvedValue([
      createMockDevice('cam1', 'FaceTime HD Camera'),
      createMockDevice('cam2', 'External Camera'),
    ])

    // Get the devicechange handler that was registered
    const deviceChangeHandler = mockAddEventListener.mock.calls.find(
      (call) => call[0] === 'devicechange',
    )?.[1]
    expect(deviceChangeHandler).toBeDefined()

    await act(async () => {
      deviceChangeHandler()
    })

    await waitFor(() => {
      expect(result.current.devices).toHaveLength(2)
    })
  })

  it('should remove devicechange listener on unmount', async () => {
    mockEnumerateDevices.mockResolvedValue([])

    const { unmount } = renderHook(() => useCameraDevices())

    await waitFor(() => {
      expect(mockAddEventListener).toHaveBeenCalled()
    })

    unmount()

    expect(mockRemoveEventListener).toHaveBeenCalledWith(
      'devicechange',
      expect.any(Function),
    )
  })

  it('should provide a refresh function', async () => {
    mockEnumerateDevices.mockResolvedValue([
      createMockDevice('cam1', 'FaceTime HD Camera'),
    ])

    const { result } = renderHook(() => useCameraDevices())

    await waitFor(() => {
      expect(result.current.devices).toHaveLength(1)
    })

    mockEnumerateDevices.mockResolvedValue([
      createMockDevice('cam1', 'FaceTime HD Camera'),
      createMockDevice('cam2', 'New Camera'),
    ])

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.devices).toHaveLength(2)
  })
})
