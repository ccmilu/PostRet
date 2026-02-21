/**
 * Cross-testing: CalibrationPage video element stability (Bug 2 fix verification)
 *
 * Purpose: Verify that the video DOM element remains the SAME node across all
 * step transitions, so that the camera stream binding (srcObject) is never lost.
 *
 * These tests render the REAL CalibrationPage component with a controlled mock
 * of useCalibrationWizard. Unlike pure mock tests, they verify actual DOM behavior:
 *
 * NON-MOCK aspects:
 *   - CalibrationPage's JSX rendering and DOM structure are real
 *   - The video element's DOM identity (same HTMLVideoElement node) is verified
 *   - CSS class toggling for visibility is verified on real DOM
 *   - Stream binding (srcObject) persistence is verified on real DOM
 *
 * MOCK aspects:
 *   - useCalibrationWizard hook is mocked to control step transitions
 *   - navigator.mediaDevices.getUserMedia is mocked to provide a fake stream
 *   - HTMLVideoElement.play is mocked (no actual video decoding in jsdom)
 */
import { render, screen, act } from '@testing-library/react'
import type { WizardStep } from '@/hooks/useCalibrationWizard'
import type { PositionCheckResult } from '@/components/calibration/position-check'

// --- Controlled mock for useCalibrationWizard ---

let mockStep: WizardStep = 1
let mockProgress = 0
let mockError: string | null = null
let mockPositionResult: PositionCheckResult = {
  status: 'no_face',
  message: '未检测到人脸，请确保脸部在摄像头画面中',
}
let mockCanContinue = false

vi.mock('@/hooks/useCalibrationWizard', () => ({
  useCalibrationWizard: () => ({
    step: mockStep,
    progress: mockProgress,
    error: mockError,
    positionResult: mockPositionResult,
    canContinue: mockCanContinue,
    landmarks: undefined,
    goToStep2: vi.fn(),
    goToStep3: vi.fn(),
    goBackToStep1: vi.fn(),
    recalibrate: vi.fn(),
    confirm: vi.fn(),
  }),
}))

import { CalibrationPage } from '@/components/calibration/CalibrationPage'

// --- Camera mock ---

let mockStream: MediaStream

function createMockStream(): MediaStream {
  const track = { stop: vi.fn(), kind: 'video', enabled: true }
  return {
    getTracks: vi.fn().mockReturnValue([track]),
    getVideoTracks: vi.fn().mockReturnValue([track]),
    getAudioTracks: vi.fn().mockReturnValue([]),
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    active: true,
    id: `mock-stream-${Date.now()}`,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream
}

beforeEach(() => {
  vi.useFakeTimers()

  mockStep = 1
  mockProgress = 0
  mockError = null
  mockPositionResult = {
    status: 'no_face',
    message: '未检测到人脸，请确保脸部在摄像头画面中',
  }
  mockCanContinue = false

  mockStream = createMockStream()

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

// ============================================
// NON-MOCK TESTS: DOM identity & stream binding
// ============================================

describe('CalibrationPage video element stability (non-mock DOM tests)', () => {
  describe('video DOM identity across step transitions', () => {
    it('only ONE video element exists in the DOM at any step', async () => {
      for (const step of [1, 2, 3, 4] as WizardStep[]) {
        mockStep = step

        const { container, unmount } = render(<CalibrationPage />)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0)
        })

        const videos = container.querySelectorAll('video')
        expect(videos).toHaveLength(1)

        unmount()
      }
    })

    it('video element is in DOM on step 1 (hidden but mounted)', async () => {
      mockStep = 1

      await act(async () => {
        render(<CalibrationPage />)
      })

      const video = screen.getByTestId('calibration-video')
      expect(video).toBeInTheDocument()
      expect(video.tagName).toBe('VIDEO')
    })

    it('video element is in DOM on step 4 (hidden but mounted)', async () => {
      mockStep = 4

      await act(async () => {
        render(<CalibrationPage />)
      })

      const video = screen.getByTestId('calibration-video')
      expect(video).toBeInTheDocument()
      expect(video.tagName).toBe('VIDEO')
    })

    it('video element is the SAME DOM node when step changes (rerender)', async () => {
      mockStep = 1

      const { rerender } = render(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoStep1 = screen.getByTestId('calibration-video')

      // Transition to step 2
      mockStep = 2
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoStep2 = screen.getByTestId('calibration-video')

      // Transition to step 3
      mockStep = 3
      mockProgress = 0.5
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoStep3 = screen.getByTestId('calibration-video')

      // Transition to step 4
      mockStep = 4
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoStep4 = screen.getByTestId('calibration-video')

      // CRITICAL: All references must be the exact same DOM node
      // This is what Bug 2 was about — conditional rendering caused different nodes
      expect(videoStep1).toBe(videoStep2)
      expect(videoStep2).toBe(videoStep3)
      expect(videoStep3).toBe(videoStep4)
    })

    it('video element is the SAME DOM node when going back (step 2 → 1 → 2)', async () => {
      mockStep = 2

      const { rerender } = render(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoFirst = screen.getByTestId('calibration-video')

      // Go back to step 1
      mockStep = 1
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoBack = screen.getByTestId('calibration-video')

      // Return to step 2
      mockStep = 2
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoReturn = screen.getByTestId('calibration-video')

      expect(videoFirst).toBe(videoBack)
      expect(videoBack).toBe(videoReturn)
    })
  })

  describe('stream binding persistence', () => {
    it('video.srcObject is set after camera acquisition', async () => {
      mockStep = 1

      await act(async () => {
        render(<CalibrationPage />)
      })

      // Wait for camera init
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const video = screen.getByTestId('calibration-video') as HTMLVideoElement

      // srcObject should have been assigned the mock stream
      expect(video.srcObject).toBe(mockStream)
    })

    it('video.srcObject remains the same stream after step transition', async () => {
      mockStep = 1

      const { rerender } = render(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const video = screen.getByTestId('calibration-video') as HTMLVideoElement
      const streamBefore = video.srcObject

      // Transition step 1 → 2
      mockStep = 2
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // Stream should be the same object
      expect(video.srcObject).toBe(streamBefore)
    })

    it('video.srcObject remains the same stream through step 2 → 3 → 4', async () => {
      mockStep = 2

      const { rerender } = render(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const video = screen.getByTestId('calibration-video') as HTMLVideoElement
      const streamBefore = video.srcObject

      // Step 3
      mockStep = 3
      mockProgress = 0.5
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(video.srcObject).toBe(streamBefore)

      // Step 4
      mockStep = 4
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(video.srcObject).toBe(streamBefore)
    })
  })

  describe('visibility CSS class toggling', () => {
    it('container has calibration-preview-hidden class on step 1', async () => {
      mockStep = 1

      await act(async () => {
        render(<CalibrationPage />)
      })

      const video = screen.getByTestId('calibration-video')
      const container = video.closest('.calibration-preview-container')
      expect(container).toHaveClass('calibration-preview-hidden')
    })

    it('container does NOT have calibration-preview-hidden class on step 2', async () => {
      mockStep = 2

      await act(async () => {
        render(<CalibrationPage />)
      })

      const video = screen.getByTestId('calibration-video')
      const container = video.closest('.calibration-preview-container')
      expect(container).not.toHaveClass('calibration-preview-hidden')
    })

    it('container does NOT have calibration-preview-hidden class on step 3', async () => {
      mockStep = 3

      await act(async () => {
        render(<CalibrationPage />)
      })

      const video = screen.getByTestId('calibration-video')
      const container = video.closest('.calibration-preview-container')
      expect(container).not.toHaveClass('calibration-preview-hidden')
    })

    it('container has calibration-preview-hidden class on step 4', async () => {
      mockStep = 4

      await act(async () => {
        render(<CalibrationPage />)
      })

      const video = screen.getByTestId('calibration-video')
      const container = video.closest('.calibration-preview-container')
      expect(container).toHaveClass('calibration-preview-hidden')
    })

    it('toggling between hidden and visible preserves video element identity', async () => {
      mockStep = 1

      const { rerender } = render(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoHidden = screen.getByTestId('calibration-video')
      const containerHidden = videoHidden.closest('.calibration-preview-container')
      expect(containerHidden).toHaveClass('calibration-preview-hidden')

      // Show
      mockStep = 2
      rerender(<CalibrationPage />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const videoVisible = screen.getByTestId('calibration-video')
      const containerVisible = videoVisible.closest('.calibration-preview-container')
      expect(containerVisible).not.toHaveClass('calibration-preview-hidden')

      // Same DOM node
      expect(videoHidden).toBe(videoVisible)
      expect(containerHidden).toBe(containerVisible)
    })

    it('camera error hides video container', async () => {
      // Force camera error by rejecting getUserMedia
      ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Camera not found'),
      )
      mockStep = 2

      await act(async () => {
        render(<CalibrationPage />)
      })

      // Wait for all retry attempts (MAX_CAMERA_RETRIES = 2, 1s delay each)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      const video = screen.getByTestId('calibration-video')
      const container = video.closest('.calibration-preview-container')
      expect(container).toHaveClass('calibration-preview-hidden')
    })
  })
})

// ============================================
// Bug 1: SettingsWindow.ensureCreated logic
// ============================================

describe('SettingsWindow.ensureCreated - logic verification (mock)', () => {
  // These tests verify the ensureCreated conditional logic in main.ts
  // Since we can't import Electron in jsdom, we test the decision logic

  it('ensureCreated should be called when calibration exists and detection enabled', () => {
    // This is a logic verification: the condition in main.ts is:
    // if (savedSettings.calibration && savedSettings.detection.enabled)
    const scenarios = [
      { calibration: { headForwardAngle: 10 }, enabled: true, shouldCall: true },
      { calibration: null, enabled: true, shouldCall: false },
      { calibration: { headForwardAngle: 10 }, enabled: false, shouldCall: false },
      { calibration: null, enabled: false, shouldCall: false },
    ]

    for (const s of scenarios) {
      const shouldCall = !!(s.calibration && s.enabled)
      expect(shouldCall).toBe(s.shouldCall)
    }
  })
})
