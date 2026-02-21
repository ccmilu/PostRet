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
  test('clicking calibration button navigates to calibration wizard', async () => {
    // Ensure on General tab
    const generalTab = settingsPage.locator('[data-testid="settings-tab-general"]')
    await generalTab.click()
    await settingsPage.waitForSelector('[data-testid="general-settings"]')

    // Click "开始校准" button
    const calibrationBtn = settingsPage.locator('[data-testid="start-calibration-btn"]')
    await calibrationBtn.click()

    // Should navigate to calibration wizard
    const calibrationWizard = settingsPage.locator('[data-testid="calibration-wizard"]')
    await expect(calibrationWizard).toBeVisible({ timeout: 5000 })
  })

  test('calibration wizard shows welcome step with start button', async () => {
    // Step 1 (welcome) should show, or camera error may appear
    const step1 = settingsPage.locator('[data-testid="wizard-step-1"]')
    const cameraError = settingsPage.locator('[data-testid="calibration-camera-error"]')

    // Wait for either welcome step (camera works) or camera error
    await expect(
      step1.or(cameraError),
    ).toBeVisible({ timeout: 5000 })

    if (await step1.isVisible()) {
      const startBtn = settingsPage.locator('[data-testid="wizard-start-btn"]')
      await expect(startBtn).toBeVisible()
      await expect(startBtn).toHaveText('开始校准')
    }
  })

  test('starting calibration transitions to step 2 or error', async () => {
    const startBtn = settingsPage.locator('[data-testid="wizard-start-btn"]')
    const cameraError = settingsPage.locator('[data-testid="calibration-camera-error"]')

    if (await cameraError.isVisible()) {
      // Camera error — can't proceed further
      return
    }

    if (!(await startBtn.isVisible())) {
      return
    }

    await startBtn.click()

    // After clicking start, should see step 2, camera error, or wizard error
    const step2 = settingsPage.locator('[data-testid="wizard-step-2"]')
    const wizardError = settingsPage.locator('[data-testid="calibration-error"]')

    await expect(
      step2.or(cameraError).or(wizardError),
    ).toBeVisible({ timeout: 8000 })
  })

  test('wizard shows step indicator dots', async () => {
    const indicator = settingsPage.locator('[data-testid="wizard-steps-indicator"]')
    await expect(indicator).toBeVisible()

    const dots = indicator.locator('.wizard-step-dot')
    await expect(dots).toHaveCount(4)
  })

  test('wizard error or step 2 allows going back to step 1', async () => {
    // If we're in an error state, the retry button should go back to step 1
    const wizardError = settingsPage.locator('[data-testid="calibration-error"]')
    const step2 = settingsPage.locator('[data-testid="wizard-step-2"]')

    if (await wizardError.isVisible()) {
      const retryBtn = settingsPage.locator('[data-testid="calibration-retry-btn"]')
      await retryBtn.click()
      const step1 = settingsPage.locator('[data-testid="wizard-step-1"]')
      await expect(step1).toBeVisible({ timeout: 3000 })
    } else if (await step2.isVisible()) {
      const backBtn = settingsPage.locator('[data-testid="wizard-back-btn"]')
      await backBtn.click()
      const step1 = settingsPage.locator('[data-testid="wizard-step-1"]')
      await expect(step1).toBeVisible({ timeout: 3000 })
    }
    // If camera error, we simply verify the wizard is still showing
    const wizard = settingsPage.locator('[data-testid="calibration-wizard"]')
    await expect(wizard).toBeVisible()
  })
})
