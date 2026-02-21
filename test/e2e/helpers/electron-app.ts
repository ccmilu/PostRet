import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'path'
import { unlinkSync } from 'fs'

function cleanupSingletonLock(): void {
  // Remove SingletonLock files that may be left from previous test runs
  const lockPaths = [
    resolve(process.env.HOME || '', 'Library/Application Support/Electron/SingletonLock'),
    resolve(process.env.HOME || '', 'Library/Application Support/Electron/SingletonSocket'),
    resolve(process.env.HOME || '', 'Library/Application Support/Electron/SingletonCookie'),
  ]
  for (const lockPath of lockPaths) {
    try {
      unlinkSync(lockPath)
    } catch {
      // Ignore if doesn't exist
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface LaunchOptions {
  readonly maxRetries?: number
  readonly extraArgs?: readonly string[]
}

async function tryLaunch(extraArgs: readonly string[] = []): Promise<ElectronApplication> {
  cleanupSingletonLock()
  const appPath = resolve(__dirname, '../../../dist-electron/main.js')
  return electron.launch({
    args: [appPath, ...extraArgs],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })
}

export async function launchApp(maxRetriesOrOptions: number | LaunchOptions = 3): Promise<ElectronApplication> {
  const opts = typeof maxRetriesOrOptions === 'number'
    ? { maxRetries: maxRetriesOrOptions, extraArgs: [] as string[] }
    : maxRetriesOrOptions
  const maxRetries = opts.maxRetries ?? 3
  const extraArgs = opts.extraArgs ?? []
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const app = await tryLaunch(extraArgs)

    // Verify the app is still running (SingletonLock failure causes immediate quit)
    const isRunning = app.process().pid !== undefined && !app.process().killed
    if (isRunning) {
      // Give the app a moment to potentially quit from SingletonLock
      await sleep(500)
      if (!app.process().killed) {
        return app
      }
    }

    // App was killed by SingletonLock — wait for previous instance to fully exit
    if (attempt < maxRetries - 1) {
      await sleep(2000)
    }
  }

  // Final attempt without retry
  return tryLaunch(extraArgs)
}

export async function launchAppWithFakeCamera(maxRetries = 3): Promise<ElectronApplication> {
  const fakeVideoPath = resolve(__dirname, '../../fixtures/videos/good-posture.webm')
  return launchApp({
    maxRetries,
    extraArgs: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      `--use-file-for-fake-video-capture=${fakeVideoPath}`,
    ],
  })
}
