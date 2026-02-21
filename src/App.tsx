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

  // Auto-start detection when calibration data is available
  useEffect(() => {
    if (loading) {
      return
    }

    const { calibration } = settings
    if (!calibration) {
      return
    }

    if (detection.state !== 'idle') {
      return
    }

    if (!settings.detection.enabled) {
      return
    }

    detection.start(calibration, settings.detection)
  }, [loading, settings, detection.state, detection.start])

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

  const handleStartCalibration = useCallback(() => {
    detection.stop()
    setPage('calibration')
  }, [detection])

  const handleCalibrationComplete = useCallback(() => {
    setPage('settings')
    reloadSettings()
  }, [reloadSettings])

  if (page === 'calibration') {
    return <CalibrationPage onComplete={handleCalibrationComplete} />
  }

  return <SettingsLayout onStartCalibration={handleStartCalibration} />
}
