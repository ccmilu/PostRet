import { useState, useEffect, useCallback } from 'react'
import type {
  PostureSettings,
  DetectionSettings,
  ReminderSettings,
} from '@/types/settings'
import { DEFAULT_SETTINGS } from '@/types/settings'

export interface UseSettingsReturn {
  readonly settings: PostureSettings
  readonly loading: boolean
  readonly error: string | null
  readonly updateSettings: (partial: Partial<PostureSettings>) => Promise<void>
  readonly updateDetection: (
    partial: Partial<DetectionSettings>,
  ) => Promise<void>
  readonly updateReminder: (
    partial: Partial<ReminderSettings>,
  ) => Promise<void>
}

function hasElectronAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.electronAPI !== undefined &&
    window.electronAPI !== null
  )
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<PostureSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSettings(): Promise<void> {
      try {
        if (hasElectronAPI()) {
          const loaded = await window.electronAPI.getSettings()
          if (!cancelled) {
            setSettings(loaded)
          }
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load settings'
          setError(message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadSettings()
    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = useCallback(
    async (partial: Partial<PostureSettings>): Promise<void> => {
      setError(null)
      const next: PostureSettings = { ...settings, ...partial }
      setSettings(next)
      try {
        if (hasElectronAPI()) {
          await window.electronAPI.setSettings(next)
        }
      } catch (err) {
        setSettings(settings)
        const message =
          err instanceof Error ? err.message : 'Failed to save settings'
        setError(message)
      }
    },
    [settings],
  )

  const updateDetection = useCallback(
    async (partial: Partial<DetectionSettings>): Promise<void> => {
      const nextDetection: DetectionSettings = {
        ...settings.detection,
        ...partial,
      }
      await updateSettings({ detection: nextDetection })
    },
    [settings.detection, updateSettings],
  )

  const updateReminder = useCallback(
    async (partial: Partial<ReminderSettings>): Promise<void> => {
      const nextReminder: ReminderSettings = {
        ...settings.reminder,
        ...partial,
      }
      await updateSettings({ reminder: nextReminder })
    },
    [settings.reminder, updateSettings],
  )

  return {
    settings,
    loading,
    error,
    updateSettings,
    updateDetection,
    updateReminder,
  }
}
