export const IPC_CHANNELS = {
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // App status
  STATUS_GET: 'app:status:get',
  STATUS_CHANGED: 'app:status:changed',

  // Camera
  CAMERA_PERMISSION: 'camera:permission',

  // Calibration
  CALIBRATION_START: 'calibration:start',
  CALIBRATION_COMPLETE: 'calibration:complete',

  // Posture
  POSTURE_STATUS: 'posture:status',

  // Blur
  BLUR_ACTIVATE: 'blur:activate',
  BLUR_DEACTIVATE: 'blur:deactivate',

  // App control
  APP_PAUSE: 'app:pause',
  APP_RESUME: 'app:resume',

  // Windows
  WINDOW_SETTINGS_OPEN: 'window:settings:open',
  WINDOW_SETTINGS_CLOSE: 'window:settings:close',
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
