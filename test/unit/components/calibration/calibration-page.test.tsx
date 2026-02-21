import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalibrationPage } from '@/components/calibration/CalibrationPage'
import type { CalibrationStatus } from '@/hooks/useCalibration'

// Mock useCalibration hook
const mockStartCalibration = vi.fn()
const mockReset = vi.fn()
let mockStatus: CalibrationStatus = 'idle'
let mockProgress = 0
let mockError: string | null = null

vi.mock('@/hooks/useCalibration', () => ({
  useCalibration: () => ({
    status: mockStatus,
    progress: mockProgress,
    error: mockError,
    startCalibration: mockStartCalibration,
    reset: mockReset,
  }),
}))

// Mock navigator.mediaDevices
const mockGetUserMedia = vi.fn()
const mockPlay = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  mockStatus = 'idle'
  mockProgress = 0
  mockError = null
  mockStartCalibration.mockClear()
  mockReset.mockClear()
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
  vi.restoreAllMocks()
})

describe('CalibrationPage', () => {
  describe('idle state', () => {
    it('renders the calibration page', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-page')).toBeInTheDocument()
      expect(screen.getByText('姿态校准')).toBeInTheDocument()
    })

    it('shows idle UI with hint text and start button', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-idle')).toBeInTheDocument()
      expect(screen.getByText('请保持良好坐姿，然后点击开始校准')).toBeInTheDocument()
      expect(screen.getByTestId('calibration-start-btn')).toBeInTheDocument()
    })

    it('calls startCalibration when start button is clicked', async () => {
      const user = userEvent.setup()

      await act(async () => {
        render(<CalibrationPage />)
      })

      await user.click(screen.getByTestId('calibration-start-btn'))

      expect(mockStartCalibration).toHaveBeenCalledOnce()
    })

    it('renders video element for camera feed', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-video')).toBeInTheDocument()
    })

    it('requests camera on mount', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(mockGetUserMedia).toHaveBeenCalledWith({ video: true })
    })
  })

  describe('collecting state', () => {
    beforeEach(() => {
      mockStatus = 'collecting'
      mockProgress = 0.5
    })

    it('shows collecting UI with progress', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-collecting')).toBeInTheDocument()
      expect(screen.getByText('正在采集... 请保持姿势不动')).toBeInTheDocument()
    })

    it('shows progress bar with correct percentage', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-progress-bar')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()

      const fill = screen.getByTestId('calibration-progress-fill')
      expect(fill).toHaveStyle({ width: '50%' })
    })

    it('shows 0% at start of collecting', async () => {
      mockProgress = 0

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('shows 100% when progress is 1', async () => {
      mockProgress = 1

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })

  describe('completed state', () => {
    beforeEach(() => {
      mockStatus = 'completed'
      mockProgress = 1
    })

    it('shows completed UI', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-completed')).toBeInTheDocument()
      expect(screen.getByText('校准完成 ✓')).toBeInTheDocument()
    })

    it('shows back button', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-back-btn')).toBeInTheDocument()
      expect(screen.getByText('返回设置')).toBeInTheDocument()
    })

    it('calls onComplete when back button is clicked', async () => {
      const user = userEvent.setup()
      const onComplete = vi.fn()

      await act(async () => {
        render(<CalibrationPage onComplete={onComplete} />)
      })

      await user.click(screen.getByTestId('calibration-back-btn'))

      expect(onComplete).toHaveBeenCalledOnce()
    })
  })

  describe('error state', () => {
    beforeEach(() => {
      mockStatus = 'error'
      mockError = '校准过程中发生错误'
    })

    it('shows error UI with error message', async () => {
      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-error')).toBeInTheDocument()
      expect(screen.getByText('校准过程中发生错误')).toBeInTheDocument()
    })

    it('shows default error message when error is null', async () => {
      mockError = null

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByText('校准失败')).toBeInTheDocument()
    })

    it('shows retry button that resets calibration', async () => {
      const user = userEvent.setup()

      await act(async () => {
        render(<CalibrationPage />)
      })

      await user.click(screen.getByTestId('calibration-retry-btn'))

      expect(mockReset).toHaveBeenCalledOnce()
    })
  })

  describe('camera error', () => {
    it('shows camera error when getUserMedia fails', async () => {
      mockGetUserMedia.mockRejectedValue(new Error('Permission denied'))

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-camera-error')).toBeInTheDocument()
      expect(screen.getByText(/Permission denied/)).toBeInTheDocument()
    })

    it('shows camera error with generic message for non-Error rejections', async () => {
      mockGetUserMedia.mockRejectedValue('unknown error')

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByText(/无法访问摄像头/)).toBeInTheDocument()
    })

    it('retries camera when retry button is clicked on camera error', async () => {
      const user = userEvent.setup()
      mockGetUserMedia.mockRejectedValueOnce(new Error('Permission denied'))

      await act(async () => {
        render(<CalibrationPage />)
      })

      expect(screen.getByTestId('calibration-camera-error')).toBeInTheDocument()

      // Reset getUserMedia to succeed on retry
      mockGetUserMedia.mockResolvedValueOnce({
        getTracks: () => [{ stop: vi.fn() }],
      })

      await user.click(screen.getByTestId('calibration-retry-btn'))

      // getUserMedia called on mount + retry
      expect(mockGetUserMedia).toHaveBeenCalledTimes(2)
      expect(mockReset).toHaveBeenCalledOnce()
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
})
