import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@electron': resolve(__dirname, 'electron'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/performance/**/*.test.ts'],
    testTimeout: 30000,
  },
})
