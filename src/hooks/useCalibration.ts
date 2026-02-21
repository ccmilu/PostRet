import { useState, useCallback, useRef, type RefObject } from 'react'
import { createPoseDetector, type PoseDetector } from '@/services/pose-detection/pose-detector'
import { CalibrationService } from '@/services/calibration/calibration-service'
import { extractPostureAngles } from '@/services/posture-analysis/angle-calculator'

export type CalibrationStatus = 'idle' | 'collecting' | 'completed' | 'error'

export interface UseCalibrationOptions {
  readonly videoRef: RefObject<HTMLVideoElement | null>
}

export interface UseCalibrationReturn {
  readonly status: CalibrationStatus
  readonly progress: number
  readonly error: string | null
  readonly startCalibration: () => void
  readonly reset: () => void
}

const MOCK_DURATION_MS = 3000
const MOCK_INTERVAL_MS = 100
const COLLECT_INTERVAL_MS = 100
const TOTAL_SAMPLES = 30

function hasElectronAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.electronAPI !== undefined &&
    window.electronAPI !== null
  )
}

export function useCalibration(
  options: UseCalibrationOptions,
): UseCalibrationReturn {
  const [status, setStatus] = useState<CalibrationStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detectorRef = useRef<PoseDetector | null>(null)

  const cleanup = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (detectorRef.current !== null) {
      detectorRef.current.destroy()
      detectorRef.current = null
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
      const video = options.videoRef.current
      if (!video) {
        throw new Error('摄像头未就绪')
      }

      await window.electronAPI.startCalibration()

      const detector = createPoseDetector()
      await detector.initialize()
      detectorRef.current = detector

      const calibrationService = new CalibrationService({
        totalSamples: TOTAL_SAMPLES,
      })

      await collectSamples(video, detector, calibrationService, setProgress)

      const result = calibrationService.computeBaseline()
      await window.electronAPI.completeCalibration(result.baseline)

      setProgress(1)
      setStatus('completed')
    } catch (err) {
      cleanup()
      const message =
        err instanceof Error ? err.message : '校准失败'
      setError(message)
      setStatus('error')
    }
  }, [options.videoRef, cleanup])

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

async function collectSamples(
  video: HTMLVideoElement,
  detector: PoseDetector,
  calibrationService: CalibrationService,
  setProgress: (progress: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let collected = 0

    const timer = setInterval(() => {
      try {
        const frame = detector.detect(video, performance.now())
        if (frame === null) {
          return
        }

        const angles = extractPostureAngles(
          frame.worldLandmarks,
          frame.frameWidth,
        )
        const progressInfo = calibrationService.addSample(angles)
        collected = progressInfo.sampleCount
        setProgress(progressInfo.progress)

        if (progressInfo.complete) {
          clearInterval(timer)
          resolve()
        }
      } catch (err) {
        clearInterval(timer)
        reject(err)
      }
    }, COLLECT_INTERVAL_MS)

    const timeoutMs = COLLECT_INTERVAL_MS * TOTAL_SAMPLES * 3
    setTimeout(() => {
      clearInterval(timer)
      if (collected < TOTAL_SAMPLES) {
        reject(new Error(`校准超时: 仅采集到 ${collected}/${TOTAL_SAMPLES} 帧`))
      }
    }, timeoutMs)
  })
}
