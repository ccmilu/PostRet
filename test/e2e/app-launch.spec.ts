import { test, expect, type ElectronApplication } from '@playwright/test'
import { launchApp } from './helpers/electron-app'

let app: ElectronApplication

test.beforeAll(async () => {
  app = await launchApp()
})

test.afterAll(async () => {
  // Destroy all windows to avoid the close-event preventDefault hanging app.close()
  await app.evaluate(() => {
    const postret = (global as Record<string, any>).__postret
    postret?.destroyAllWindows?.()
  })
  await app.close()
})

test('app launches successfully', async () => {
  expect(app.process()).toBeTruthy()
  expect(app.process().pid).toBeGreaterThan(0)
})

test('settings window opens and shows React content', async () => {
  // Start listening for window event BEFORE triggering the action
  const windowPromise = app.waitForEvent('window')

  // Trigger settings window open via the global test helper
  await app.evaluate(async () => {
    const postret = (global as Record<string, any>).__postret
    if (postret?.showSettings) {
      postret.showSettings()
    }
  })

  // Wait for the window to be created
  const window = await windowPromise
  await window.waitForLoadState('domcontentloaded')

  const title = await window.title()
  expect(title).toContain('PostRet')

  // Settings layout should be rendered
  await window.waitForSelector('[data-testid="settings-layout"]')
  const layout = await window.locator('[data-testid="settings-layout"]').isVisible()
  expect(layout).toBe(true)
})
