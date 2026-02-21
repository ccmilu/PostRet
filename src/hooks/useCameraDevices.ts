import { useState, useEffect, useCallback, useRef } from 'react'

export interface CameraDevice {
  readonly deviceId: string
  readonly label: string
}

export interface UseCameraDevicesReturn {
  readonly devices: readonly CameraDevice[]
  readonly loading: boolean
  readonly error: string | null
  readonly refresh: () => Promise<void>
}

async function enumerateVideoDevices(): Promise<readonly CameraDevice[]> {
  const allDevices = await navigator.mediaDevices.enumerateDevices()
  return allDevices
    .filter((d) => d.kind === 'videoinput')
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
    }))
}

export function useCameraDevices(): UseCameraDevicesReturn {
  const [devices, setDevices] = useState<readonly CameraDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const videoDevices = await enumerateVideoDevices()
      if (mountedRef.current) {
        setDevices(videoDevices)
        setError(null)
      }
    } catch (err) {
      if (mountedRef.current) {
        const message = err instanceof Error ? err.message : 'Failed to enumerate devices'
        setError(message)
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refresh()

    const handleDeviceChange = (): void => {
      refresh()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)

    return () => {
      mountedRef.current = false
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [refresh])

  return { devices, loading, error, refresh }
}
