import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSoundPlayer } from '../../../../src/services/reminder/sound-player'

// ─── createSoundPlayer ───

describe('createSoundPlayer', () => {
  let mockExec: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockExec = vi.fn()
  })

  it('should call exec with afplay and the correct sound file path', () => {
    const player = createSoundPlayer({ exec: mockExec })
    player.playAlertSound()

    expect(mockExec).toHaveBeenCalledTimes(1)
    expect(mockExec).toHaveBeenCalledWith(
      'afplay /System/Library/Sounds/Tink.aiff',
      expect.any(Function),
    )
  })

  it('should not throw when exec callback receives an error', () => {
    mockExec.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(new Error('playback failed'))
    })

    const player = createSoundPlayer({ exec: mockExec })

    expect(() => player.playAlertSound()).not.toThrow()
  })

  it('should not throw when exec callback receives null (success)', () => {
    mockExec.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(null)
    })

    const player = createSoundPlayer({ exec: mockExec })

    expect(() => player.playAlertSound()).not.toThrow()
  })

  it('should log error when exec callback receives an error', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const execError = new Error('playback failed')
    mockExec.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(execError)
    })

    const player = createSoundPlayer({ exec: mockExec })
    player.playAlertSound()

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Sound playback failed:',
      'playback failed',
    )
    consoleErrorSpy.mockRestore()
  })

  it('should not log when exec succeeds', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockExec.mockImplementation((_cmd: string, cb: (err: Error | null) => void) => {
      cb(null)
    })

    const player = createSoundPlayer({ exec: mockExec })
    player.playAlertSound()

    expect(consoleErrorSpy).not.toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('should be fire-and-forget (exec is non-blocking)', () => {
    // exec is called but not awaited - just verifying it's called without blocking
    const player = createSoundPlayer({ exec: mockExec })
    player.playAlertSound()

    // If this line is reached without hanging, exec is non-blocking
    expect(mockExec).toHaveBeenCalledTimes(1)
  })

  it('should allow custom sound file path', () => {
    const player = createSoundPlayer({
      exec: mockExec,
      soundPath: '/System/Library/Sounds/Glass.aiff',
    })
    player.playAlertSound()

    expect(mockExec).toHaveBeenCalledWith(
      'afplay /System/Library/Sounds/Glass.aiff',
      expect.any(Function),
    )
  })
})
