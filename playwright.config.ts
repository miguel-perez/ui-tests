import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60_000,
  // Chromium's fake microphone lets the player's "Talk instead" path record real audio in tests; nothing here uses a real device.
  use: { baseURL: process.env.SITE_BASE_URL ?? 'http://localhost:3000', browserName: 'chromium', trace: 'retain-on-failure', launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } },
  // The share secret signs the report's share links in the tests only; production sets its own UI_TESTS_SHARE_SECRET.
  webServer: { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 120_000, env: { UI_TESTS_SHARE_SECRET: 'e2e-share-secret' } },
})
