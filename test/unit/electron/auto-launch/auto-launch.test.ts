import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron app
const mockSetLoginItemSettings = vi.fn()
const mockGetLoginItemSettings = vi.fn()

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: (...args: unknown[]) => mockSetLoginItemSettings(...args),
    getLoginItemSettings: (...args: unknown[]) => mockGetLoginItemSettings(...args),
    isPackaged: false,
  },
}))

// Import after mock
import {
  enableAutoLaunch,
  disableAutoLaunch,
  getAutoLaunchStatus,
  syncAutoLaunch,
} from '@electron/auto-launch/auto-launch'

describe('auto-launch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('enableAutoLaunch', () => {
    it('should call setLoginItemSettings with openAtLogin true', () => {
      enableAutoLaunch()

      expect(mockSetLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
      })
    })
  })

  describe('disableAutoLaunch', () => {
    it('should call setLoginItemSettings with openAtLogin false', () => {
      disableAutoLaunch()

      expect(mockSetLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: false,
      })
    })
  })

  describe('getAutoLaunchStatus', () => {
    it('should return true when openAtLogin is true', () => {
      mockGetLoginItemSettings.mockReturnValue({ openAtLogin: true })

      expect(getAutoLaunchStatus()).toBe(true)
    })

    it('should return false when openAtLogin is false', () => {
      mockGetLoginItemSettings.mockReturnValue({ openAtLogin: false })

      expect(getAutoLaunchStatus()).toBe(false)
    })
  })

  describe('syncAutoLaunch', () => {
    it('should enable auto-launch when enabled is true', () => {
      syncAutoLaunch(true)

      expect(mockSetLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
      })
    })

    it('should disable auto-launch when enabled is false', () => {
      syncAutoLaunch(false)

      expect(mockSetLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: false,
      })
    })
  })
})
