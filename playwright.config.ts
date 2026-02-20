import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: 1,
  use: {
    trace: 'on-first-retry',
  },
  reporter: [['html', { open: 'never' }], ['list']],
})
