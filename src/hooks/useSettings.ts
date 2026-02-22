import { useState, useEffect, useCallback, useContext, useRef, createContext } from 'react'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import type {
  PostureSettings,
  DetectionSettings,
  ReminderSettings,
  DisplaySettings,
  AdvancedSettings,
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
  readonly updateDisplay: (
    partial: Partial<DisplaySettings>,
  ) => Promise<void>
  readonly updateAdvanced: (
    partial: Partial<AdvancedSettings>,
  ) => Promise<void>
  readonly reloadSettings: () => Promise<void>
}

function hasElectronAPI(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.electronAPI !== undefined &&
    window.electronAPI !== null
  )
}

// ---- Context ----

const SettingsContext = createContext<UseSettingsReturn | null>(null)

export interface SettingsProviderProps {
  readonly children: ReactNode
}

/**
 * Provides a single shared settings state to all descendant components.
 * Must be mounted once near the root of the component tree so that all
 * consumers of useSettings() share the same state instance.
 */
export function SettingsProvider({ children }: SettingsProviderProps) {
  const value = useSettingsInternal()
  return createElement(SettingsContext.Provider, { value }, children)
}

/**
 * Consumes the shared settings state from the nearest SettingsProvider.
 * Throws if no provider is found – wrap your app in <SettingsProvider>.
 */
export function useSettings(): UseSettingsReturn {
  const ctx = useContext(SettingsContext)
  if (ctx === null) {
    throw new Error(
      'useSettings must be used within a <SettingsProvider>. ' +
      'Wrap your component tree (or test) in <SettingsProvider>.',
    )
  }
  return ctx
}

// ---- Internal implementation ----

function useSettingsInternal(): UseSettingsReturn {
  const [settings, setSettings] = useState<PostureSettings>(DEFAULT_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Keep a ref to the latest settings so that callbacks can always read the
  // freshest value without needing to be re-created on every settings change.
  const settingsRef = useRef<PostureSettings>(settings)
  settingsRef.current = settings

  const reloadSettings = useCallback(async (): Promise<void> => {
    try {
      if (hasElectronAPI()) {
        const loaded = await window.electronAPI.getSettings()
        setSettings(loaded)
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to load settings'
      setError(message)
    }
  }, [])

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
      // Use settingsRef to always read the latest value, avoiding stale
      // closure issues when multiple updates happen in quick succession.
      const current = settingsRef.current
      const next: PostureSettings = { ...current, ...partial }
      setSettings(next)
      try {
        if (hasElectronAPI()) {
          await window.electronAPI.setSettings(next)
        }
      } catch (err) {
        // Rollback to the value that was current before this update
        setSettings(current)
        const message =
          err instanceof Error ? err.message : 'Failed to save settings'
        setError(message)
      }
    },
    [], // stable – reads from settingsRef instead of closing over settings
  )

  const updateDetection = useCallback(
    async (partial: Partial<DetectionSettings>): Promise<void> => {
      const nextDetection: DetectionSettings = {
        ...settingsRef.current.detection,
        ...partial,
      }
      await updateSettings({ detection: nextDetection })
    },
    [updateSettings],
  )

  const updateReminder = useCallback(
    async (partial: Partial<ReminderSettings>): Promise<void> => {
      const nextReminder: ReminderSettings = {
        ...settingsRef.current.reminder,
        ...partial,
      }
      await updateSettings({ reminder: nextReminder })
    },
    [updateSettings],
  )

  const updateDisplay = useCallback(
    async (partial: Partial<DisplaySettings>): Promise<void> => {
      const nextDisplay: DisplaySettings = {
        ...settingsRef.current.display,
        ...partial,
      }
      await updateSettings({ display: nextDisplay })
    },
    [updateSettings],
  )

  const updateAdvanced = useCallback(
    async (partial: Partial<AdvancedSettings>): Promise<void> => {
      const nextAdvanced: AdvancedSettings = {
        ...settingsRef.current.advanced,
        ...partial,
      }
      await updateSettings({ advanced: nextAdvanced })
    },
    [updateSettings],
  )

  return {
    settings,
    loading,
    error,
    updateSettings,
    updateDetection,
    updateReminder,
    updateDisplay,
    updateAdvanced,
    reloadSettings,
  }
}
