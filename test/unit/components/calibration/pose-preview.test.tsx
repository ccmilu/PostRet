import { render, screen } from '@testing-library/react'
import { PosePreview } from '@/components/calibration/PosePreview'
import type { NormalizedLandmark } from '@/components/calibration/PosePreview'
import { createRef } from 'react'

function createMockLandmark(
  x: number,
  y: number,
  z = 0,
  visibility = 1.0,
): NormalizedLandmark {
  return { x, y, z, visibility }
}

function createMockPose(): NormalizedLandmark[] {
  return Array.from({ length: 33 }, (_, i) =>
    createMockLandmark(0.3 + (i % 5) * 0.1, 0.2 + Math.floor(i / 5) * 0.1),
  )
}

// Mock requestAnimationFrame / cancelAnimationFrame
let rafCallback: FrameRequestCallback | null = null
const originalRaf = globalThis.requestAnimationFrame
const originalCaf = globalThis.cancelAnimationFrame

beforeEach(() => {
  rafCallback = null
  globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    rafCallback = cb
    return 1
  })
  globalThis.cancelAnimationFrame = vi.fn()
})

afterEach(() => {
  globalThis.requestAnimationFrame = originalRaf
  globalThis.cancelAnimationFrame = originalCaf
})

describe('PosePreview', () => {
  it('renders a canvas element', () => {
    render(<PosePreview />)

    const canvas = screen.getByTestId('pose-preview-canvas')
    expect(canvas).toBeInTheDocument()
    expect(canvas.tagName).toBe('CANVAS')
  })

  it('renders with default dimensions', () => {
    render(<PosePreview />)

    const canvas = screen.getByTestId('pose-preview-canvas')
    expect(canvas).toHaveAttribute('width', '640')
    expect(canvas).toHaveAttribute('height', '480')
  })

  it('renders with custom dimensions', () => {
    render(<PosePreview width={320} height={240} />)

    const canvas = screen.getByTestId('pose-preview-canvas')
    expect(canvas).toHaveAttribute('width', '320')
    expect(canvas).toHaveAttribute('height', '240')
  })

  it('shows placeholder when no videoRef is provided', () => {
    render(<PosePreview />)

    const placeholder = screen.getByTestId('pose-preview-placeholder')
    expect(placeholder).toBeInTheDocument()
    expect(screen.getByText('等待摄像头...')).toBeInTheDocument()
  })

  it('shows placeholder when videoRef.current is null', () => {
    const videoRef = createRef<HTMLVideoElement>()

    render(<PosePreview videoRef={videoRef} />)

    const placeholder = screen.getByTestId('pose-preview-placeholder')
    expect(placeholder).toBeInTheDocument()
  })

  it('starts animation frame loop on mount', () => {
    render(<PosePreview />)

    expect(globalThis.requestAnimationFrame).toHaveBeenCalled()
  })

  it('cancels animation frame on unmount', () => {
    const { unmount } = render(<PosePreview />)

    unmount()

    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled()
  })

  it('renders pose-preview container with data-testid', () => {
    render(<PosePreview />)

    expect(screen.getByTestId('pose-preview')).toBeInTheDocument()
  })

  it('renders canvas with skeleton when landmarks are provided', () => {
    const mockPose = createMockPose()

    render(<PosePreview landmarks={[mockPose]} />)

    const canvas = screen.getByTestId('pose-preview-canvas')
    expect(canvas).toBeInTheDocument()

    // Trigger the raf callback to verify drawing doesn't throw
    if (rafCallback) {
      expect(() => rafCallback!(performance.now())).not.toThrow()
    }
  })

  it('handles multiple poses in landmarks array', () => {
    const pose1 = createMockPose()
    const pose2 = createMockPose()

    render(<PosePreview landmarks={[pose1, pose2]} />)

    const canvas = screen.getByTestId('pose-preview-canvas')
    expect(canvas).toBeInTheDocument()

    if (rafCallback) {
      expect(() => rafCallback!(performance.now())).not.toThrow()
    }
  })

  it('handles empty landmarks array', () => {
    render(<PosePreview landmarks={[]} />)

    const canvas = screen.getByTestId('pose-preview-canvas')
    expect(canvas).toBeInTheDocument()

    if (rafCallback) {
      expect(() => rafCallback!(performance.now())).not.toThrow()
    }
  })

  it('handles landmarks with low visibility (below threshold)', () => {
    const lowVisibilityPose = Array.from({ length: 33 }, () =>
      createMockLandmark(0.5, 0.5, 0, 0.1),
    )

    render(<PosePreview landmarks={[lowVisibilityPose]} />)

    if (rafCallback) {
      expect(() => rafCallback!(performance.now())).not.toThrow()
    }
  })
})
