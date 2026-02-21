/**
 * Integration test: Video element stability through full multi-angle calibration flow.
 *
 * WHY THIS TEST EXISTS:
 * The multi-angle flow introduces new step transitions:
 *   angle-instruction → collect (repeated 3 times)
 * Each transition must preserve the video DOM element identity and stream binding.
 * The angle-instruction step also shows the video, so the container visibility
 * must be correct through the entire [angle-instruction → collect] × 3 cycle.
 *
 * NON-MOCK aspects:
 *   - CalibrationPage's JSX rendering and DOM structure are real
 *   - Video DOM element identity (same HTMLVideoElement node) verified through 3 angles
 *   - Stream binding (srcObject) persistence verified through all angle cycles
 *   - CSS visibility class toggling verified for angle-instruction step
 *
 * MOCK aspects:
 *   - useCalibrationWizard hook mocked for step/angle control
 *   - navigator.mediaDevices.getUserMedia mocked
 */
import { render, screen, act } from '@testing-library/react'
import type { WizardStep } from '@/hooks/useCalibrationWizard'
import type { PositionCheckResult } from '@/components/calibration/position-check'
import { CalibrationPage } from '@/components/calibration/CalibrationPage'

// ─── Mock useCalibrationWizard (step + angle control only) ───

let mockStep: WizardStep = 'welcome'
let mockStepNumber = 1
let mockAngleIndex = 0
let mockCurrentAngleLabel = 90
let mockProgress = 0

vi.mock('@/hooks/useCalibrationWizard', () => ({
  useCalibrationWizard: () => ({
    step: mockStep,
    stepNumber: mockStepNumber,
    progress: mockProgress,
    error: null,
    positionResult: {
      status: 'no_face',
      message: '未检测到人脸',
    } as PositionCheckResult,
    canContinue: false,
    landmarks: undefined,
    angleIndex: mockAngleIndex,
    currentAngleLabel: mockCurrentAngleLabel,
    goToStep2: vi.fn(),
    goToStep3: vi.fn(),
    startAngleCollect: vi.fn(),
    goBackToStep1: vi.fn(),
    recalibrate: vi.fn(),
    confirm: vi.fn(),
  }),
  TOTAL_ANGLES: 3,
}))

// ─── Camera mock ───

const mockTrack = { stop: vi.fn(), kind: 'video', enabled: true }
const mockStream = {
  getTracks: () => [mockTrack],
  getVideoTracks: () => [mockTrack],
  getAudioTracks: () => [],
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
  clone: vi.fn(),
  active: true,
  id: 'mock-stream-multi-angle',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn().mockReturnValue(true),
  onaddtrack: null,
  onremovetrack: null,
} as unknown as MediaStream

function setMockStep(step: WizardStep, angleIndex = 0) {
  mockStep = step
  mockAngleIndex = angleIndex
  const labels = [90, 110, 130]
  mockCurrentAngleLabel = labels[angleIndex] ?? 90

  switch (step) {
    case 'welcome': mockStepNumber = 1; break
    case 'position-check': mockStepNumber = 2; break
    case 'angle-instruction':
    case 'collect': mockStepNumber = 3; break
    case 'confirm': mockStepNumber = 4; break
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  setMockStep('welcome')
  mockProgress = 0
  mockTrack.stop.mockClear()

  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
    writable: true,
    configurable: true,
  })

  HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)

  vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(1)
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockReturnValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Multi-angle video element stability (integration)', () => {
  it('video DOM element identity is preserved through full 3-angle cycle including angle-instruction steps', async () => {
    // Start at welcome, init camera
    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    const video = screen.getByTestId('calibration-video') as HTMLVideoElement

    // Full multi-angle step sequence
    const stepSequence: Array<{ step: WizardStep; angleIndex: number }> = [
      { step: 'position-check', angleIndex: 0 },
      { step: 'angle-instruction', angleIndex: 0 },
      { step: 'collect', angleIndex: 0 },
      { step: 'angle-instruction', angleIndex: 1 },
      { step: 'collect', angleIndex: 1 },
      { step: 'angle-instruction', angleIndex: 2 },
      { step: 'collect', angleIndex: 2 },
      { step: 'confirm', angleIndex: 2 },
    ]

    for (const { step, angleIndex } of stepSequence) {
      setMockStep(step, angleIndex)
      await act(async () => {
        rerender(<CalibrationPage />)
      })

      const currentVideo = screen.getByTestId('calibration-video') as HTMLVideoElement
      // CRITICAL: Same DOM node throughout
      expect(currentVideo).toBe(video)
    }
  })

  it('video.srcObject retains stream binding through all 3 angle cycles', async () => {
    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    const video = screen.getByTestId('calibration-video') as HTMLVideoElement
    expect(video.srcObject).toBe(mockStream)

    // Cycle through 3 angles with angle-instruction + collect pairs
    for (let i = 0; i < 3; i++) {
      setMockStep('angle-instruction', i)
      await act(async () => {
        rerender(<CalibrationPage />)
      })
      expect(video.srcObject).toBe(mockStream)

      setMockStep('collect', i)
      mockProgress = 0.5
      await act(async () => {
        rerender(<CalibrationPage />)
      })
      expect(video.srcObject).toBe(mockStream)
    }

    // Confirm step
    setMockStep('confirm', 2)
    await act(async () => {
      rerender(<CalibrationPage />)
    })
    expect(video.srcObject).toBe(mockStream)
  })

  it('video container visibility is correct for angle-instruction step (visible)', async () => {
    setMockStep('angle-instruction', 0)

    await act(async () => {
      render(<CalibrationPage />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const video = screen.getByTestId('calibration-video')
    const container = video.closest('.calibration-preview-container')
    expect(container).not.toHaveClass('calibration-preview-hidden')
  })

  it('video container visibility toggles correctly through angle-instruction → collect → angle-instruction transitions', async () => {
    // All three steps should show video
    setMockStep('angle-instruction', 0)

    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const video = screen.getByTestId('calibration-video')
    const container = video.closest('.calibration-preview-container')

    // angle-instruction: visible
    expect(container).not.toHaveClass('calibration-preview-hidden')

    // collect: visible
    setMockStep('collect', 0)
    mockProgress = 0.5
    await act(async () => {
      rerender(<CalibrationPage />)
    })
    expect(container).not.toHaveClass('calibration-preview-hidden')

    // next angle-instruction: still visible
    setMockStep('angle-instruction', 1)
    await act(async () => {
      rerender(<CalibrationPage />)
    })
    expect(container).not.toHaveClass('calibration-preview-hidden')
  })

  it('video container is hidden on welcome, shown during angles, hidden on confirm', async () => {
    setMockStep('welcome')

    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const video = screen.getByTestId('calibration-video')
    const container = video.closest('.calibration-preview-container')

    // welcome: hidden
    expect(container).toHaveClass('calibration-preview-hidden')

    // angle-instruction: visible
    setMockStep('angle-instruction', 0)
    await act(async () => {
      rerender(<CalibrationPage />)
    })
    expect(container).not.toHaveClass('calibration-preview-hidden')

    // collect: visible
    setMockStep('collect', 0)
    mockProgress = 0.7
    await act(async () => {
      rerender(<CalibrationPage />)
    })
    expect(container).not.toHaveClass('calibration-preview-hidden')

    // confirm: hidden
    setMockStep('confirm', 2)
    await act(async () => {
      rerender(<CalibrationPage />)
    })
    expect(container).toHaveClass('calibration-preview-hidden')
  })
})
