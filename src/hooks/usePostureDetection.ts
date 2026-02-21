import { useState, useRef, useCallback, useEffect } from 'react'
import type { PoseDetector } from '@/services/pose-detection/pose-detector'
import { createPoseDetector } from '@/services/pose-detection/pose-detector'
import { PostureAnalyzer } from '@/services/posture-analysis/posture-analyzer'
import type { PostureStatus } from '@/types/ipc'
import type { CalibrationData, DetectionSettings } from '@/types/settings'
import type { PostureAngles, AngleDeviations } from '@/services/posture-analysis/posture-types'

export type DetectionState =
  | 'idle'
  | 'initializing'
  | 'detecting'
  | 'paused'
  | 'error'
  | 'no-camera'

export interface UsePostureDetectionReturn {
  readonly state: DetectionState
  readonly lastStatus: PostureStatus | null
  readonly lastAngles: PostureAngles | null
  readonly lastDeviations: AngleDeviations | null
  readonly error: string | null
  readonly start: (calibration: CalibrationData, detection: DetectionSettings, deviceId?: string) => Promise<void>
  readonly stop: () => void
  /** Async version of stop() — waits for OS camera release before resolving. */
  readonly stopAsync: () => Promise<void>
  readonly pause: () => void
  readonly resume: () => Promise<void>
  readonly updateDetectionSettings: (detection: DetectionSettings) => void
  readonly updateCalibration: (calibration: CalibrationData) => void
  readonly updateCamera: (deviceId: string) => void
}

function hasElectronAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.electronAPI !== undefined &&
    window.electronAPI !== null
  )
}

async function acquireCameraStream(deviceId?: string): Promise<MediaStream> {
  const videoConstraints: MediaTrackConstraints = deviceId
    ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
    : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
  return navigator.mediaDevices.getUserMedia({ video: videoConstraints })
}

function createHiddenVideoElement(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video')
  video.srcObject = stream
  video.playsInline = true
  video.muted = true
  video.style.position = 'absolute'
  video.style.width = '0'
  video.style.height = '0'
  video.style.opacity = '0'
  video.style.pointerEvents = 'none'
  document.body.appendChild(video)
  return video
}

function stopMediaStream(stream: MediaStream | null): void {
  if (stream) {
    for (const track of stream.getTracks()) {
      track.stop()
    }
  }
}

function removeVideoElement(video: HTMLVideoElement | null): void {
  if (video) {
    video.srcObject = null
    video.remove()
  }
}

export function usePostureDetection(): UsePostureDetectionReturn {
  const [state, setState] = useState<DetectionState>('idle')
  const [lastStatus, setLastStatus] = useState<PostureStatus | null>(null)
  const [lastAngles, setLastAngles] = useState<PostureAngles | null>(null)
  const [lastDeviations, setLastDeviations] = useState<AngleDeviations | null>(null)
  const [error, setError] = useState<string | null>(null)

  const detectorRef = useRef<PoseDetector | null>(null)
  const analyzerRef = useRef<PostureAnalyzer | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detectionSettingsRef = useRef<DetectionSettings | null>(null)
  const deviceIdRef = useRef<string | undefined>(undefined)
  const stateRef = useRef<DetectionState>('idle')
  const initializingRef = useRef(false)
  // Incremented on every stop() to signal in-flight start() to abort
  const stopGenerationRef = useRef(0)

  // Keep stateRef in sync so interval callbacks see current state
  stateRef.current = state

  const clearDetectionLoop = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const releaseCameraResources = useCallback(() => {
    stopMediaStream(streamRef.current)
    streamRef.current = null
    removeVideoElement(videoRef.current)
    videoRef.current = null
  }, [])

  const releaseResources = useCallback(() => {
    clearDetectionLoop()
    detectorRef.current?.destroy()
    detectorRef.current = null
    analyzerRef.current = null
    releaseCameraResources()
    detectionSettingsRef.current = null
  }, [clearDetectionLoop, releaseCameraResources])

  const runDetectionFrame = useCallback(() => {
    if (stateRef.current !== 'detecting') {
      return
    }

    const detector = detectorRef.current
    const analyzer = analyzerRef.current
    const video = videoRef.current

    if (!detector || !analyzer || !video || !detector.isReady()) {
      return
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return
    }

    const frame = detector.detect(video, performance.now())
    if (!frame) {
      return
    }

    const result = analyzer.analyzeDetailed(frame)
    setLastStatus(result.status)
    setLastAngles(result.angles)
    setLastDeviations(result.deviations)

    if (hasElectronAPI()) {
      window.electronAPI.reportPostureStatus(result.status).catch((err) => {
        console.warn('Failed to report posture status:', err)
      })
    }
  }, [])

  const startDetectionLoop = useCallback(
    (intervalMs: number) => {
      clearDetectionLoop()
      intervalRef.current = setInterval(runDetectionFrame, intervalMs)
    },
    [clearDetectionLoop, runDetectionFrame],
  )

  const start = useCallback(
    async (calibration: CalibrationData, detection: DetectionSettings, deviceId?: string): Promise<void> => {
      // Prevent concurrent starts (use ref for synchronous check)
      if (initializingRef.current) {
        return
      }

      // Clean up any previous session
      releaseResources()

      initializingRef.current = true
      // Capture the current generation so we can detect if stop() was called
      // while we were awaiting async operations below.
      const generation = stopGenerationRef.current
      setState('initializing')
      setError(null)
      detectionSettingsRef.current = detection
      deviceIdRef.current = deviceId

      try {
        // Step 1: Acquire camera
        let stream: MediaStream
        try {
          stream = await acquireCameraStream(deviceId)
        } catch (err) {
          initializingRef.current = false
          setState('no-camera')
          const message = err instanceof Error ? err.message : 'Cannot access camera'
          setError(message)
          return
        }

        // Check if stop() was called while we were acquiring camera
        if (stopGenerationRef.current !== generation) {
          stopMediaStream(stream)
          return
        }
        streamRef.current = stream

        // Step 2: Create hidden video element and start playback
        const video = createHiddenVideoElement(stream)
        videoRef.current = video
        await video.play()

        // Check if stop() was called while video was starting
        if (stopGenerationRef.current !== generation) {
          return
        }

        // Note: video.readyState is checked in each detection frame,
        // so we don't block here waiting for video data.

        // Step 3: Initialize PoseDetector
        const detector = createPoseDetector()
        await detector.initialize()

        // Check if stop() was called while detector was initializing
        if (stopGenerationRef.current !== generation) {
          detector.destroy()
          return
        }
        detectorRef.current = detector

        // Step 4: Create PostureAnalyzer
        const analyzer = new PostureAnalyzer(
          calibration,
          detection.sensitivity,
          detection.rules,
        )
        analyzerRef.current = analyzer

        // Step 5: Start detection loop
        initializingRef.current = false
        setState('detecting')
        startDetectionLoop(detection.intervalMs)
      } catch (err) {
        // Only update state if we haven't been stopped in the meantime
        if (stopGenerationRef.current === generation) {
          initializingRef.current = false
          releaseResources()
          setState('error')
          const message =
            err instanceof Error ? err.message : 'Detection initialization failed'
          setError(message)
        }
      }
    },
    [releaseResources, startDetectionLoop],
  )

  const stop = useCallback(() => {
    // Signal any in-flight start() to abort after its next await
    stopGenerationRef.current += 1
    initializingRef.current = false
    releaseResources()
    setState('idle')
    setLastStatus(null)
    setLastAngles(null)
    setLastDeviations(null)
    setError(null)
  }, [releaseResources])

  // Delay (ms) to allow the OS to fully release the camera device after
  // track.stop(). macOS typically needs ~200-300ms; 300ms provides margin.
  const CAMERA_RELEASE_DELAY_MS = 300

  const stopAsync = useCallback(async (): Promise<void> => {
    const hadStream = streamRef.current !== null
    stop()
    if (hadStream) {
      await new Promise((resolve) => setTimeout(resolve, CAMERA_RELEASE_DELAY_MS))
    }
  }, [stop])

  const pause = useCallback(() => {
    if (stateRef.current !== 'detecting') {
      return
    }
    clearDetectionLoop()
    releaseCameraResources()
    analyzerRef.current?.reset()
    setState('paused')
  }, [clearDetectionLoop, releaseCameraResources])

  const resume = useCallback(async (): Promise<void> => {
    if (stateRef.current !== 'paused') {
      return
    }

    // Re-acquire camera stream
    let stream: MediaStream
    try {
      stream = await acquireCameraStream(deviceIdRef.current)
    } catch (err) {
      setState('no-camera')
      const message = err instanceof Error ? err.message : 'Cannot access camera'
      setError(message)
      return
    }
    streamRef.current = stream

    // Re-create hidden video element and start playback
    const video = createHiddenVideoElement(stream)
    videoRef.current = video
    try {
      await video.play()
    } catch (err) {
      releaseCameraResources()
      setState('error')
      const message = err instanceof Error ? err.message : 'Video playback failed'
      setError(message)
      return
    }

    const intervalMs = detectionSettingsRef.current?.intervalMs ?? 500
    setState('detecting')
    startDetectionLoop(intervalMs)
  }, [startDetectionLoop, releaseCameraResources])

  const updateDetectionSettings = useCallback(
    (detection: DetectionSettings) => {
      detectionSettingsRef.current = detection
      analyzerRef.current?.updateSensitivity(detection.sensitivity)
      analyzerRef.current?.updateRuleToggles(detection.rules)

      // Restart the loop with new interval if currently detecting
      if (stateRef.current === 'detecting') {
        clearDetectionLoop()
        startDetectionLoop(detection.intervalMs)
      }
    },
    [clearDetectionLoop, startDetectionLoop],
  )

  const updateCalibration = useCallback((calibration: CalibrationData) => {
    analyzerRef.current?.updateCalibration(calibration)
  }, [])

  const updateCamera = useCallback(
    (deviceId: string) => {
      deviceIdRef.current = deviceId || undefined

      // If currently detecting, restart camera with new device
      if (stateRef.current === 'detecting') {
        clearDetectionLoop()
        releaseCameraResources()

        // Re-acquire camera with new device and restart detection loop
        acquireCameraStream(deviceIdRef.current)
          .then((stream) => {
            if (stateRef.current !== 'detecting' && stateRef.current !== 'idle') {
              stopMediaStream(stream)
              return
            }
            streamRef.current = stream
            const video = createHiddenVideoElement(stream)
            videoRef.current = video
            return video.play()
          })
          .then(() => {
            if (stateRef.current === 'detecting') {
              const intervalMs = detectionSettingsRef.current?.intervalMs ?? 500
              startDetectionLoop(intervalMs)
            }
          })
          .catch((err) => {
            setState('no-camera')
            const message = err instanceof Error ? err.message : 'Cannot access camera'
            setError(message)
          })
      }
    },
    [clearDetectionLoop, releaseCameraResources, startDetectionLoop],
  )

  // Listen for pause/resume from main process (Tray menu)
  useEffect(() => {
    if (!hasElectronAPI()) {
      return
    }

    const unsubPause = window.electronAPI.onPause(() => {
      pause()
    })

    const unsubResume = window.electronAPI.onResume(() => {
      resume()
    })

    return () => {
      unsubPause()
      unsubResume()
    }
  }, [pause, resume])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      releaseResources()
    }
  }, [releaseResources])

  // Ensure camera is released when window is closing (app quit)
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      releaseResources()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [releaseResources])

  return {
    state,
    lastStatus,
    lastAngles,
    lastDeviations,
    error,
    start,
    stop,
    stopAsync,
    pause,
    resume,
    updateDetectionSettings,
    updateCalibration,
    updateCamera,
  }
}
