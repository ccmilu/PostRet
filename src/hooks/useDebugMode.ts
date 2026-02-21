import { useState, useCallback, useRef, useEffect } from 'react'

const REQUIRED_CLICKS = 5
const CLICK_TIMEOUT_MS = 2000

export interface UseDebugModeReturn {
  readonly debugMode: boolean
  readonly clickCount: number
  readonly handleVersionClick: () => void
  readonly closeDebugMode: () => void
}

export function useDebugMode(
  initialDebugMode: boolean,
  onToggle: (enabled: boolean) => void,
): UseDebugModeReturn {
  const [debugMode, setDebugMode] = useState(initialDebugMode)
  const [clickCount, setClickCount] = useState(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Queue a toggle to fire after render via useEffect
  const pendingToggleRef = useRef<boolean | null>(null)

  // Sync with external settings changes
  useEffect(() => {
    setDebugMode(initialDebugMode)
  }, [initialDebugMode])

  // Fire pending toggle after render (avoids setState-during-render warning)
  useEffect(() => {
    if (pendingToggleRef.current !== null) {
      const value = pendingToggleRef.current
      pendingToggleRef.current = null
      onToggle(value)
    }
  })

  const handleVersionClick = useCallback(() => {
    setClickCount((prev) => {
      const next = prev + 1

      if (next >= REQUIRED_CLICKS) {
        const newMode = !debugMode
        setDebugMode(newMode)
        pendingToggleRef.current = newMode

        // Clear timeout and reset
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current)
          timeoutRef.current = null
        }
        return 0
      }

      // Reset timer on each click
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = setTimeout(() => {
        setClickCount(0)
        timeoutRef.current = null
      }, CLICK_TIMEOUT_MS)

      return next
    })
  }, [debugMode])

  const closeDebugMode = useCallback(() => {
    setDebugMode(false)
    pendingToggleRef.current = false
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return {
    debugMode,
    clickCount,
    handleVersionClick,
    closeDebugMode,
  }
}
