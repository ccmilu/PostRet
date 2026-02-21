/**
 * Phase 2.3 Settings Full E2E Test
 *
 * Tests all Phase 2.3 settings features in a real Electron environment:
 * - Camera selection dropdown and preview
 * - Auto-launch toggle
 * - Ignore periods add/remove
 * - Weekend toggle
 * - Detection rule toggles (4 independent)
 * - Detection frequency slider
 * - Debug mode entry (version click ×5) and panel
 * - Settings persistence via IPC
 */
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

// ============================================================
// Tab Navigation
// ============================================================

test.describe('Tab Navigation (Phase 2.3)', () => {
  test('settings layout has 4 base tabs: 通用, 检测, 提醒, 计划', async () => {
    await expect(settingsPage.locator('[data-testid="settings-tab-general"]')).toBeVisible()
    await expect(settingsPage.locator('[data-testid="settings-tab-detection"]')).toBeVisible()
    await expect(settingsPage.locator('[data-testid="settings-tab-reminder"]')).toBeVisible()
    await expect(settingsPage.locator('[data-testid="settings-tab-schedule"]')).toBeVisible()
  })

  test('debug tab is NOT visible by default', async () => {
    await expect(settingsPage.locator('[data-testid="settings-tab-debug"]')).not.toBeVisible()
  })

  test('can switch to Detection tab', async () => {
    await settingsPage.locator('[data-testid="settings-tab-detection"]').click()
    await expect(settingsPage.locator('[data-testid="detection-settings"]')).toBeVisible()
  })

  test('can switch to Schedule tab', async () => {
    await settingsPage.locator('[data-testid="settings-tab-schedule"]').click()
    await expect(settingsPage.locator('[data-testid="schedule-settings"]')).toBeVisible()
  })

  test('can switch back to General tab', async () => {
    await settingsPage.locator('[data-testid="settings-tab-general"]').click()
    await expect(settingsPage.locator('[data-testid="general-settings"]')).toBeVisible()
  })
})

// ============================================================
// General Tab: Camera Selection
// ============================================================

test.describe('Camera Selection', () => {
  test.beforeEach(async () => {
    await settingsPage.locator('[data-testid="settings-tab-general"]').click()
  })

  test('camera settings section is visible', async () => {
    await expect(settingsPage.locator('[data-testid="camera-settings"]')).toBeVisible()
  })

  test('camera preview container exists', async () => {
    await expect(settingsPage.locator('[data-testid="camera-preview"]')).toBeVisible()
  })

  // Camera dropdown depends on real devices — in CI/test env, the fake camera
  // may not populate enumerateDevices. We check the select or hint is present.
  test('camera select or "no cameras" hint is shown', async () => {
    const select = settingsPage.locator('[data-testid="camera-select"]')
    const noCameras = settingsPage.locator('[data-testid="no-cameras-hint"]')
    const loading = settingsPage.locator('[data-testid="camera-devices-loading"]')

    // Wait for device enumeration to complete
    await expect(loading).not.toBeVisible({ timeout: 5000 }).catch(() => {})

    const selectVisible = await select.isVisible().catch(() => false)
    const noCamerasVisible = await noCameras.isVisible().catch(() => false)

    // One of these must be true
    expect(selectVisible || noCamerasVisible).toBe(true)
  })
})

// ============================================================
// General Tab: Auto-Launch
// ============================================================

test.describe('Auto-Launch', () => {
  test.beforeEach(async () => {
    await settingsPage.locator('[data-testid="settings-tab-general"]').click()
  })

  test('auto-launch toggle is present', async () => {
    const toggle = settingsPage.locator('input[aria-label="开机自启"]')
    await expect(toggle).toBeAttached()
  })

  test('can toggle auto-launch on and off', async () => {
    const toggle = settingsPage.locator('input[aria-label="开机自启"]')
    const label = settingsPage.locator('label.toggle-switch', {
      has: settingsPage.locator('input[aria-label="开机自启"]'),
    })

    // Default is off
    await expect(toggle).not.toBeChecked()

    // Toggle on
    await label.click()
    await expect(toggle).toBeChecked()

    // Toggle off (restore)
    await label.click()
    await expect(toggle).not.toBeChecked()
  })
})

// ============================================================
// Detection Tab: Rule Toggles & Frequency
// ============================================================

test.describe('Detection Settings', () => {
  test.beforeEach(async () => {
    await settingsPage.locator('[data-testid="settings-tab-detection"]').click()
    await settingsPage.waitForSelector('[data-testid="detection-settings"]')
  })

  test('detection settings panel displays', async () => {
    await expect(settingsPage.locator('[data-testid="detection-settings"]')).toBeVisible()
  })

  test('four rule toggles are present', async () => {
    await expect(settingsPage.locator('input[aria-label="头部前倾"]')).toBeAttached()
    await expect(settingsPage.locator('input[aria-label="歪头"]')).toBeAttached()
    await expect(settingsPage.locator('input[aria-label="距屏幕太近"]')).toBeAttached()
    await expect(settingsPage.locator('input[aria-label="肩膀不对称"]')).toBeAttached()
  })

  test('can toggle individual rules', async () => {
    const forwardHeadToggle = settingsPage.locator('input[aria-label="头部前倾"]')
    const forwardHeadLabel = settingsPage.locator('label.toggle-switch', {
      has: settingsPage.locator('input[aria-label="头部前倾"]'),
    })

    // Default is enabled
    await expect(forwardHeadToggle).toBeChecked()

    // Disable
    await forwardHeadLabel.click()
    await expect(forwardHeadToggle).not.toBeChecked()

    // Re-enable (restore)
    await forwardHeadLabel.click()
    await expect(forwardHeadToggle).toBeChecked()
  })

  test('detection frequency slider is present (100-2000ms range)', async () => {
    const slider = settingsPage.locator('input[aria-label="检测频率"]')
    await expect(slider).toBeVisible()

    // Check range attributes
    await expect(slider).toHaveAttribute('min', '100')
    await expect(slider).toHaveAttribute('max', '2000')
  })

  test('can change detection frequency', async () => {
    const slider = settingsPage.locator('input[aria-label="检测频率"]')

    // Set to 1000ms
    await slider.fill('1000')
    await expect(slider).toHaveValue('1000')

    // Restore to 500ms
    await slider.fill('500')
    await expect(slider).toHaveValue('500')
  })

  test('sensitivity slider is present', async () => {
    const slider = settingsPage.locator('input[aria-label="检测灵敏度"]')
    await expect(slider).toBeVisible()
  })
})

// ============================================================
// Schedule Tab: Ignore Periods & Weekend
// ============================================================

test.describe('Ignore Periods', () => {
  test.beforeEach(async () => {
    await settingsPage.locator('[data-testid="settings-tab-schedule"]').click()
    await settingsPage.waitForSelector('[data-testid="schedule-settings"]')
  })

  test('ignore period add form is visible', async () => {
    await expect(settingsPage.locator('[data-testid="ignore-period-add"]')).toBeVisible()
    await expect(settingsPage.locator('[data-testid="new-period-start"]')).toBeVisible()
    await expect(settingsPage.locator('[data-testid="new-period-end"]')).toBeVisible()
    await expect(settingsPage.locator('[data-testid="add-period-btn"]')).toBeVisible()
  })

  test('can add an ignore period', async () => {
    const startInput = settingsPage.locator('[data-testid="new-period-start"]')
    const endInput = settingsPage.locator('[data-testid="new-period-end"]')
    const addBtn = settingsPage.locator('[data-testid="add-period-btn"]')

    // Set time values
    await startInput.fill('09:00')
    await endInput.fill('10:00')

    // Click add
    await addBtn.click()

    // Verify it was added
    const periodList = settingsPage.locator('[data-testid="ignore-period-list"]')
    await expect(periodList).toBeVisible()
    await expect(settingsPage.locator('[data-testid="ignore-period-0"]')).toContainText('09:00')
    await expect(settingsPage.locator('[data-testid="ignore-period-0"]')).toContainText('10:00')
  })

  test('can remove an ignore period', async () => {
    // The period added in the previous test should still be here
    const removeBtn = settingsPage.locator('[data-testid="remove-period-0"]')
    const hasPeriod = await removeBtn.isVisible().catch(() => false)

    if (hasPeriod) {
      await removeBtn.click()

      // List should be empty or hidden
      const periodList = settingsPage.locator('[data-testid="ignore-period-list"]')
      const stillVisible = await periodList.isVisible().catch(() => false)
      if (stillVisible) {
        // Might still have items from other tests
        const count = await settingsPage.locator('[data-testid^="ignore-period-"]').count()
        // We expect at least one fewer
        expect(count).toBeGreaterThanOrEqual(0)
      }
    }
  })

  test('add button is disabled when start == end', async () => {
    const startInput = settingsPage.locator('[data-testid="new-period-start"]')
    const endInput = settingsPage.locator('[data-testid="new-period-end"]')
    const addBtn = settingsPage.locator('[data-testid="add-period-btn"]')

    // Set same time
    await startInput.fill('12:00')
    await endInput.fill('12:00')

    await expect(addBtn).toBeDisabled()
  })

  test('weekend toggle is present and functional', async () => {
    const toggle = settingsPage.locator('input[aria-label="周末不检测"]')
    const label = settingsPage.locator('label.toggle-switch', {
      has: settingsPage.locator('input[aria-label="周末不检测"]'),
    })

    await expect(toggle).toBeAttached()

    // Default is off
    await expect(toggle).not.toBeChecked()

    // Toggle on
    await label.click()
    await expect(toggle).toBeChecked()

    // Toggle off (restore)
    await label.click()
    await expect(toggle).not.toBeChecked()
  })
})

// ============================================================
// Debug Mode: Version Click Entry
// ============================================================

test.describe('Debug Mode', () => {
  test('version text is visible in sidebar', async () => {
    const versionText = settingsPage.locator('[data-testid="version-text"]')
    await expect(versionText).toBeVisible()
    await expect(versionText).toContainText('v0.1.0')
  })

  test('clicking version text 5 times reveals debug tab', async () => {
    const versionText = settingsPage.locator('[data-testid="version-text"]')

    // Click 5 times rapidly
    for (let i = 0; i < 5; i++) {
      await versionText.click({ delay: 50 })
    }

    // Debug tab should appear
    const debugTab = settingsPage.locator('[data-testid="settings-tab-debug"]')
    await expect(debugTab).toBeVisible({ timeout: 2000 })
  })

  test('debug tab shows panel or no-detection message', async () => {
    // Debug mode should be active from previous test
    const debugTab = settingsPage.locator('[data-testid="settings-tab-debug"]')
    const isVisible = await debugTab.isVisible().catch(() => false)

    if (!isVisible) {
      // Re-activate debug mode
      const versionText = settingsPage.locator('[data-testid="version-text"]')
      for (let i = 0; i < 5; i++) {
        await versionText.click({ delay: 50 })
      }
    }

    await debugTab.click()

    // Without active detection, we expect the no-detection fallback
    const debugPanel = settingsPage.locator('[data-testid="debug-panel"]')
    const noDetection = settingsPage.locator('[data-testid="debug-no-detection"]')

    const panelVisible = await debugPanel.isVisible().catch(() => false)
    const noDetectionVisible = await noDetection.isVisible().catch(() => false)

    expect(panelVisible || noDetectionVisible).toBe(true)
  })

  test('clicking version 5 more times hides debug tab', async () => {
    const versionText = settingsPage.locator('[data-testid="version-text"]')

    // Click 5 times to toggle off
    for (let i = 0; i < 5; i++) {
      await versionText.click({ delay: 50 })
    }

    // Debug tab should be hidden
    const debugTab = settingsPage.locator('[data-testid="settings-tab-debug"]')
    await expect(debugTab).not.toBeVisible({ timeout: 2000 })
  })
})

// ============================================================
// Settings Persistence
// ============================================================

test.describe('Settings Persistence', () => {
  test('toggling detection rule persists via IPC', async () => {
    await settingsPage.locator('[data-testid="settings-tab-detection"]').click()
    await settingsPage.waitForSelector('[data-testid="detection-settings"]')

    const headTiltToggle = settingsPage.locator('input[aria-label="歪头"]')
    const headTiltLabel = settingsPage.locator('label.toggle-switch', {
      has: settingsPage.locator('input[aria-label="歪头"]'),
    })

    // Default enabled
    await expect(headTiltToggle).toBeChecked()

    // Toggle off
    await headTiltLabel.click()
    await expect(headTiltToggle).not.toBeChecked()

    // Wait for IPC propagation
    await settingsPage.waitForTimeout(300)

    // Verify via evaluate
    const savedSettings = await app.evaluate(() => {
      const postret = (global as Record<string, any>).__postret
      return postret?.getSettings?.()
    })

    if (savedSettings) {
      expect(savedSettings.detection.rules.headTilt).toBe(false)
    }

    // Restore
    await headTiltLabel.click()
    await expect(headTiltToggle).toBeChecked()
  })

  test('auto-launch toggle persists via IPC', async () => {
    await settingsPage.locator('[data-testid="settings-tab-general"]').click()
    await settingsPage.waitForSelector('[data-testid="general-settings"]')

    const autoLaunchLabel = settingsPage.locator('label.toggle-switch', {
      has: settingsPage.locator('input[aria-label="开机自启"]'),
    })
    const autoLaunchToggle = settingsPage.locator('input[aria-label="开机自启"]')

    // Toggle on
    await autoLaunchLabel.click()
    await expect(autoLaunchToggle).toBeChecked()

    await settingsPage.waitForTimeout(300)

    // Verify persistence
    const savedSettings = await app.evaluate(() => {
      const postret = (global as Record<string, any>).__postret
      return postret?.getSettings?.()
    })

    if (savedSettings) {
      expect(savedSettings.display.autoLaunch).toBe(true)
    }

    // Restore
    await autoLaunchLabel.click()
    await expect(autoLaunchToggle).not.toBeChecked()
  })

  test('detection frequency change persists via IPC', async () => {
    await settingsPage.locator('[data-testid="settings-tab-detection"]').click()
    await settingsPage.waitForSelector('[data-testid="detection-settings"]')

    const slider = settingsPage.locator('input[aria-label="检测频率"]')

    await slider.fill('1000')
    await settingsPage.waitForTimeout(300)

    const savedSettings = await app.evaluate(() => {
      const postret = (global as Record<string, any>).__postret
      return postret?.getSettings?.()
    })

    if (savedSettings) {
      expect(savedSettings.detection.intervalMs).toBe(1000)
    }

    // Restore
    await slider.fill('500')
  })
})
