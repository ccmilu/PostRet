import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp } from './helpers/electron-app'

let app: ElectronApplication
let settingsPage: Page

test.beforeAll(async () => {
  app = await launchApp()

  // Open settings window
  const windowPromise = app.waitForEvent('window')
  await app.evaluate(() => {
    const postret = (global as Record<string, any>).__postret
    postret?.showSettings?.()
  })
  settingsPage = await windowPromise
  await settingsPage.waitForLoadState('domcontentloaded')
  await settingsPage.waitForSelector('[data-testid="settings-layout"]')
})

test.afterAll(async () => {
  await app.evaluate(() => {
    const postret = (global as Record<string, any>).__postret
    postret?.destroyAllWindows?.()
  })
  await app.close()
})

test.describe('Calibration Flow', () => {
  test('clicking calibration button navigates to calibration page', async () => {
    // Ensure on General tab
    const generalTab = settingsPage.locator('[data-testid="settings-tab-general"]')
    await generalTab.click()
    await settingsPage.waitForSelector('[data-testid="general-settings"]')

    // Click "开始校准" button
    const calibrationBtn = settingsPage.locator('[data-testid="start-calibration-btn"]')
    await calibrationBtn.click()

    // Should navigate to calibration page
    const calibrationPage = settingsPage.locator('[data-testid="calibration-page"]')
    await expect(calibrationPage).toBeVisible({ timeout: 5000 })
  })

  test('calibration page shows idle state with start button', async () => {
    // The idle section should show (camera may or may not work, but the button should be there)
    const idleSection = settingsPage.locator('[data-testid="calibration-idle"]')
    const cameraError = settingsPage.locator('[data-testid="calibration-camera-error"]')

    // Wait for either idle section (camera works) or camera error
    await expect(
      idleSection.or(cameraError),
    ).toBeVisible({ timeout: 5000 })
  })

  test('starting calibration triggers state change', async () => {
    // If there's a camera error, click retry first, or try to start if idle
    const startBtn = settingsPage.locator('[data-testid="calibration-start-btn"]')
    const retryBtn = settingsPage.locator('[data-testid="calibration-retry-btn"]')

    if (await startBtn.isVisible()) {
      await startBtn.click()
    } else if (await retryBtn.isVisible()) {
      // Camera error — can't proceed with real calibration
      // Skip the rest of this test gracefully
      return
    }

    // In Electron E2E, the IPC startCalibration resolves immediately,
    // so we should see either collecting briefly or completed state
    const completedOrCollecting = settingsPage.locator(
      '[data-testid="calibration-completed"], [data-testid="calibration-collecting"]',
    )
    await expect(completedOrCollecting.first()).toBeVisible({ timeout: 5000 })
  })

  test('calibration completes and shows success', async () => {
    // Wait for completed state (IPC calibration completes quickly)
    const completedSection = settingsPage.locator('[data-testid="calibration-completed"]')
    await expect(completedSection).toBeVisible({ timeout: 8000 })

    // Should show success text
    const successText = settingsPage.locator('.calibration-success-text')
    await expect(successText).toContainText('校准完成')
  })

  test('clicking "返回设置" returns to settings page', async () => {
    const backBtn = settingsPage.locator('[data-testid="calibration-back-btn"]')
    await expect(backBtn).toBeVisible({ timeout: 3000 })
    await expect(backBtn).toHaveText('返回设置')

    await backBtn.click()

    // Should be back on settings layout
    const settingsLayout = settingsPage.locator('[data-testid="settings-layout"]')
    await expect(settingsLayout).toBeVisible({ timeout: 3000 })
  })
})
