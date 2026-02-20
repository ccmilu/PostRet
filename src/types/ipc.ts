import type { CalibrationData, PostureSettings } from './settings'

export interface PostureStatus {
  readonly isGood: boolean
  readonly violations: readonly PostureViolation[]
  readonly confidence: number
  readonly timestamp: number
}

export interface PostureViolation {
  readonly rule: PostureRule
  readonly severity: number
  readonly message: string
}

export type PostureRule =
  | 'FORWARD_HEAD'
  | 'SLOUCH'
  | 'HEAD_TILT'
  | 'TOO_CLOSE'
  | 'SHOULDER_ASYMMETRY'

export type AppStatus = 'detecting' | 'paused' | 'calibrating' | 'no-camera' | 'error'

export interface IpcApi {
  getSettings(): Promise<PostureSettings>
  setSettings(settings: PostureSettings): Promise<void>
  getStatus(): Promise<AppStatus>
  requestCameraPermission(): Promise<boolean>
  startCalibration(): Promise<void>
  completeCalibration(data: CalibrationData): Promise<void>
  onStatusChange(callback: (status: AppStatus) => void): () => void
  onPause(callback: () => void): () => void
  onResume(callback: () => void): () => void
}
