import { useState, useCallback, useRef } from 'react'

export type CalibrationStatus = 'idle' | 'collecting' | 'completed' | 'error'

export interface UseCalibrationReturn {
  readonly status: CalibrationStatus
  readonly progress: number
  readonly error: string | null
  readonly startCalibration: () => void
  readonly reset: () => void
}

const MOCK_DURATION_MS = 3000
const MOCK_INTERVAL_MS = 100

function hasElectronAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.electronAPI !== undefined &&
    window.electronAPI !== null
  )
}

export function useCalibration(): UseCalibrationReturn {
  const [status, setStatus] = useState<CalibrationStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const startMockCalibration = useCallback(() => {
    setStatus('collecting')
    setProgress(0)
    setError(null)

    const startTime = Date.now()
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime
      const currentProgress = Math.min(elapsed / MOCK_DURATION_MS, 1)
      setProgress(currentProgress)

      if (currentProgress >= 1) {
        cleanup()
        setStatus('completed')
      }
    }, MOCK_INTERVAL_MS)
  }, [cleanup])

  const startElectronCalibration = useCallback(async () => {
    setStatus('collecting')
    setProgress(0)
    setError(null)

    try {
      await window.electronAPI.startCalibration()
      setProgress(1)
      setStatus('completed')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Calibration failed'
      setError(message)
      setStatus('error')
    }
  }, [])

  const startCalibration = useCallback(() => {
    if (status === 'collecting') {
      return
    }

    if (hasElectronAPI()) {
      startElectronCalibration()
    } else {
      startMockCalibration()
    }
  }, [status, startElectronCalibration, startMockCalibration])

  const reset = useCallback(() => {
    cleanup()
    setStatus('idle')
    setProgress(0)
    setError(null)
  }, [cleanup])

  return {
    status,
    progress,
    error,
    startCalibration,
    reset,
  }
}
