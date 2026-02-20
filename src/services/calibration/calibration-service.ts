import type { CalibrationData } from '@/types/settings'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'
import type {
  CalibrationConfig,
  CalibrationProgress,
  CalibrationResult,
} from './calibration-types'
import { DEFAULT_CALIBRATION_CONFIG } from './calibration-types'

const ANGLE_KEYS: ReadonlyArray<keyof PostureAngles> = [
  'headForwardAngle',
  'torsoAngle',
  'headTiltAngle',
  'faceFrameRatio',
  'shoulderDiff',
] as const

function computeMean(
  samples: readonly PostureAngles[],
  key: keyof PostureAngles,
): number {
  const sum = samples.reduce((acc, s) => acc + s[key], 0)
  return sum / samples.length
}

function computeStdDev(
  samples: readonly PostureAngles[],
  key: keyof PostureAngles,
  mean: number,
): number {
  const sumSquaredDiffs = samples.reduce(
    (acc, s) => acc + (s[key] - mean) ** 2,
    0,
  )
  return Math.sqrt(sumSquaredDiffs / samples.length)
}

export class CalibrationService {
  private readonly config: CalibrationConfig
  private samples: readonly PostureAngles[]

  constructor(config?: Partial<CalibrationConfig>) {
    this.config = {
      ...DEFAULT_CALIBRATION_CONFIG,
      ...config,
    }
    this.samples = []
  }

  addSample(angles: PostureAngles): CalibrationProgress {
    this.samples = [...this.samples, angles]
    return this.buildProgress()
  }

  computeBaseline(): CalibrationResult {
    if (this.samples.length === 0) {
      throw new Error('Cannot compute baseline: no samples collected')
    }

    const means = this.computeAllMeans()
    const stdDevs = this.computeAllStdDevs(means)

    const baseline: CalibrationData = {
      headForwardAngle: means.headForwardAngle,
      torsoAngle: means.torsoAngle,
      headTiltAngle: means.headTiltAngle,
      faceFrameRatio: means.faceFrameRatio,
      shoulderDiff: means.shoulderDiff,
      timestamp: Date.now(),
    }

    return { baseline, sampleStdDev: stdDevs }
  }

  reset(): void {
    this.samples = []
  }

  getProgress(): CalibrationProgress {
    return this.buildProgress()
  }

  private buildProgress(): CalibrationProgress {
    const { length } = this.samples
    const total = this.config.totalSamples
    return {
      progress: Math.min(length / total, 1),
      complete: length >= total,
      sampleCount: length,
      totalSamples: total,
    }
  }

  private computeAllMeans(): PostureAngles {
    return ANGLE_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: computeMean(this.samples, key) }),
      {} as PostureAngles,
    )
  }

  private computeAllStdDevs(means: PostureAngles): PostureAngles {
    return ANGLE_KEYS.reduce(
      (acc, key) => ({
        ...acc,
        [key]: computeStdDev(this.samples, key, means[key]),
      }),
      {} as PostureAngles,
    )
  }
}
