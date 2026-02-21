import type { CalibrationData, ScreenAngleCalibrationPoint } from '@/types/settings'
import type { PostureAngles } from '@/services/posture-analysis/posture-types'
import type { ScreenAngleSignals } from './screen-angle-estimator'
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
  'faceY',
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

interface AngleCollectionEntry {
  readonly label: number
  readonly samples: readonly PostureAngles[]
  readonly signalSamples: readonly ScreenAngleSignals[]
}

export class CalibrationService {
  private readonly config: CalibrationConfig
  private samples: readonly PostureAngles[]
  private signalSamples: readonly ScreenAngleSignals[]
  private angleCollections: readonly AngleCollectionEntry[]
  private currentAngleLabel: number | null

  constructor(config?: Partial<CalibrationConfig>) {
    this.config = {
      ...DEFAULT_CALIBRATION_CONFIG,
      ...config,
    }
    this.samples = []
    this.signalSamples = []
    this.angleCollections = []
    this.currentAngleLabel = null
  }

  addSample(
    angles: PostureAngles,
    screenAngleSignals?: ScreenAngleSignals,
  ): CalibrationProgress {
    this.samples = [...this.samples, angles]
    if (screenAngleSignals !== undefined) {
      this.signalSamples = [...this.signalSamples, screenAngleSignals]
    }
    return this.buildProgress()
  }

  startAngleCollection(label: number): void {
    this.currentAngleLabel = label
    this.samples = []
    this.signalSamples = []
  }

  completeCurrentAngle(): void {
    if (this.currentAngleLabel === null) {
      throw new Error('No angle collection in progress')
    }
    if (this.samples.length === 0) {
      throw new Error('Cannot complete angle: no samples collected')
    }

    const entry: AngleCollectionEntry = {
      label: this.currentAngleLabel,
      samples: this.samples,
      signalSamples: this.signalSamples,
    }

    this.angleCollections = [...this.angleCollections, entry]
    this.currentAngleLabel = null
    this.samples = []
    this.signalSamples = []
  }

  computeMultiAngleBaseline(): CalibrationResult & {
    readonly screenAngleReferences: readonly ScreenAngleCalibrationPoint[]
  } {
    if (this.angleCollections.length === 0) {
      throw new Error('Cannot compute multi-angle baseline: no angle collections')
    }

    // Use the first angle's samples as baseline posture (should be ~90deg, most natural)
    const firstCollection = this.angleCollections[0]
    const means = this.computeMeansFromSamples(firstCollection.samples)
    const stdDevs = this.computeStdDevsFromSamples(firstCollection.samples, means)

    // Build screen angle references from each collection
    const screenAngleReferences: readonly ScreenAngleCalibrationPoint[] =
      this.angleCollections.map((collection) => {
        const avgSignals = this.computeAverageSignals(collection.signalSamples)
        return {
          angle: collection.label,
          signals: avgSignals,
        }
      })

    const baseline: CalibrationData = {
      headForwardAngle: means.headForwardAngle,
      torsoAngle: means.torsoAngle,
      headTiltAngle: means.headTiltAngle,
      faceFrameRatio: means.faceFrameRatio,
      faceY: means.faceY,
      shoulderDiff: means.shoulderDiff,
      timestamp: Date.now(),
      screenAngleReferences,
    }

    return { baseline, sampleStdDev: stdDevs, screenAngleReferences }
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
      faceY: means.faceY,
      shoulderDiff: means.shoulderDiff,
      timestamp: Date.now(),
    }

    return { baseline, sampleStdDev: stdDevs }
  }

  reset(): void {
    this.samples = []
    this.signalSamples = []
    this.angleCollections = []
    this.currentAngleLabel = null
  }

  getProgress(): CalibrationProgress {
    return this.buildProgress()
  }

  getAngleCollectionCount(): number {
    return this.angleCollections.length
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
    return this.computeMeansFromSamples(this.samples)
  }

  private computeAllStdDevs(means: PostureAngles): PostureAngles {
    return this.computeStdDevsFromSamples(this.samples, means)
  }

  private computeMeansFromSamples(samples: readonly PostureAngles[]): PostureAngles {
    return ANGLE_KEYS.reduce(
      (acc, key) => ({ ...acc, [key]: computeMean(samples, key) }),
      {} as PostureAngles,
    )
  }

  private computeStdDevsFromSamples(
    samples: readonly PostureAngles[],
    means: PostureAngles,
  ): PostureAngles {
    return ANGLE_KEYS.reduce(
      (acc, key) => ({
        ...acc,
        [key]: computeStdDev(samples, key, means[key]),
      }),
      {} as PostureAngles,
    )
  }

  private computeAverageSignals(
    signals: readonly ScreenAngleSignals[],
  ): ScreenAngleSignals {
    if (signals.length === 0) {
      return { faceY: 0, noseChinRatio: 0, eyeMouthRatio: 0 }
    }

    const sum = signals.reduce(
      (acc, s) => ({
        faceY: acc.faceY + s.faceY,
        noseChinRatio: acc.noseChinRatio + s.noseChinRatio,
        eyeMouthRatio: acc.eyeMouthRatio + s.eyeMouthRatio,
      }),
      { faceY: 0, noseChinRatio: 0, eyeMouthRatio: 0 },
    )

    return {
      faceY: sum.faceY / signals.length,
      noseChinRatio: sum.noseChinRatio / signals.length,
      eyeMouthRatio: sum.eyeMouthRatio / signals.length,
    }
  }
}
