import { useRef, useEffect, useCallback } from 'react'
import { PoseLandmarkIndex } from '@/services/pose-detection/pose-types'

export interface NormalizedLandmark {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly visibility: number
}

export interface PosePreviewProps {
  readonly videoRef?: React.RefObject<HTMLVideoElement | null>
  readonly landmarks?: readonly NormalizedLandmark[][]
  readonly width?: number
  readonly height?: number
}

const VISIBILITY_THRESHOLD = 0.5

const POSE_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Face
  [PoseLandmarkIndex.LEFT_EAR, PoseLandmarkIndex.LEFT_EYE_OUTER],
  [PoseLandmarkIndex.LEFT_EYE_OUTER, PoseLandmarkIndex.LEFT_EYE],
  [PoseLandmarkIndex.LEFT_EYE, PoseLandmarkIndex.LEFT_EYE_INNER],
  [PoseLandmarkIndex.LEFT_EYE_INNER, PoseLandmarkIndex.NOSE],
  [PoseLandmarkIndex.NOSE, PoseLandmarkIndex.RIGHT_EYE_INNER],
  [PoseLandmarkIndex.RIGHT_EYE_INNER, PoseLandmarkIndex.RIGHT_EYE],
  [PoseLandmarkIndex.RIGHT_EYE, PoseLandmarkIndex.RIGHT_EYE_OUTER],
  [PoseLandmarkIndex.RIGHT_EYE_OUTER, PoseLandmarkIndex.RIGHT_EAR],
  [PoseLandmarkIndex.MOUTH_LEFT, PoseLandmarkIndex.MOUTH_RIGHT],
  // Torso (green)
  [PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.RIGHT_SHOULDER],
  [PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.LEFT_HIP],
  [PoseLandmarkIndex.RIGHT_SHOULDER, PoseLandmarkIndex.RIGHT_HIP],
  [PoseLandmarkIndex.LEFT_HIP, PoseLandmarkIndex.RIGHT_HIP],
  // Left arm (blue)
  [PoseLandmarkIndex.LEFT_SHOULDER, PoseLandmarkIndex.LEFT_ELBOW],
  [PoseLandmarkIndex.LEFT_ELBOW, PoseLandmarkIndex.LEFT_WRIST],
  [PoseLandmarkIndex.LEFT_WRIST, PoseLandmarkIndex.LEFT_PINKY],
  [PoseLandmarkIndex.LEFT_WRIST, PoseLandmarkIndex.LEFT_INDEX],
  [PoseLandmarkIndex.LEFT_WRIST, PoseLandmarkIndex.LEFT_THUMB],
  [PoseLandmarkIndex.LEFT_PINKY, PoseLandmarkIndex.LEFT_INDEX],
  // Right arm (red)
  [PoseLandmarkIndex.RIGHT_SHOULDER, PoseLandmarkIndex.RIGHT_ELBOW],
  [PoseLandmarkIndex.RIGHT_ELBOW, PoseLandmarkIndex.RIGHT_WRIST],
  [PoseLandmarkIndex.RIGHT_WRIST, PoseLandmarkIndex.RIGHT_PINKY],
  [PoseLandmarkIndex.RIGHT_WRIST, PoseLandmarkIndex.RIGHT_INDEX],
  [PoseLandmarkIndex.RIGHT_WRIST, PoseLandmarkIndex.RIGHT_THUMB],
  [PoseLandmarkIndex.RIGHT_PINKY, PoseLandmarkIndex.RIGHT_INDEX],
  // Left leg (blue)
  [PoseLandmarkIndex.LEFT_HIP, PoseLandmarkIndex.LEFT_KNEE],
  [PoseLandmarkIndex.LEFT_KNEE, PoseLandmarkIndex.LEFT_ANKLE],
  [PoseLandmarkIndex.LEFT_ANKLE, PoseLandmarkIndex.LEFT_HEEL],
  [PoseLandmarkIndex.LEFT_HEEL, PoseLandmarkIndex.LEFT_FOOT_INDEX],
  [PoseLandmarkIndex.LEFT_ANKLE, PoseLandmarkIndex.LEFT_FOOT_INDEX],
  // Right leg (red)
  [PoseLandmarkIndex.RIGHT_HIP, PoseLandmarkIndex.RIGHT_KNEE],
  [PoseLandmarkIndex.RIGHT_KNEE, PoseLandmarkIndex.RIGHT_ANKLE],
  [PoseLandmarkIndex.RIGHT_ANKLE, PoseLandmarkIndex.RIGHT_HEEL],
  [PoseLandmarkIndex.RIGHT_HEEL, PoseLandmarkIndex.RIGHT_FOOT_INDEX],
  [PoseLandmarkIndex.RIGHT_ANKLE, PoseLandmarkIndex.RIGHT_FOOT_INDEX],
]

const LEFT_SIDE_INDICES: Set<number> = new Set([
  PoseLandmarkIndex.LEFT_EAR,
  PoseLandmarkIndex.LEFT_EYE_INNER,
  PoseLandmarkIndex.LEFT_EYE,
  PoseLandmarkIndex.LEFT_EYE_OUTER,
  PoseLandmarkIndex.LEFT_SHOULDER,
  PoseLandmarkIndex.LEFT_ELBOW,
  PoseLandmarkIndex.LEFT_WRIST,
  PoseLandmarkIndex.LEFT_PINKY,
  PoseLandmarkIndex.LEFT_INDEX,
  PoseLandmarkIndex.LEFT_THUMB,
  PoseLandmarkIndex.LEFT_HIP,
  PoseLandmarkIndex.LEFT_KNEE,
  PoseLandmarkIndex.LEFT_ANKLE,
  PoseLandmarkIndex.LEFT_HEEL,
  PoseLandmarkIndex.LEFT_FOOT_INDEX,
])

const RIGHT_SIDE_INDICES: Set<number> = new Set([
  PoseLandmarkIndex.RIGHT_EAR,
  PoseLandmarkIndex.RIGHT_EYE_INNER,
  PoseLandmarkIndex.RIGHT_EYE,
  PoseLandmarkIndex.RIGHT_EYE_OUTER,
  PoseLandmarkIndex.RIGHT_SHOULDER,
  PoseLandmarkIndex.RIGHT_ELBOW,
  PoseLandmarkIndex.RIGHT_WRIST,
  PoseLandmarkIndex.RIGHT_PINKY,
  PoseLandmarkIndex.RIGHT_INDEX,
  PoseLandmarkIndex.RIGHT_THUMB,
  PoseLandmarkIndex.RIGHT_HIP,
  PoseLandmarkIndex.RIGHT_KNEE,
  PoseLandmarkIndex.RIGHT_ANKLE,
  PoseLandmarkIndex.RIGHT_HEEL,
  PoseLandmarkIndex.RIGHT_FOOT_INDEX,
])

const TORSO_INDICES: Set<number> = new Set([
  PoseLandmarkIndex.LEFT_SHOULDER,
  PoseLandmarkIndex.RIGHT_SHOULDER,
  PoseLandmarkIndex.LEFT_HIP,
  PoseLandmarkIndex.RIGHT_HIP,
])

const COLOR_LEFT = 'rgba(66, 133, 244, 0.8)'   // blue
const COLOR_RIGHT = 'rgba(234, 67, 53, 0.8)'    // red
const COLOR_TORSO = 'rgba(52, 168, 83, 0.8)'    // green
const COLOR_FACE = 'rgba(255, 255, 255, 0.6)'   // white

const POINT_RADIUS = 4
const LINE_WIDTH = 2

function getConnectionColor(startIdx: number, endIdx: number): string {
  if (TORSO_INDICES.has(startIdx) && TORSO_INDICES.has(endIdx)) {
    return COLOR_TORSO
  }
  if (LEFT_SIDE_INDICES.has(startIdx) && LEFT_SIDE_INDICES.has(endIdx)) {
    return COLOR_LEFT
  }
  if (RIGHT_SIDE_INDICES.has(startIdx) && RIGHT_SIDE_INDICES.has(endIdx)) {
    return COLOR_RIGHT
  }
  return COLOR_FACE
}

function getPointColor(idx: number): string {
  if (TORSO_INDICES.has(idx)) return COLOR_TORSO
  if (LEFT_SIDE_INDICES.has(idx)) return COLOR_LEFT
  if (RIGHT_SIDE_INDICES.has(idx)) return COLOR_RIGHT
  return COLOR_FACE
}

export function PosePreview({
  videoRef,
  landmarks,
  width = 640,
  height = 480,
}: PosePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  const drawSkeleton = useCallback(
    (ctx: CanvasRenderingContext2D, pose: readonly NormalizedLandmark[]) => {
      const w = ctx.canvas.width
      const h = ctx.canvas.height

      // Draw connections
      for (const [startIdx, endIdx] of POSE_CONNECTIONS) {
        const start = pose[startIdx]
        const end = pose[endIdx]
        if (!start || !end) continue
        if (start.visibility < VISIBILITY_THRESHOLD || end.visibility < VISIBILITY_THRESHOLD) {
          continue
        }

        ctx.beginPath()
        ctx.strokeStyle = getConnectionColor(startIdx, endIdx)
        ctx.lineWidth = LINE_WIDTH
        ctx.moveTo(start.x * w, start.y * h)
        ctx.lineTo(end.x * w, end.y * h)
        ctx.stroke()
      }

      // Draw points
      for (let i = 0; i < pose.length; i++) {
        const landmark = pose[i]
        if (!landmark || landmark.visibility < VISIBILITY_THRESHOLD) continue

        ctx.beginPath()
        ctx.fillStyle = getPointColor(i)
        ctx.arc(landmark.x * w, landmark.y * h, POINT_RADIUS, 0, 2 * Math.PI)
        ctx.fill()
      }
    },
    [],
  )

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw video frame if available
    const video = videoRef?.current
    if (video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    }

    // Draw skeleton overlays
    if (landmarks && landmarks.length > 0) {
      for (const pose of landmarks) {
        drawSkeleton(ctx, pose)
      }
    }

    animFrameRef.current = requestAnimationFrame(drawFrame)
  }, [videoRef, landmarks, drawSkeleton])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawFrame)
    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [drawFrame])

  const hasVideo = videoRef?.current != null

  return (
    <div className="pose-preview" data-testid="pose-preview">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="pose-preview-canvas"
        data-testid="pose-preview-canvas"
      />
      {!hasVideo && (
        <div className="pose-preview-placeholder" data-testid="pose-preview-placeholder">
          <svg
            className="pose-preview-camera-icon"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <span className="pose-preview-placeholder-text">
            等待摄像头...
          </span>
        </div>
      )}
    </div>
  )
}
