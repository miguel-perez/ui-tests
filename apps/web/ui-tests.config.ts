import { defineConfig } from 'ui-tests/config'

/** The site is the first context under test: `npx ui-tests` in this folder rehearses ui-tests/landing.ui.test.ts on the running app. */
export default defineConfig({
  target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' },
  product: 'ui-tests',
  author: 'ui-tests',
})
