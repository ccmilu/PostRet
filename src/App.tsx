import { useState, useCallback } from 'react'
import { SettingsLayout } from '@/components/settings/SettingsLayout'
import { CalibrationPage } from '@/components/calibration/CalibrationPage'
import '@/styles/settings.css'
import '@/styles/calibration.css'

type AppPage = 'settings' | 'calibration'

export function App() {
  const [page, setPage] = useState<AppPage>('settings')

  const handleStartCalibration = useCallback(() => {
    setPage('calibration')
  }, [])

  const handleCalibrationComplete = useCallback(() => {
    setPage('settings')
  }, [])

  if (page === 'calibration') {
    return <CalibrationPage onComplete={handleCalibrationComplete} />
  }

  return <SettingsLayout onStartCalibration={handleStartCalibration} />
}
