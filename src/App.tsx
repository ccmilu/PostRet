import { useState, useCallback, useEffect } from 'react'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { CalibrationPage } from '@/components/calibration/CalibrationPage'
import { usePostureDetection } from '@/hooks/usePostureDetection'
import { useSettings } from '@/hooks/useSettings'
import '@/styles/settings.css'
import '@/styles/calibration.css'

type AppPage = 'settings' | 'calibration'

export function App() {
  const [page, setPage] = useState<AppPage>('settings')
  const { settings, loading, reloadSettings } = useSettings()
  const detection = usePostureDetection()

  // Auto-start detection when calibration data is available.
  // Also retry when state is 'error' (e.g. model load failure) so that
  // a settings change or re-calibration can recover automatically.
  useEffect(() => {
    if (loading) {
      return
    }

    const { calibration } = settings
    if (!calibration) {
      return
    }

    if (detection.state !== 'idle' && detection.state !== 'error') {
      return
    }

    if (!settings.detection.enabled) {
      return
    }

    detection.start(calibration, settings.detection)
  }, [loading, settings, detection.state, detection.start])

  // Handle detection enabled/disabled toggle
  useEffect(() => {
    if (loading) {
      return
    }

    if (!settings.detection.enabled) {
      // enabled → false: stop detection if running
      if (detection.state === 'detecting' || detection.state === 'paused' || detection.state === 'initializing') {
        detection.stop()
      }
    }
    // enabled → true is handled by the auto-start useEffect above
  }, [loading, settings.detection.enabled, detection.state, detection.stop])

  // Sync detection settings changes
  useEffect(() => {
    if (detection.state === 'detecting' || detection.state === 'paused') {
      detection.updateDetectionSettings(settings.detection)
    }
  }, [settings.detection, detection.state, detection.updateDetectionSettings])

  // Sync calibration changes
  useEffect(() => {
    if (settings.calibration && (detection.state === 'detecting' || detection.state === 'paused')) {
      detection.updateCalibration(settings.calibration)
    }
  }, [settings.calibration, detection.state, detection.updateCalibration])

  // Sync custom threshold overrides from debug panel
  useEffect(() => {
    if (detection.state === 'detecting' || detection.state === 'paused') {
      detection.updateCustomThresholds(settings.advanced.customThresholds)
    }
  }, [settings.advanced.customThresholds, detection.state, detection.updateCustomThresholds])

  const handleStartCalibration = useCallback(async () => {
    // Wait for camera release before navigating so CalibrationPage
    // can acquire the camera without a device-busy race condition.
    await detection.stopAsync()
    setPage('calibration')
  }, [detection])

  const handleCalibrationComplete = useCallback(async () => {
    setPage('settings')
    // Await reloadSettings so that the auto-start useEffect sees the
    // freshly-saved calibration data on the very next render.
    await reloadSettings()
  }, [reloadSettings])

  if (page === 'calibration') {
    return <CalibrationPage onComplete={handleCalibrationComplete} />
  }

  return (
    <SettingsLayout
      onStartCalibration={handleStartCalibration}
      detection={detection}
    />
  )
}
