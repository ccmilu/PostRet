import { app } from 'electron'

export function enableAutoLaunch(): void {
  app.setLoginItemSettings({ openAtLogin: true })
}

export function disableAutoLaunch(): void {
  app.setLoginItemSettings({ openAtLogin: false })
}

export function getAutoLaunchStatus(): boolean {
  return app.getLoginItemSettings().openAtLogin
}

export function syncAutoLaunch(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled })
}
