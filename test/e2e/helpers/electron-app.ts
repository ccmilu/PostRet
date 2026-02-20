import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { resolve } from 'path'

export async function launchApp(): Promise<ElectronApplication> {
  const appPath = resolve(__dirname, '../../../dist-electron/main.js')
  const app = await electron.launch({
    args: [appPath],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })
  return app
}
