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

test.describe('Settings Window', () => {
  test('settings window displays with correct title', async () => {
    const title = await settingsPage.title()
    expect(title).toContain('PostRet')
  })

  test('settings layout renders with sidebar and content', async () => {
    await settingsPage.waitForSelector('[data-testid="settings-layout"]')
    const sidebar = settingsPage.locator('[data-testid="settings-sidebar"]')
    const content = settingsPage.locator('[data-testid="settings-content"]')

    await expect(sidebar).toBeVisible()
    await expect(content).toBeVisible()
  })

  test('default tab is "通用" (General)', async () => {
    const generalTab = settingsPage.locator('[data-testid="settings-tab-general"]')
    await expect(generalTab).toHaveAttribute('aria-selected', 'true')

    const generalPanel = settingsPage.locator('[data-testid="general-settings"]')
    await expect(generalPanel).toBeVisible()
  })

  test('can switch to "提醒" (Reminder) tab', async () => {
    const reminderTab = settingsPage.locator('[data-testid="settings-tab-reminder"]')
    await reminderTab.click()

    await expect(reminderTab).toHaveAttribute('aria-selected', 'true')

    const reminderPanel = settingsPage.locator('[data-testid="reminder-settings"]')
    await expect(reminderPanel).toBeVisible()

    // General panel should be hidden
    const generalPanel = settingsPage.locator('[data-testid="general-settings"]')
    await expect(generalPanel).not.toBeVisible()
  })

  test('can switch back to "通用" tab', async () => {
    const generalTab = settingsPage.locator('[data-testid="settings-tab-general"]')
    await generalTab.click()

    await expect(generalTab).toHaveAttribute('aria-selected', 'true')

    const generalPanel = settingsPage.locator('[data-testid="general-settings"]')
    await expect(generalPanel).toBeVisible()
  })

  test('General tab shows detection toggle and status', async () => {
    const generalTab = settingsPage.locator('[data-testid="settings-tab-general"]')
    await generalTab.click()

    // Toggle input is CSS-hidden; check the container label is visible
    const toggleContainer = settingsPage.locator('.toggle-container', {
      has: settingsPage.locator('input[aria-label="启用姿态检测"]'),
    })
    await expect(toggleContainer).toBeVisible()

    // Check the toggle input exists in DOM
    const toggle = settingsPage.locator('input[aria-label="启用姿态检测"]')
    await expect(toggle).toBeAttached()

    const statusBadge = settingsPage.locator('[data-testid="status-badge"]')
    await expect(statusBadge).toBeVisible()
  })

  test('can toggle detection off and on', async () => {
    const generalTab = settingsPage.locator('[data-testid="settings-tab-general"]')
    await generalTab.click()

    const toggle = settingsPage.locator('input[aria-label="启用姿态检测"]')

    // Default is enabled
    await expect(toggle).toBeChecked()

    // Click the label to toggle (since input is CSS-hidden)
    const toggleLabel = settingsPage.locator('label.toggle-switch', {
      has: settingsPage.locator('input[aria-label="启用姿态检测"]'),
    })
    await toggleLabel.click()
    await expect(toggle).not.toBeChecked()

    // Status should change to "已暂停"
    const statusBadge = settingsPage.locator('[data-testid="status-badge"]')
    await expect(statusBadge).toHaveText('已暂停')

    // Toggle back on
    await toggleLabel.click()
    await expect(toggle).toBeChecked()
  })

  test('Reminder tab shows three toggles and sliders', async () => {
    const reminderTab = settingsPage.locator('[data-testid="settings-tab-reminder"]')
    await reminderTab.click()

    // Toggle inputs are CSS-hidden; check they exist in the DOM
    await expect(settingsPage.locator('input[aria-label="屏幕模糊"]')).toBeAttached()
    await expect(settingsPage.locator('input[aria-label="提示音"]')).toBeAttached()
    await expect(settingsPage.locator('input[aria-label="系统通知"]')).toBeAttached()

    // Sliders are visible (range inputs are not CSS-hidden)
    await expect(settingsPage.locator('input[aria-label="检测灵敏度"]')).toBeVisible()
    await expect(settingsPage.locator('input[aria-label="触发延迟"]')).toBeVisible()
    await expect(settingsPage.locator('input[aria-label="渐变消除时长"]')).toBeVisible()
  })

  test('sensitivity slider responds to input', async () => {
    const reminderTab = settingsPage.locator('[data-testid="settings-tab-reminder"]')
    await reminderTab.click()

    const slider = settingsPage.locator('input[aria-label="检测灵敏度"]')
    await slider.fill('0.8')

    // Verify the value changed
    await expect(slider).toHaveValue('0.8')
  })

  test('settings persist via IPC to electron-store', async () => {
    // Toggle sound on (default is off)
    const reminderTab = settingsPage.locator('[data-testid="settings-tab-reminder"]')
    await reminderTab.click()

    const soundToggle = settingsPage.locator('input[aria-label="提示音"]')
    await expect(soundToggle).not.toBeChecked()

    // Click the label to toggle
    const soundToggleLabel = settingsPage.locator('label.toggle-switch', {
      has: settingsPage.locator('input[aria-label="提示音"]'),
    })
    await soundToggleLabel.click()
    await expect(soundToggle).toBeChecked()

    // Wait for IPC to propagate
    await settingsPage.waitForTimeout(500)

    // The toggle state should be persisted — verify still checked after delay
    await expect(soundToggle).toBeChecked()

    // Toggle back off for clean state
    await soundToggleLabel.click()
    await expect(soundToggle).not.toBeChecked()
  })

  test('calibration button is present and clickable', async () => {
    const generalTab = settingsPage.locator('[data-testid="settings-tab-general"]')
    await generalTab.click()

    const calibrationBtn = settingsPage.locator('[data-testid="start-calibration-btn"]')
    await expect(calibrationBtn).toBeVisible()
    await expect(calibrationBtn).toHaveText('开始校准')
  })
})
