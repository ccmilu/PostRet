import { useRef, useEffect, useState, useCallback } from 'react'
import { useCalibration } from '@/hooks/useCalibration'
import { PosePreview } from './PosePreview'
import type { NormalizedLandmark } from './PosePreview'

export interface CalibrationPageProps {
  readonly onComplete?: () => void
}

export function CalibrationPage({ onComplete }: CalibrationPageProps) {
  const { status, progress, error, startCalibration, reset } = useCalibration()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [landmarks] = useState<NormalizedLandmark[][] | undefined>(undefined)

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '无法访问摄像头'
      setCameraError(message)
    }
  }, [])

  useEffect(() => {
    startCamera()
    return stopCamera
  }, [startCamera, stopCamera])

  const handleRetry = useCallback(() => {
    reset()
    setCameraError(null)
    startCamera()
  }, [reset, startCamera])

  const handleBack = useCallback(() => {
    onComplete?.()
  }, [onComplete])

  const progressPercent = Math.round(progress * 100)

  return (
    <div className="calibration-page" data-testid="calibration-page">
      <h2 className="calibration-title">姿态校准</h2>

      <div className="calibration-preview-container">
        <video
          ref={videoRef}
          className="calibration-video"
          autoPlay
          playsInline
          muted
          data-testid="calibration-video"
        />
        <PosePreview
          videoRef={videoRef}
          landmarks={landmarks}
          width={640}
          height={480}
        />
      </div>

      {cameraError && (
        <div className="calibration-status calibration-error" data-testid="calibration-camera-error">
          <p className="calibration-error-text">摄像头访问失败: {cameraError}</p>
          <button
            className="calibration-btn calibration-btn-retry"
            onClick={handleRetry}
            data-testid="calibration-retry-btn"
          >
            重试
          </button>
        </div>
      )}

      {!cameraError && status === 'idle' && (
        <div className="calibration-status" data-testid="calibration-idle">
          <p className="calibration-hint">请保持良好坐姿，然后点击开始校准</p>
          <button
            className="calibration-btn calibration-btn-start"
            onClick={startCalibration}
            data-testid="calibration-start-btn"
          >
            开始校准
          </button>
        </div>
      )}

      {!cameraError && status === 'collecting' && (
        <div className="calibration-status" data-testid="calibration-collecting">
          <p className="calibration-hint">正在采集... 请保持姿势不动</p>
          <div className="calibration-progress-bar" data-testid="calibration-progress-bar">
            <div
              className="calibration-progress-fill"
              style={{ width: `${progressPercent}%` }}
              data-testid="calibration-progress-fill"
            />
          </div>
          <span className="calibration-progress-text">{progressPercent}%</span>
        </div>
      )}

      {!cameraError && status === 'completed' && (
        <div className="calibration-status" data-testid="calibration-completed">
          <p className="calibration-success-text">校准完成 ✓</p>
          <button
            className="calibration-btn calibration-btn-back"
            onClick={handleBack}
            data-testid="calibration-back-btn"
          >
            返回设置
          </button>
        </div>
      )}

      {!cameraError && status === 'error' && (
        <div className="calibration-status calibration-error" data-testid="calibration-error">
          <p className="calibration-error-text">{error ?? '校准失败'}</p>
          <button
            className="calibration-btn calibration-btn-retry"
            onClick={handleRetry}
            data-testid="calibration-retry-btn"
          >
            重试
          </button>
        </div>
      )}
    </div>
  )
}
