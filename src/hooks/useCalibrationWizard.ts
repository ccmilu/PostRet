import { useState, useCallback, useRef, useEffect, type RefObject } from 'react'
import { createPoseDetector, type PoseDetector } from '@/services/pose-detection/pose-detector'
import { CalibrationService } from '@/services/calibration/calibration-service'
import { extractPostureAngles } from '@/services/posture-analysis/angle-calculator'
import { extractScreenAngleSignals } from '@/services/calibration/screen-angle-estimator'
import { checkFacePosition, type PositionCheckResult } from '@/components/calibration/position-check'
import type { NormalizedLandmark } from '@/components/calibration/PosePreview'

export type WizardStep =
  | 'welcome'
  | 'position-check'
  | 'angle-instruction'
  | 'collect'
  | 'confirm'

/** Legacy numeric step alias for backward compatibility in step indicator */
export type WizardStepNumber = 1 | 2 | 3 | 4

export const ANGLE_LABELS = [90, 110, 130] as const
export const TOTAL_ANGLES = ANGLE_LABELS.length

export interface UseCalibrationWizardOptions {
  readonly videoRef: RefObject<HTMLVideoElement | null>
}

export interface UseCalibrationWizardReturn {
  readonly step: WizardStep
  readonly stepNumber: WizardStepNumber
  readonly progress: number
  readonly error: string | null
  readonly positionResult: PositionCheckResult
  readonly canContinue: boolean
  readonly landmarks: NormalizedLandmark[][] | undefined
  readonly angleIndex: number
  readonly currentAngleLabel: number
  readonly goToStep2: () => void
  readonly goToStep3: () => void
  readonly startAngleCollect: () => void
  readonly goBackToStep1: () => void
  readonly recalibrate: () => void
  readonly confirm: () => void
}

const POSITION_CHECK_INTERVAL_MS = 300
const GOOD_POSITION_HOLD_MS = 1500
const COLLECT_INTERVAL_MS = 100
const TOTAL_SAMPLES = 30

const DEFAULT_POSITION_RESULT: PositionCheckResult = {
  status: 'no_face',
  message: '未检测到人脸，请确保脸部在摄像头画面中',
}

function hasElectronAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.electronAPI !== undefined &&
    window.electronAPI !== null
  )
}

function stepToNumber(step: WizardStep): WizardStepNumber {
  switch (step) {
    case 'welcome':
      return 1
    case 'position-check':
      return 2
    case 'angle-instruction':
    case 'collect':
      return 3
    case 'confirm':
      return 4
  }
}

export function useCalibrationWizard(
  options: UseCalibrationWizardOptions,
): UseCalibrationWizardReturn {
  const [step, setStep] = useState<WizardStep>('welcome')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [positionResult, setPositionResult] = useState<PositionCheckResult>(DEFAULT_POSITION_RESULT)
  const [canContinue, setCanContinue] = useState(false)
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[][] | undefined>(undefined)
  const [angleIndex, setAngleIndex] = useState(0)

  const detectorRef = useRef<PoseDetector | null>(null)
  const positionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const collectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const goodSinceRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const calibrationServiceRef = useRef<CalibrationService | null>(null)

  const cleanupDetector = useCallback(() => {
    if (detectorRef.current !== null) {
      detectorRef.current.destroy()
      detectorRef.current = null
    }
  }, [])

  const cleanupTimers = useCallback(() => {
    if (positionTimerRef.current !== null) {
      clearInterval(positionTimerRef.current)
      positionTimerRef.current = null
    }
    if (collectTimerRef.current !== null) {
      clearInterval(collectTimerRef.current)
      collectTimerRef.current = null
    }
  }, [])

  const cleanupAll = useCallback(() => {
    cleanupTimers()
    cleanupDetector()
  }, [cleanupTimers, cleanupDetector])

  // Cleanup on unmount
  useEffect(() => {
    return cleanupAll
  }, [cleanupAll])

  const initDetector = useCallback(async (): Promise<PoseDetector> => {
    if (detectorRef.current !== null && detectorRef.current.isReady()) {
      return detectorRef.current
    }

    cleanupDetector()
    const detector = createPoseDetector()
    await detector.initialize()
    detectorRef.current = detector
    return detector
  }, [cleanupDetector])

  // Position check logic for step 2
  const startPositionCheck = useCallback(async () => {
    const gen = ++generationRef.current

    try {
      const detector = await initDetector()
      if (gen !== generationRef.current) return

      positionTimerRef.current = setInterval(() => {
        if (gen !== generationRef.current) {
          cleanupTimers()
          return
        }

        const video = options.videoRef.current
        if (!video || video.readyState < 2) return

        const frame = detector.detect(video, performance.now())

        if (frame === null) {
          setLandmarks(undefined)
          setPositionResult(DEFAULT_POSITION_RESULT)
          goodSinceRef.current = null
          setCanContinue(false)
          return
        }

        // Convert landmarks for PosePreview display
        const normalizedLandmarks: NormalizedLandmark[] = frame.landmarks.map((lm) => ({
          x: lm.x,
          y: lm.y,
          z: lm.z,
          visibility: lm.visibility,
        }))
        setLandmarks([normalizedLandmarks])

        const result = checkFacePosition(frame.landmarks, frame.frameWidth)
        setPositionResult(result)

        if (result.status === 'good') {
          if (goodSinceRef.current === null) {
            goodSinceRef.current = Date.now()
          }
          const held = Date.now() - goodSinceRef.current
          if (held >= GOOD_POSITION_HOLD_MS) {
            setCanContinue(true)
          }
        } else {
          goodSinceRef.current = null
          setCanContinue(false)
        }
      }, POSITION_CHECK_INTERVAL_MS)
    } catch (err) {
      if (gen !== generationRef.current) return
      setError(err instanceof Error ? err.message : 'PoseDetector 初始化失败')
    }
  }, [initDetector, options.videoRef, cleanupTimers])

  const stopPositionCheck = useCallback(() => {
    if (positionTimerRef.current !== null) {
      clearInterval(positionTimerRef.current)
      positionTimerRef.current = null
    }
  }, [])

  // Collection logic for a single angle
  const startAngleCollection = useCallback(async (currentAngleIndex: number) => {
    const gen = ++generationRef.current

    try {
      const detector = await initDetector()
      if (gen !== generationRef.current) return

      const label = ANGLE_LABELS[currentAngleIndex]

      // Initialize calibration service on first angle
      if (calibrationServiceRef.current === null) {
        calibrationServiceRef.current = new CalibrationService({
          totalSamples: TOTAL_SAMPLES,
        })

        if (hasElectronAPI()) {
          await window.electronAPI.startCalibration()
        }
      }

      const service = calibrationServiceRef.current
      service.startAngleCollection(label)

      setProgress(0)

      collectTimerRef.current = setInterval(() => {
        if (gen !== generationRef.current) {
          cleanupTimers()
          return
        }

        const video = options.videoRef.current
        if (!video || video.readyState < 2) return

        try {
          const frame = detector.detect(video, performance.now())
          if (frame === null) return

          // Update landmarks display during collection
          const normalizedLandmarks: NormalizedLandmark[] = frame.landmarks.map((lm) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility,
          }))
          setLandmarks([normalizedLandmarks])

          const angles = extractPostureAngles(
            frame.worldLandmarks,
            frame.landmarks,
          )
          const screenAngleSignals = extractScreenAngleSignals(frame.landmarks)
          const progressInfo = service.addSample(angles, screenAngleSignals)
          setProgress(progressInfo.progress)

          if (progressInfo.complete) {
            if (collectTimerRef.current !== null) {
              clearInterval(collectTimerRef.current)
              collectTimerRef.current = null
            }

            service.completeCurrentAngle()

            const nextAngleIndex = currentAngleIndex + 1

            if (nextAngleIndex < TOTAL_ANGLES) {
              // Move to next angle instruction
              setAngleIndex(nextAngleIndex)
              setStep('angle-instruction')
            } else {
              // All angles collected, compute multi-angle baseline
              const result = service.computeMultiAngleBaseline()

              if (hasElectronAPI()) {
                window.electronAPI.completeCalibration(result.baseline)
              }

              setStep('confirm')
            }
          }
        } catch (err) {
          if (collectTimerRef.current !== null) {
            clearInterval(collectTimerRef.current)
            collectTimerRef.current = null
          }
          setError(err instanceof Error ? err.message : '采集失败')
        }
      }, COLLECT_INTERVAL_MS)

      // Timeout safety
      const timeoutMs = COLLECT_INTERVAL_MS * TOTAL_SAMPLES * 5
      setTimeout(() => {
        if (gen !== generationRef.current) return
        if (collectTimerRef.current !== null) {
          clearInterval(collectTimerRef.current)
          collectTimerRef.current = null
          setError('采集超时，请重试')
          setStep('welcome')
        }
      }, timeoutMs)
    } catch (err) {
      if (gen !== generationRef.current) return
      setError(err instanceof Error ? err.message : '校准初始化失败')
      setStep('welcome')
    }
  }, [initDetector, options.videoRef, cleanupTimers])

  // Mock collection for non-Electron environment
  const startMockAngleCollection = useCallback((currentAngleIndex: number) => {
    const gen = ++generationRef.current
    setProgress(0)

    // Initialize mock calibration service on first angle
    if (calibrationServiceRef.current === null) {
      calibrationServiceRef.current = new CalibrationService({
        totalSamples: TOTAL_SAMPLES,
      })
    }

    const startTime = Date.now()
    const mockDurationMs = 2000

    collectTimerRef.current = setInterval(() => {
      if (gen !== generationRef.current) {
        cleanupTimers()
        return
      }

      const elapsed = Date.now() - startTime
      const currentProgress = Math.min(elapsed / mockDurationMs, 1)
      setProgress(currentProgress)

      if (currentProgress >= 1) {
        if (collectTimerRef.current !== null) {
          clearInterval(collectTimerRef.current)
          collectTimerRef.current = null
        }

        const nextAngleIndex = currentAngleIndex + 1

        if (nextAngleIndex < TOTAL_ANGLES) {
          setAngleIndex(nextAngleIndex)
          setStep('angle-instruction')
        } else {
          setStep('confirm')
        }
      }
    }, 100)
  }, [cleanupTimers])

  // Step transitions
  const goToStep2 = useCallback(() => {
    setStep('position-check')
    setError(null)
    setPositionResult(DEFAULT_POSITION_RESULT)
    setCanContinue(false)
    goodSinceRef.current = null
    startPositionCheck()
  }, [startPositionCheck])

  // After position check passes, go to first angle instruction
  const goToStep3 = useCallback(() => {
    stopPositionCheck()
    setAngleIndex(0)
    setStep('angle-instruction')
    setError(null)
    calibrationServiceRef.current = null
  }, [stopPositionCheck])

  // Start collecting for the current angle
  const startAngleCollect = useCallback(() => {
    setStep('collect')
    setError(null)

    if (hasElectronAPI()) {
      startAngleCollection(angleIndex)
    } else {
      startMockAngleCollection(angleIndex)
    }
  }, [angleIndex, startAngleCollection, startMockAngleCollection])

  const goBackToStep1 = useCallback(() => {
    cleanupTimers()
    generationRef.current++
    setStep('welcome')
    setError(null)
    setPositionResult(DEFAULT_POSITION_RESULT)
    setCanContinue(false)
    setLandmarks(undefined)
    setAngleIndex(0)
    goodSinceRef.current = null
    calibrationServiceRef.current = null
  }, [cleanupTimers])

  const recalibrate = useCallback(() => {
    cleanupTimers()
    generationRef.current++
    setStep('welcome')
    setProgress(0)
    setError(null)
    setPositionResult(DEFAULT_POSITION_RESULT)
    setCanContinue(false)
    setLandmarks(undefined)
    setAngleIndex(0)
    goodSinceRef.current = null
    calibrationServiceRef.current = null
  }, [cleanupTimers])

  const confirm = useCallback(() => {
    cleanupAll()
  }, [cleanupAll])

  return {
    step,
    stepNumber: stepToNumber(step),
    progress,
    error,
    positionResult,
    canContinue,
    landmarks,
    angleIndex,
    currentAngleLabel: ANGLE_LABELS[angleIndex] ?? ANGLE_LABELS[0],
    goToStep2,
    goToStep3,
    startAngleCollect,
    goBackToStep1,
    recalibrate,
    confirm,
  }
}
