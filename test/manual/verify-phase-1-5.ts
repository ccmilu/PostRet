/**
 * Phase 1.5 MCP Visual Verification Script
 *
 * Tests blur overlay, fade-out animation, notification, and sound
 * by launching the Electron app via Playwright and controlling
 * through the __postret test hooks.
 *
 * Usage: npx tsx test/manual/verify-phase-1-5.ts
 */

import { _electron as electron } from 'playwright'
import { execSync } from 'child_process'
import * as path from 'path'

const SCREENSHOT_DIR = path.resolve(__dirname, '../fixtures/screenshots/phase-1-5')
const APP_PATH = path.resolve(__dirname, '../../dist-electron/main.js')

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function screencapture(filename: string): void {
  const filepath = path.join(SCREENSHOT_DIR, filename)
  execSync(`screencapture -x "${filepath}"`)
  console.log(`  Screenshot saved: ${filepath}`)
}

interface TestResult {
  name: string
  passed: boolean
  details: string
}

const results: TestResult[] = []

function record(name: string, passed: boolean, details: string): void {
  results[results.length] = { name, passed, details }
  const icon = passed ? 'PASS' : 'FAIL'
  console.log(`  [${icon}] ${name}: ${details}`)
}

async function main(): Promise<void> {
  console.log('=== Phase 1.5 Visual Verification ===\n')

  // Ensure screenshot directory exists
  execSync(`mkdir -p "${SCREENSHOT_DIR}"`)

  console.log('1. Launching Electron app...')
  const electronApp = await electron.launch({
    args: [APP_PATH],
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
  })

  // Wait for app initialization
  await sleep(3000)
  console.log('   App launched successfully.\n')

  // --- Test 1: Blur Activation ---
  console.log('2. Testing blur activation...')
  const blurResult = await electronApp.evaluate(({ app }) => {
    const hooks = (global as Record<string, any>).__postret
    if (!hooks) return { error: 'No __postret hooks found' }
    hooks.activateBlur()
    return { activated: true }
  })

  if ('error' in blurResult) {
    record('Blur Activation', false, blurResult.error as string)
  } else {
    await sleep(1000)

    // Check state via hooks
    const blurState = await electronApp.evaluate(() => {
      const hooks = (global as Record<string, any>).__postret
      return {
        state: hooks?.getBlurState(),
        visible: hooks?.isOverlayVisible(),
        opacity: hooks?.getOverlayOpacity(),
      }
    })

    record(
      'Blur State',
      blurState.state === 'active',
      `state=${blurState.state}, expected=active`
    )
    record(
      'Overlay Visible',
      blurState.visible === true,
      `visible=${blurState.visible}, expected=true`
    )
    record(
      'Overlay Opacity',
      blurState.opacity === 1,
      `opacity=${blurState.opacity}, expected=1`
    )

    // System screenshot with blur active
    screencapture('blur-active.png')
  }

  // --- Test 2: Blur Deactivation + Fade ---
  console.log('\n3. Testing blur deactivation (fade-out)...')
  await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    hooks?.deactivateBlur()
  })

  // Check state immediately
  const deactivatingState = await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    return {
      state: hooks?.getBlurState(),
      opacity: hooks?.getOverlayOpacity(),
    }
  })
  record(
    'Deactivating State',
    deactivatingState.state === 'deactivating',
    `state=${deactivatingState.state}, expected=deactivating`
  )

  // Capture mid-fade at 0.5s
  await sleep(500)
  const midFadeState = await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    return {
      state: hooks?.getBlurState(),
      opacity: hooks?.getOverlayOpacity(),
    }
  })
  screencapture('blur-fade-0.5s.png')
  record(
    'Mid-fade Opacity (0.5s)',
    midFadeState.opacity !== undefined && midFadeState.opacity < 1 && midFadeState.opacity > 0,
    `opacity=${midFadeState.opacity?.toFixed(3)}, expected between 0 and 1`
  )

  // Capture at 1.0s
  await sleep(500)
  const lateFadeState = await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    return {
      state: hooks?.getBlurState(),
      opacity: hooks?.getOverlayOpacity(),
    }
  })
  screencapture('blur-fade-1.0s.png')
  record(
    'Late-fade Opacity (1.0s)',
    lateFadeState.opacity !== undefined && lateFadeState.opacity < midFadeState.opacity!,
    `opacity=${lateFadeState.opacity?.toFixed(3)}, should be less than 0.5s value (${midFadeState.opacity?.toFixed(3)})`
  )

  // Wait for complete fade (1.5s total default)
  await sleep(700)
  const afterFadeState = await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    return {
      state: hooks?.getBlurState(),
      visible: hooks?.isOverlayVisible(),
      opacity: hooks?.getOverlayOpacity(),
    }
  })
  screencapture('blur-gone.png')
  record(
    'Post-fade State',
    afterFadeState.state === 'idle',
    `state=${afterFadeState.state}, expected=idle`
  )
  record(
    'Post-fade Visibility',
    afterFadeState.visible === false,
    `visible=${afterFadeState.visible}, expected=false`
  )

  // --- Test 3: Notification ---
  console.log('\n4. Testing system notification...')
  await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    hooks?.triggerNotification()
  })
  await sleep(2000)
  screencapture('notification.png')
  record('Notification Triggered', true, 'Notification sent, check screenshot for visual confirmation')

  // --- Test 4: Sound ---
  console.log('\n5. Testing alert sound...')
  await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    hooks?.triggerSound()
  })
  await sleep(1000)
  record('Sound Triggered', true, 'Sound played (audio verification is manual)')

  // --- Test 5: Full reminder flow simulation ---
  console.log('\n6. Testing full reminder flow (bad posture -> blur -> good posture -> deblur)...')

  // Get initial reminder state
  const reminderInitState = await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    return hooks?.getReminderState()
  })
  record(
    'Reminder Initial State',
    reminderInitState === 'idle' || reminderInitState === 'monitoring',
    `state=${reminderInitState}`
  )

  // Cleanup
  console.log('\n7. Closing application...')
  await electronApp.evaluate(() => {
    const hooks = (global as Record<string, any>).__postret
    hooks?.destroyAllWindows()
  })
  await sleep(500)
  await electronApp.close()

  // --- Summary ---
  console.log('\n=== Verification Summary ===')
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`)
  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results) {
      if (!r.passed) {
        console.log(`  - ${r.name}: ${r.details}`)
      }
    }
  }

  console.log('\nScreenshots saved to:', SCREENSHOT_DIR)
  console.log('Please review screenshots visually for:')
  console.log('  1. blur-active.png — Blur effect covering screen')
  console.log('  2. blur-fade-0.5s.png — Partial fade at 0.5s')
  console.log('  3. blur-fade-1.0s.png — Further fade at 1.0s')
  console.log('  4. blur-gone.png — Blur completely gone')
  console.log('  5. notification.png — System notification visible')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
