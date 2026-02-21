import { renderHook, act } from '@testing-library/react'
import { useDebugMode } from '@/hooks/useDebugMode'

describe('useDebugMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should start with debugMode false by default', () => {
    const { result } = renderHook(() => useDebugMode(false, vi.fn()))

    expect(result.current.debugMode).toBe(false)
  })

  it('should reflect initial debugMode from settings', () => {
    const { result } = renderHook(() => useDebugMode(true, vi.fn()))

    expect(result.current.debugMode).toBe(true)
  })

  it('should not activate debug mode with fewer than 5 clicks', () => {
    const onToggle = vi.fn()
    const { result } = renderHook(() => useDebugMode(false, onToggle))

    for (let i = 0; i < 4; i++) {
      act(() => {
        result.current.handleVersionClick()
      })
    }

    expect(onToggle).not.toHaveBeenCalled()
    expect(result.current.debugMode).toBe(false)
  })

  it('should activate debug mode after 5 rapid clicks', () => {
    const onToggle = vi.fn()
    const { result } = renderHook(() => useDebugMode(false, onToggle))

    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.handleVersionClick()
      }
    })

    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('should deactivate debug mode after 5 rapid clicks when already on', () => {
    const onToggle = vi.fn()
    const { result } = renderHook(() => useDebugMode(true, onToggle))

    act(() => {
      for (let i = 0; i < 5; i++) {
        result.current.handleVersionClick()
      }
    })

    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('should reset click count after timeout (2 seconds)', () => {
    const onToggle = vi.fn()
    const { result } = renderHook(() => useDebugMode(false, onToggle))

    // Click 3 times
    act(() => {
      for (let i = 0; i < 3; i++) {
        result.current.handleVersionClick()
      }
    })

    // Wait for the timeout to reset clicks
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    // Click 3 more times (total would be 6, but counter reset)
    act(() => {
      for (let i = 0; i < 3; i++) {
        result.current.handleVersionClick()
      }
    })

    expect(onToggle).not.toHaveBeenCalled()
  })

  it('should provide a close function to deactivate debug mode', () => {
    const onToggle = vi.fn()
    const { result } = renderHook(() => useDebugMode(true, onToggle))

    act(() => {
      result.current.closeDebugMode()
    })

    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('should return clickCount for UI feedback', () => {
    const { result } = renderHook(() => useDebugMode(false, vi.fn()))

    expect(result.current.clickCount).toBe(0)

    act(() => {
      result.current.handleVersionClick()
    })

    expect(result.current.clickCount).toBe(1)
  })

  it('should update debugMode when settings prop changes', () => {
    const onToggle = vi.fn()
    const { result, rerender } = renderHook(
      ({ debugMode }) => useDebugMode(debugMode, onToggle),
      { initialProps: { debugMode: false } },
    )

    expect(result.current.debugMode).toBe(false)

    rerender({ debugMode: true })

    expect(result.current.debugMode).toBe(true)
  })
})
