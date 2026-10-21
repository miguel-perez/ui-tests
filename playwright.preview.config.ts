import { defineConfig } from '@playwright/test'

// CI proves a preview: the job starts `ui-tests serve` itself, so this config starts no web servers.
export default defineConfig({
  fullyParallel: false, workers: 1, timeout: 120_000,
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  testDir: './tests/preview',
})
