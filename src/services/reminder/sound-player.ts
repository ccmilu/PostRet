type ExecCallback = (err: Error | null) => void
type ExecFn = (command: string, callback: ExecCallback) => void

export interface SoundPlayerOptions {
  readonly exec: ExecFn
  readonly soundPath?: string
}

export interface SoundPlayer {
  playAlertSound(): void
}

const DEFAULT_SOUND_PATH = '/System/Library/Sounds/Tink.aiff'

export function createSoundPlayer(options: SoundPlayerOptions): SoundPlayer {
  const soundPath = options.soundPath ?? DEFAULT_SOUND_PATH

  return {
    playAlertSound(): void {
      options.exec(`afplay ${soundPath}`, (err) => {
        if (err) {
          console.error('Sound playback failed:', err.message)
        }
      })
    },
  }
}
