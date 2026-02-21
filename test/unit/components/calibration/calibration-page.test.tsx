import { render, screen, act, fireEvent } from '@testing-library/react'
import { CalibrationPage } from '@/components/calibration/CalibrationPage'
import type { WizardStep } from '@/hooks/useCalibrationWizard'
import type { PositionCheckResult } from '@/components/calibration/position-check'

// Mock useCalibrationWizard hook
const mockGoToStep2 = vi.fn()
const mockGoToStep3 = vi.fn()
const mockStartAngleCollect = vi.fn()
const mockGoBackToStep1 = vi.fn()
const mockRecalibrate = vi.fn()
const mockConfirm = vi.fn()

let mockStep: WizardStep = 'welcome'
let mockStepNumber = 1
let mockProgress = 0
let mockError: string | null = null
let mockPositionResult: PositionCheckResult = {
  status: 'no_face',
  message: '未检测到人脸，请确保脸部在摄像头画面中',
}
let mockCanContinue = false
let mockAngleIndex = 0
let mockCurrentAngleLabel = 90

vi.mock('@/hooks/useCalibrationWizard', () => ({
  useCalibrationWizard: () => ({
    step: mockStep,
    stepNumber: mockStepNumber,
    progress: mockProgress,
    error: mockError,
    positionResult: mockPositionResult,
    canContinue: mockCanContinue,
    landmarks: undefined,
    angleIndex: mockAngleIndex,
    currentAngleLabel: mockCurrentAngleLabel,
    goToStep2: mockGoToStep2,
    goToStep3: mockGoToStep3,
    startAngleCollect: mockStartAngleCollect,
    goBackToStep1: mockGoBackToStep1,
    recalibrate: mockRecalibrate,
    confirm: mockConfirm,
  }),
  TOTAL_ANGLES: 3,
}))

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn()
const mockPlay = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  vi.useFakeTimers()
  mockStep = 'welcome'
  mockStepNumber = 1
  mockProgress = 0
  mockError = null
  mockPositionResult = {
    status: 'no_face',
    message: '未检测到人脸，请确保脸部在摄像头画面中',
  }
  mockCanContinue = false
  mockAngleIndex = 0
  mockCurrentAngleLabel = 90
  mockGoToStep2.mockClear()
  mockGoToStep3.mockClear()
  mockStartAngleCollect.mockClear()
  mockGoBackToStep1.mockClear()
  mockRecalibrate.mockClear()
  mockConfirm.mockClear()
  mockGetUserMedia.mockClear()
  mockPlay.mockClear()

  // Mock requestAnimationFrame for PosePreview
  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1)
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockReturnValue(undefined)

  // Setup getUserMedia mock
  const mockTrack = { stop: vi.fn() }
  const mockStream = { getTracks: () => [mockTrack] }
  mockGetUserMedia.mockResolvedValue(mockStream)

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  })

  // Mock HTMLVideoElement.play
  HTMLVideoElement.prototype.play = mockPlay
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CalibrationPage (Wizard)', () => {
  describe('step 1 - welcome', () => {
    it('renders the wizard container', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-wizard')).toBeInTheDocument()
    })

    it('shows welcome step with start button', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('wizard-step-1')).toBeInTheDocument()
      expect(screen.getByText('姿态校准')).toBeInTheDocument()
      expect(screen.getByTestId('wizard-start-btn')).toBeInTheDocument()
    })

    it('calls goToStep2 when start button is clicked', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      fireEvent.click(screen.getByTestId('wizard-start-btn'))

      expect(mockGoToStep2).toHaveBeenCalledOnce()
    })

    it('shows step indicator dots', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('wizard-steps-indicator')).toBeInTheDocument()
    })
  })

  describe('step 2 - position check', () => {
    beforeEach(() => {
      mockStep = 'position-check'
      mockStepNumber = 2
    })

    it('shows position check step', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('wizard-step-2')).toBeInTheDocument()
      expect(screen.getByText('位置检查')).toBeInTheDocument()
    })

    it('shows position status message', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('position-status')).toBeInTheDocument()
    })

    it('disables continue button when position is not good', async () => {
      mockCanContinue = false

      await act(async () => {
        render(<CalibrationPage />)
      })

      const btn = screen.getByTestId('wizard-continue-btn')
      expect(btn).toBeDisabled()
    })

    it('enables continue button when position is good', async () => {
      mockCanContinue = true
      mockPositionResult = { status: 'good', message: '位置合适！' }

      await act(async () => {
        render(<CalibrationPage />)
      })

      const btn = screen.getByTestId('wizard-continue-btn')
      expect(btn).not.toBeDisabled()
    })

    it('calls goToStep3 when continue button is clicked', async () => {
      mockCanContinue = true
      mockPositionResult = { status: 'good', message: '位置合适！' }

      await act(async () => {
        render(<CalibrationPage />)
      })

      fireEvent.click(screen.getByTestId('wizard-continue-btn'))

      expect(mockGoToStep3).toHaveBeenCalledOnce()
    })

    it('calls goBackToStep1 when back button is clicked', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      fireEvent.click(screen.getByTestId('wizard-back-btn'))

      expect(mockGoBackToStep1).toHaveBeenCalledOnce()
    })

    it('shows video preview', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-video')).toBeInTheDocument()
    })
  })

  describe('step 3 - collect', () => {
    beforeEach(() => {
      mockStep = 'collect'
      mockStepNumber = 3
      mockProgress = 0.5
      mockAngleIndex = 0
      mockCurrentAngleLabel = 90
    })

    it('shows collect step with progress ring', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('wizard-step-3')).toBeInTheDocument()
      expect(screen.getByTestId('calibration-progress-ring')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('shows 0% at start', async () => {
      mockProgress = 0

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('shows 100% when complete', async () => {
      mockProgress = 1

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByText('100%')).toBeInTheDocument()
    })

    it('shows video preview during collection', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-video')).toBeInTheDocument()
    })
  })

  describe('step 4 - confirm', () => {
    beforeEach(() => {
      mockStep = 'confirm'
      mockStepNumber = 4
      mockProgress = 1
    })

    it('shows confirm step', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('wizard-step-4')).toBeInTheDocument()
      expect(screen.getByText('校准完成')).toBeInTheDocument()
    })

    it('shows recalibrate and confirm buttons', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('wizard-recalibrate-btn')).toBeInTheDocument()
      expect(screen.getByTestId('wizard-confirm-btn')).toBeInTheDocument()
    })

    it('calls recalibrate when recalibrate button is clicked', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      fireEvent.click(screen.getByTestId('wizard-recalibrate-btn'))

      expect(mockRecalibrate).toHaveBeenCalledOnce()
    })

    it('calls onComplete when confirm button is clicked', async () => {
      const onComplete = vi.fn()

      await act(async () => {
        render(<CalibrationPage onComplete={onComplete} />)
      })

      fireEvent.click(screen.getByTestId('wizard-confirm-btn'))

      expect(mockConfirm).toHaveBeenCalledOnce()
      expect(onComplete).toHaveBeenCalledOnce()
    })
  })

  describe('camera error', () => {
    it('shows camera error when getUserMedia fails after retries', async () => {
      mockGetUserMedia.mockRejectedValue(new Error('Permission denied'))

      await act(async () => {
        render(<CalibrationPage />)
      })

      // Advance through all retries
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      expect(screen.getByTestId('calibration-camera-error')).toBeInTheDocument()
      expect(screen.getByText(/Permission denied/)).toBeInTheDocument()
    })

    it('shows camera error with generic message for non-Error rejections', async () => {
      mockGetUserMedia.mockRejectedValue('unknown error')

      await act(async () => {
        render(<CalibrationPage />)
      })

      // Advance through all retries
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      expect(screen.getByText(/无法访问摄像头/)).toBeInTheDocument()
    })

    it('retries camera when retry button is clicked', async () => {
      mockGetUserMedia.mockRejectedValue(new Error('Permission denied'))

      await act(async () => {
        render(<CalibrationPage />)
      })

      // Advance through all retries
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      expect(screen.getByTestId('calibration-camera-error')).toBeInTheDocument()

      // Reset getUserMedia to succeed on manual retry
      mockGetUserMedia.mockResolvedValueOnce({
        getTracks: () => [{ stop: vi.fn() }],
      })

      fireEvent.click(screen.getByTestId('calibration-retry-btn'))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // Camera should be retried
      expect(mockGetUserMedia).toHaveBeenCalledTimes(4) // 3 original + 1 retry
    })
  })

  describe('cleanup', () => {
    it('stops camera tracks on unmount', async () => {
      const mockStop = vi.fn()
      const mockStream = { getTracks: () => [{ stop: mockStop }] }
      mockGetUserMedia.mockResolvedValue(mockStream)

      let unmount: () => void
      await act(async () => {
        const result = render(<CalibrationPage />)
        unmount = result.unmount
      })

      act(() => {
        unmount()
      })

      expect(mockStop).toHaveBeenCalled()
    })
  })

  describe('requests camera on mount', () => {
    it('calls getUserMedia', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(mockGetUserMedia).toHaveBeenCalledWith({ video: true })
    })
  })
})
