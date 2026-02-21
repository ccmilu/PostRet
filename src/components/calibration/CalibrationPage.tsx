import { useRef, useEffect, useState, useCallback } from 'react'
import { useCalibrationWizard } from '@/hooks/useCalibrationWizard'
import { PosePreview } from './PosePreview'
import { WelcomeStep } from './WelcomeStep'
import { PositionCheckStep } from './PositionCheckStep'
import { CollectStep } from './CollectStep'
import { ConfirmStep } from './ConfirmStep'

export interface CalibrationPageProps {
  readonly onComplete?: () => void
}

const MAX_CAMERA_RETRIES = 2
const CAMERA_RETRY_DELAY_MS = 1000

export function CalibrationPage({ onComplete }: CalibrationPageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraLoading, setCameraLoading] = useState(true)

  const wizard = useCalibrationWizard({ videoRef })

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
    setCameraError(null)
    setCameraLoading(true)

    for (let attempt = 0; attempt <= MAX_CAMERA_RETRIES; attempt++) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true })
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraLoading(false)
        return
      } catch (err) {
        if (attempt < MAX_CAMERA_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, CAMERA_RETRY_DELAY_MS))
          continue
        }
        const message =
          err instanceof Error ? err.message : '无法访问摄像头'
        setCameraError(message)
        setCameraLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    startCamera()
    return stopCamera
  }, [startCamera, stopCamera])

  const handleRetryCamera = useCallback(() => {
    setCameraError(null)
    startCamera()
  }, [startCamera])

  const handleConfirm = useCallback(() => {
    wizard.confirm()
    stopCamera()
    onComplete?.()
  }, [wizard, stopCamera, onComplete])

  const handleRecalibrate = useCallback(() => {
    wizard.recalibrate()
  }, [wizard])

  const showVideo = wizard.step === 2 || wizard.step === 3

  return (
    <div className="calibration-page" data-testid="calibration-wizard">
      {/* Step indicator */}
      <div className="wizard-steps-indicator" data-testid="wizard-steps-indicator">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`wizard-step-dot ${s === wizard.step ? 'active' : ''} ${s < wizard.step ? 'completed' : ''}`}
          />
        ))}
      </div>

      {/* Camera error overlay */}
      {cameraError && (
        <div className="calibration-status calibration-error" data-testid="calibration-camera-error">
          <p className="calibration-error-text">摄像头访问失败: {cameraError}</p>
          <button
            className="calibration-btn calibration-btn-retry"
            onClick={handleRetryCamera}
            data-testid="calibration-retry-btn"
          >
            重试
          </button>
        </div>
      )}

      {/* Wizard error */}
      {wizard.error && !cameraError && (
        <div className="calibration-status calibration-error" data-testid="calibration-error">
          <p className="calibration-error-text">{wizard.error}</p>
          <button
            className="calibration-btn calibration-btn-retry"
            onClick={handleRecalibrate}
            data-testid="calibration-retry-btn"
          >
            重试
          </button>
        </div>
      )}

      {/* Single video element — always mounted to preserve stream binding.
          Visible in steps 2 & 3, hidden (but still alive) in steps 1 & 4. */}
      <div
        className={`calibration-preview-container ${showVideo && !cameraError ? '' : 'calibration-preview-hidden'}`}
      >
        <video
          ref={videoRef}
          className="calibration-video"
          autoPlay
          playsInline
          muted
          data-testid="calibration-video"
        />
        {showVideo && !cameraError && (
          <PosePreview
            videoRef={videoRef}
            landmarks={wizard.landmarks}
            width={640}
            height={480}
          />
        )}
      </div>

      {/* Step content */}
      {!cameraError && !wizard.error && (
        <>
          {wizard.step === 1 && (
            <WelcomeStep onStart={wizard.goToStep2} />
          )}

          {wizard.step === 2 && (
            <PositionCheckStep
              positionResult={wizard.positionResult}
              canContinue={wizard.canContinue}
              onContinue={wizard.goToStep3}
              onBack={wizard.goBackToStep1}
            />
          )}

          {wizard.step === 3 && (
            <CollectStep progress={wizard.progress} />
          )}

          {wizard.step === 4 && (
            <ConfirmStep
              onRecalibrate={handleRecalibrate}
              onConfirm={handleConfirm}
            />
          )}
        </>
      )}
    </div>
  )
}
