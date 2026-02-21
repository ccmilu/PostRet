/**
 * Integration test: CalibrationPage video element stability across step transitions.
 *
 * WHY THIS TEST EXISTS:
 * A previous bug (Bug #2) was caused by CalibrationPage conditionally rendering
 * two different <video> elements for different steps. When switching from step 1
 * to step 2, the old video unmounted and a new one mounted, but the stream was
 * still bound to the old element's srcObject. The new video had no stream, so
 * PoseDetector.detect() saw readyState=0 and returned null -> "未检测到人脸".
 *
 * WHY PREVIOUS TESTS DIDN'T CATCH IT:
 * - Unit tests only checked video visibility per step (toBeInTheDocument / not),
 *   never verified the DOM identity (same node) or srcObject binding.
 * - useCalibrationWizard tests mock the videoRef entirely, so the ref switching
 *   never happens in those tests.
 * - E2E tests use fake camera streams (Chromium flag) where the race may not
 *   reproduce, or the WASM PoseDetector fails first masking the real issue.
 *
 * THIS TEST:
 * - Renders CalibrationPage with a mock useCalibrationWizard (for step control)
 *   but does NOT mock the CalibrationPage's own rendering logic or video elements.
 * - Simulates step transitions via rerender and verifies:
 *   1. The video DOM element is the SAME instance across all steps (ref identity).
 *   2. The stream bound via srcObject survives step 1->2->3->4 transitions.
 * - Would have FAILED with the old two-video conditional rendering approach.
 */
import { render, screen, act } from '@testing-library/react'
import type { WizardStep } from '@/hooks/useCalibrationWizard'
import type { PositionCheckResult } from '@/components/calibration/position-check'
import { CalibrationPage } from '@/components/calibration/CalibrationPage'

// --- Mock useCalibrationWizard (step control only) ---

let mockStep: WizardStep = 'welcome'
let mockStepNumber = 1

vi.mock('@/hooks/useCalibrationWizard', () => ({
  useCalibrationWizard: () => ({
    step: mockStep,
    stepNumber: mockStepNumber,
    progress: 0,
    error: null,
    positionResult: {
      status: 'no_face',
      message: '未检测到人脸',
    } as PositionCheckResult,
    canContinue: false,
    landmarks: undefined,
    angleIndex: 0,
    currentAngleLabel: 90,
    goToStep2: vi.fn(),
    goToStep3: vi.fn(),
    startAngleCollect: vi.fn(),
    goBackToStep1: vi.fn(),
    recalibrate: vi.fn(),
    confirm: vi.fn(),
  }),
  TOTAL_ANGLES: 3,
}))

// --- Mock camera (getUserMedia) ---

const mockTrack = { stop: vi.fn(), kind: 'video', enabled: true }
const mockStream = {
  getTracks: () => [mockTrack],
  getVideoTracks: () => [mockTrack],
  getAudioTracks: () => [],
  addTrack: vi.fn(),
  removeTrack: vi.fn(),
  clone: vi.fn(),
  active: true,
  id: 'mock-stream',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn().mockReturnValue(true),
  onaddtrack: null,
  onremovetrack: null,
} as unknown as MediaStream

// Helper to set step with proper stepNumber
function setMockStep(step: WizardStep) {
  mockStep = step
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

describe('CalibrationPage video element stability (integration)', () => {
  it('video DOM element identity is preserved across step welcome->position-check->collect->confirm transitions', async () => {
    // welcome: render
    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    // Wait for camera to initialize
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    const videoStep1 = screen.getByTestId('calibration-video') as HTMLVideoElement

    // position-check: rerender
    setMockStep('position-check')
    await act(async () => {
      rerender(<CalibrationPage />)
    })

    const videoStep2 = screen.getByTestId('calibration-video') as HTMLVideoElement

    // CRITICAL ASSERTION: same DOM node, not a new element
    expect(videoStep2).toBe(videoStep1)

    // collect: rerender
    setMockStep('collect')
    await act(async () => {
      rerender(<CalibrationPage />)
    })

    const videoStep3 = screen.getByTestId('calibration-video') as HTMLVideoElement
    expect(videoStep3).toBe(videoStep1)

    // confirm: rerender
    setMockStep('confirm')
    await act(async () => {
      rerender(<CalibrationPage />)
    })

    const videoStep4 = screen.getByTestId('calibration-video') as HTMLVideoElement
    expect(videoStep4).toBe(videoStep1)
  })

  it('video.srcObject retains stream binding after welcome->position-check transition', async () => {
    // welcome: render + camera init
    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    // Wait for startCamera() to complete (getUserMedia + play)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    const videoStep1 = screen.getByTestId('calibration-video') as HTMLVideoElement

    // After camera init, srcObject should be the mock stream
    expect(videoStep1.srcObject).toBe(mockStream)

    // position-check: rerender
    setMockStep('position-check')
    await act(async () => {
      rerender(<CalibrationPage />)
    })

    const videoStep2 = screen.getByTestId('calibration-video') as HTMLVideoElement

    // CRITICAL: srcObject must still be bound to the stream
    // With the old two-video approach, this would be null because the
    // step 2 video is a new DOM element that never had srcObject set.
    expect(videoStep2.srcObject).toBe(mockStream)
  })

  it('video.srcObject retains stream through full step cycle welcome->position-check->collect->confirm->welcome', async () => {
    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })

    const video = screen.getByTestId('calibration-video') as HTMLVideoElement
    expect(video.srcObject).toBe(mockStream)

    // Cycle through all steps
    const steps: WizardStep[] = ['position-check', 'collect', 'confirm', 'welcome']
    for (const step of steps) {
      setMockStep(step)
      await act(async () => {
        rerender(<CalibrationPage />)
      })

      const currentVideo = screen.getByTestId('calibration-video') as HTMLVideoElement
      // Same DOM node
      expect(currentVideo).toBe(video)
      // Stream still bound (not cleared until unmount or explicit stop)
      // On confirm the confirm handler would call stopCamera, but we're
      // not clicking confirm here, just rendering different steps.
      expect(currentVideo.srcObject).toBe(mockStream)
    }
  })

  it('stream is bound even if getUserMedia resolves after step transition', async () => {
    // Simulate slow camera: getUserMedia takes time
    let resolveGetUserMedia: ((stream: MediaStream) => void) | null = null
    ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveGetUserMedia = resolve
        }),
    )

    const { rerender } = await act(async () => {
      return render(<CalibrationPage />)
    })

    // Camera is still pending. Switch to position-check.
    setMockStep('position-check')
    await act(async () => {
      rerender(<CalibrationPage />)
    })

    const video = screen.getByTestId('calibration-video') as HTMLVideoElement
    // srcObject is not set because camera hasn't resolved yet
    expect(video.srcObject == null).toBe(true)

    // Now resolve the camera
    await act(async () => {
      resolveGetUserMedia?.(mockStream)
      await vi.advanceTimersByTimeAsync(0)
    })

    // After resolution, the SAME video element should have srcObject set
    // because videoRef.current still points to this element
    expect(video.srcObject).toBe(mockStream)
  })
})
