import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// One absolute directory for `ui-tests serve` and the test helpers alike: a relative path would resolve against two working
// directories and open two stores.
process.env.UI_TESTS_DATA_DIR = resolve(import.meta.dirname, '.ui-tests', 'e2e')

export default defineConfig({
  fullyParallel: false, workers: 1, timeout: 60_000,
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    // The landing as it ships: built, then served as plain files.
    { name: 'site', testDir: './tests/e2e', use: { baseURL: process.env.SITE_BASE_URL ?? 'http://localhost:3000' } },
    // The product: the player, the collector and the report on `ui-tests serve`, and the tasks on two apps that carry the tag, this
    // site's static export and a plain HTML page.
    { name: 'product', testDir: './tests/product', testMatch: '**/*.spec.ts', testIgnore: '**/lan.spec.ts', use: { baseURL: 'http://127.0.0.1:3000' } },
    // A preview as CI proves it, with this site's export on 3000 standing in for the preview: a front door in front of it and the server.
    { name: 'preview', testDir: './tests/preview' },
    // A participant on this machine's own LAN address, through the front door `recruit --host` opens.
    { name: 'lan', testDir: './tests/product', testMatch: '**/lan.spec.ts' },
  ],
  webServer: [
    {
      // The site's tag points at the server below; Next inlines the address when it builds.
      command: 'NEXT_PUBLIC_UI_TESTS_URL=http://127.0.0.1:4300 npm run build && python3 -m http.server 3000 --bind 127.0.0.1 --directory apps/web/out',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 300_000,
    },
    {
      // ui-tests serve: the collector, the player, the shared report and ui-tests.js. The secret share links are signed and checked with:
      // tests/product/report.spec.ts signs with the same one. No public address is set, so it is its own origin at whichever address a
      // request names.
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
