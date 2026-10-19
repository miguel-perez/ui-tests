import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 60_000,
  use: { baseURL: process.env.SITE_BASE_URL ?? 'http://localhost:3000', browserName: 'chromium', trace: 'retain-on-failure' },
  // The tests read the static export, as it ships: built, then served as plain files.
  webServer: { command: 'npm run build && python3 -m http.server 3000 --bind 127.0.0.1 --directory apps/web/out', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 300_000 },
})
