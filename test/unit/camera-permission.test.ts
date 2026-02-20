import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron module
const mockGetMediaAccessStatus = vi.fn()
const mockAskForMediaAccess = vi.fn()
const mockShowMessageBox = vi.fn()
const mockOpenExternal = vi.fn()

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: (...args: unknown[]) => mockGetMediaAccessStatus(...args),
    askForMediaAccess: (...args: unknown[]) => mockAskForMediaAccess(...args),
  },
  dialog: {
    showMessageBox: (...args: unknown[]) => mockShowMessageBox(...args),
  },
  shell: {
    openExternal: (...args: unknown[]) => mockOpenExternal(...args),
  },
}))

import {
  checkCameraPermission,
  requestCameraPermission,
  handleCameraPermission,
  showPermissionDeniedDialog,
  showPermissionRestrictedDialog,
  openCameraSettings,
} from '@electron/permissions/camera-permission'

describe('camera-permission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('checkCameraPermission', () => {
    it('returns "granted" when system reports granted', () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')
      expect(checkCameraPermission()).toBe('granted')
      expect(mockGetMediaAccessStatus).toHaveBeenCalledWith('camera')
    })

    it('returns "denied" when system reports denied', () => {
      mockGetMediaAccessStatus.mockReturnValue('denied')
      expect(checkCameraPermission()).toBe('denied')
    })

    it('returns "not-determined" when system reports not-determined', () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined')
      expect(checkCameraPermission()).toBe('not-determined')
    })

    it('returns "restricted" when system reports restricted', () => {
      mockGetMediaAccessStatus.mockReturnValue('restricted')
      expect(checkCameraPermission()).toBe('restricted')
    })

    it('returns "denied" when getMediaAccessStatus throws', () => {
      mockGetMediaAccessStatus.mockImplementation(() => {
        throw new Error('system error')
      })
      expect(checkCameraPermission()).toBe('denied')
    })
  })

  describe('requestCameraPermission', () => {
    it('calls askForMediaAccess with "camera" and returns true on grant', async () => {
      mockAskForMediaAccess.mockResolvedValue(true)
      const result = await requestCameraPermission()
      expect(result).toBe(true)
      expect(mockAskForMediaAccess).toHaveBeenCalledWith('camera')
    })

    it('returns false when user denies permission', async () => {
      mockAskForMediaAccess.mockResolvedValue(false)
      const result = await requestCameraPermission()
      expect(result).toBe(false)
    })

    it('returns false when askForMediaAccess throws', async () => {
      mockAskForMediaAccess.mockRejectedValue(new Error('system error'))
      const result = await requestCameraPermission()
      expect(result).toBe(false)
    })
  })

  describe('handleCameraPermission', () => {
    it('returns true when status is granted', async () => {
      mockGetMediaAccessStatus.mockReturnValue('granted')
      const result = await handleCameraPermission()
      expect(result).toBe(true)
      // Should not show any dialog or request permission
      expect(mockAskForMediaAccess).not.toHaveBeenCalled()
      expect(mockShowMessageBox).not.toHaveBeenCalled()
    })

    it('calls askForMediaAccess when status is not-determined and returns true on grant', async () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined')
      mockAskForMediaAccess.mockResolvedValue(true)
      const result = await handleCameraPermission()
      expect(result).toBe(true)
      expect(mockAskForMediaAccess).toHaveBeenCalledWith('camera')
    })

    it('returns false when status is not-determined and user denies', async () => {
      mockGetMediaAccessStatus.mockReturnValue('not-determined')
      mockAskForMediaAccess.mockResolvedValue(false)
      const result = await handleCameraPermission()
      expect(result).toBe(false)
    })

    it('shows denied dialog and returns false when status is denied', async () => {
      mockGetMediaAccessStatus.mockReturnValue('denied')
      mockShowMessageBox.mockResolvedValue({ response: 1 }) // "稍后再说"
      const result = await handleCameraPermission()
      expect(result).toBe(false)
      expect(mockShowMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          title: '需要摄像头权限',
        }),
      )
    })

    it('opens system settings when user clicks "打开系统设置" in denied dialog', async () => {
      mockGetMediaAccessStatus.mockReturnValue('denied')
      mockShowMessageBox.mockResolvedValue({ response: 0 }) // "打开系统设置"
      await handleCameraPermission()
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
      )
    })

    it('does not open system settings when user clicks "稍后再说" in denied dialog', async () => {
      mockGetMediaAccessStatus.mockReturnValue('denied')
      mockShowMessageBox.mockResolvedValue({ response: 1 })
      await handleCameraPermission()
      expect(mockOpenExternal).not.toHaveBeenCalled()
    })

    it('shows restricted dialog and returns false when status is restricted', async () => {
      mockGetMediaAccessStatus.mockReturnValue('restricted')
      mockShowMessageBox.mockResolvedValue({ response: 0 })
      const result = await handleCameraPermission()
      expect(result).toBe(false)
      expect(mockShowMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: '摄像头受限',
        }),
      )
    })

    it('returns false for unknown status', async () => {
      mockGetMediaAccessStatus.mockReturnValue('unknown-status')
      const result = await handleCameraPermission()
      expect(result).toBe(false)
    })
  })

  describe('showPermissionDeniedDialog', () => {
    it('shows a warning dialog with correct options', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 1 })
      await showPermissionDeniedDialog()
      expect(mockShowMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'warning',
          buttons: ['打开系统设置', '稍后再说'],
          defaultId: 0,
          cancelId: 1,
        }),
      )
    })

    it('calls openExternal when user chooses to open settings', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 })
      await showPermissionDeniedDialog()
      expect(mockOpenExternal).toHaveBeenCalled()
    })
  })

  describe('showPermissionRestrictedDialog', () => {
    it('shows an info dialog with restricted message', async () => {
      mockShowMessageBox.mockResolvedValue({ response: 0 })
      await showPermissionRestrictedDialog()
      expect(mockShowMessageBox).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'info',
          title: '摄像头受限',
          buttons: ['确定'],
        }),
      )
    })
  })

  describe('openCameraSettings', () => {
    it('calls shell.openExternal with correct macOS privacy URL', () => {
      openCameraSettings()
      expect(mockOpenExternal).toHaveBeenCalledWith(
        'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
      )
    })
  })
})
