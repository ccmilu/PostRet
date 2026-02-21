import { useCallback, useRef, useEffect } from 'react'
import { Card } from '@/components/shared'
import { useSettings } from '@/hooks/useSettings'
import { useCameraDevices } from '@/hooks/useCameraDevices'

export interface CameraSettingsProps {
  readonly onCameraChange?: (deviceId: string) => void
}

export function CameraSettings({ onCameraChange }: CameraSettingsProps) {
  const { settings, loading: settingsLoading, updateDisplay } = useSettings()
  const { devices, loading: devicesLoading, error: devicesError } = useCameraDevices()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const selectedCamera = settings.display.selectedCamera

  const handleCameraChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const deviceId = e.target.value
      updateDisplay({ selectedCamera: deviceId })
      onCameraChange?.(deviceId)
    },
    [updateDisplay, onCameraChange],
  )

  // Start/stop preview stream when selected camera changes
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false

    async function startPreview(): Promise<void> {
      // Stop previous stream
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop()
        }
        streamRef.current = null
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: selectedCamera
            ? { deviceId: { exact: selectedCamera }, width: { ideal: 320 }, height: { ideal: 240 } }
            : { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (cancelled) {
          for (const track of stream.getTracks()) {
            track.stop()
          }
          return
        }
        streamRef.current = stream
        video.srcObject = stream
        await video.play().catch(() => {})
      } catch {
        // Preview failed — non-critical, detection still works
      }
    }

    startPreview()

    return () => {
      cancelled = true
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop()
        }
        streamRef.current = null
      }
      if (video) {
        video.srcObject = null
      }
    }
  }, [selectedCamera])

  if (settingsLoading) {
    return null
  }

  return (
    <div data-testid="camera-settings">
      <Card title="摄像头">
        {devicesLoading && (
          <p className="settings-hint" data-testid="camera-devices-loading">
            正在检测摄像头...
          </p>
        )}
        {devicesError && (
          <p className="detection-error-text" data-testid="camera-devices-error">
            {devicesError}
          </p>
        )}
        {!devicesLoading && !devicesError && devices.length === 0 && (
          <p className="settings-hint" data-testid="no-cameras-hint">
            未检测到摄像头
          </p>
        )}
        {!devicesLoading && devices.length > 0 && (
          <div className="camera-select-row">
            <select
              className="camera-select"
              data-testid="camera-select"
              value={selectedCamera}
              onChange={handleCameraChange}
            >
              <option value="">默认摄像头</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="camera-preview-container" data-testid="camera-preview">
          <video
            ref={videoRef}
            className="camera-preview-video"
            playsInline
            muted
            autoPlay
          />
        </div>
      </Card>
    </div>
  )
}
