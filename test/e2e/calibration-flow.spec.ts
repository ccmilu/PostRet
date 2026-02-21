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
    const idleSection = settingsPage.locator('[data-testid="calibration-idle"]')
    await expect(idleSection).toBeVisible()

    const startBtn = settingsPage.locator('[data-testid="calibration-start-btn"]')
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toHaveText('开始校准')
  })

  test('starting calibration shows progress bar', async () => {
    const startBtn = settingsPage.locator('[data-testid="calibration-start-btn"]')
    await startBtn.click()

    // Should enter collecting state
    const collectingSection = settingsPage.locator('[data-testid="calibration-collecting"]')
    await expect(collectingSection).toBeVisible({ timeout: 2000 })

    // Progress bar should be visible
    const progressBar = settingsPage.locator('[data-testid="calibration-progress-bar"]')
    await expect(progressBar).toBeVisible()
  })

  test('calibration completes and shows success', async () => {
    // Wait for calibration to complete (mock mode is 3 seconds)
    const completedSection = settingsPage.locator('[data-testid="calibration-completed"]')
    await expect(completedSection).toBeVisible({ timeout: 5000 })

    // Should show success text
    const successText = settingsPage.locator('.calibration-success-text')
    await expect(successText).toContainText('校准完成')
  })

  test('clicking "返回设置" returns to settings page', async () => {
    const backBtn = settingsPage.locator('[data-testid="calibration-back-btn"]')
    await expect(backBtn).toBeVisible()
    await expect(backBtn).toHaveText('返回设置')

    await backBtn.click()

    // Should be back on settings layout
    const settingsLayout = settingsPage.locator('[data-testid="settings-layout"]')
    await expect(settingsLayout).toBeVisible({ timeout: 3000 })
  })
})
