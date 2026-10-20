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
    { name: 'product', testDir: './tests/product', testMatch: '**/*.spec.ts', testIgnore: '**/lan.spec.ts', use: { baseURL: 'http://127.0.0.1:3100' } },
    // The same server, reached by this machine's own LAN address: it always binds 0.0.0.0, so no second server is started.
    { name: 'lan', testDir: './tests/product', testMatch: '**/lan.spec.ts' },
  ],
  webServer: [
    { command: 'npm run build && python3 -m http.server 3000 --bind 127.0.0.1 --directory apps/web/out', url: 'http://localhost:3000', reuseExistingServer: false, timeout: 300_000 },
    {
      command: 'npm run build:server --workspace @ui-tests/web && npm run start:server --workspace @ui-tests/web',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 300_000,
      // The secret share links are signed and checked with: tests/product/report.spec.ts signs with the same one.
      // The tag in the layout points at the server below; Next inlines the address when it builds.
      env: { UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR, UI_TESTS_SHARE_SECRET: 'test', NEXT_PUBLIC_UI_TESTS_URL: 'http://127.0.0.1:4300' },
    },
    {
      // ui-tests serve: the collector, the player and ui-tests.js, on the same store as the product server. No public address is
      // set, so it is its own origin at whichever address a request names: 127.0.0.1, and this machine's LAN address for lan.spec.ts.
      command: 'node packages/ui-tests/bin/ui-tests.mjs serve --port 4300',
      url: 'http://127.0.0.1:4300/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR, UI_TESTS_SHARE_SECRET: 'test' },
    },
    // A plain static site that carries nothing but the tag.
    { command: 'python3 -m http.server 3200 --bind 127.0.0.1 --directory tests/product/fixtures/plain', url: 'http://127.0.0.1:3200', reuseExistingServer: false, timeout: 30_000 },
  ],
})
