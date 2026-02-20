import type { CalibrationData } from '@/types/settings'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'

export interface CalibrationProgress {
  readonly progress: number // 0-1
  readonly complete: boolean
  readonly sampleCount: number
  readonly totalSamples: number
}

export interface CalibrationConfig {
  readonly totalSamples: number
}

export interface CalibrationResult {
  readonly baseline: CalibrationData
  readonly sampleStdDev: PostureAngles
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
  totalSamples: 30,
} as const
