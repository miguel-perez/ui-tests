import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// One absolute directory for the product server and the test helpers alike: a relative path would resolve against two working
// directories and open two stores.
process.env.UI_TESTS_DATA_DIR = resolve(import.meta.dirname, '.ui-tests', 'e2e')

export default defineConfig({
  fullyParallel: false, workers: 1, timeout: 60_000,
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    // The landing as it ships: built, then served as plain files.
    { name: 'site', testDir: './tests/e2e', use: { baseURL: process.env.SITE_BASE_URL ?? 'http://localhost:3000' } },
    // The product: apps/web built and started in server mode, with the player and the collector mounted.
    { name: 'product', testDir: './tests/product', testMatch: '**/*.spec.ts', use: { baseURL: 'http://127.0.0.1:3100' } },
  ],
  webServer: [
    { command: 'npm run build && python3 -m http.server 3000 --bind 127.0.0.1 --directory apps/web/out', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 300_000 },
    {
      command: 'npm run build:server --workspace @ui-tests/web && npm run start:server --workspace @ui-tests/web',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 300_000,
      env: { UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR },
    },
  ],
})
