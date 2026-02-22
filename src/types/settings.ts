export interface PostureSettings {
  readonly detection: DetectionSettings
  readonly reminder: ReminderSettings
  readonly calibration: CalibrationData | null
  readonly display: DisplaySettings
  readonly advanced: AdvancedSettings
}

export interface DetectionSettings {
  readonly enabled: boolean
  readonly intervalMs: number
  readonly sensitivity: number
  readonly rules: RuleToggles
}

export interface RuleToggles {
  readonly forwardHead: boolean
  readonly slouch: boolean
  readonly headTilt: boolean
  readonly tooClose: boolean
  readonly shoulderAsymmetry: boolean
}

export interface ReminderSettings {
  readonly blur: boolean
  readonly sound: boolean
  readonly notification: boolean
  readonly delayMs: number
  readonly fadeOutDurationMs: number
}

export interface ScreenAngleCalibrationPoint {
  readonly angle: number // estimated angle (90/110/130)
  readonly signals: {
    readonly faceY: number
    readonly noseChinRatio: number
    readonly eyeMouthRatio: number
  }
}

export interface CalibrationData {
  readonly headForwardAngle: number
  readonly torsoAngle: number
  readonly headTiltAngle: number
  readonly faceFrameRatio: number
  readonly faceY: number
  readonly noseToEarAvg: number
  readonly shoulderDiff: number
  readonly timestamp: number
  readonly screenAngleReference?: {
    readonly faceY: number
    readonly noseChinRatio: number
    readonly eyeMouthRatio: number
  }
  readonly screenAngleReferences?: readonly ScreenAngleCalibrationPoint[]
}

export interface DisplaySettings {
  readonly selectedCamera: string
  readonly autoLaunch: boolean
  readonly ignorePeriods: readonly IgnorePeriod[]
  readonly weekendIgnore: boolean
}

export interface IgnorePeriod {
  readonly start: string
  readonly end: string
}

export interface CustomThresholds {
  readonly forwardHead?: number
  readonly headTilt?: number
  readonly tooClose?: number
  readonly shoulderAsymmetry?: number
}

export interface AdvancedSettings {
  readonly debugMode: boolean
  readonly customThresholds?: CustomThresholds
  readonly notificationIntervalMs?: number
}

export const DEFAULT_SETTINGS: PostureSettings = {
  detection: {
    enabled: true,
    intervalMs: 500,
    sensitivity: 0.5,
    rules: {
      forwardHead: true,
      slouch: false,
      headTilt: true,
      tooClose: true,
      shoulderAsymmetry: true,
    },
  },
  reminder: {
    blur: true,
    sound: false,
    notification: true,
    delayMs: 5000,
    fadeOutDurationMs: 1500,
  },
  calibration: null,
  display: {
    selectedCamera: '',
    autoLaunch: false,
    ignorePeriods: [],
    weekendIgnore: false,
  },
  advanced: {
    debugMode: false,
  },
}
