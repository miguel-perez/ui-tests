import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60_000,
  use: { baseURL: 'http://localhost:3000', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 120_000 },
})
