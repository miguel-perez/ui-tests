import { defineConfig } from 'ui-tests/config'

/** The site is the first context under test: `npx ui-tests` in this folder rehearses ui-tests/landing.ui.test.ts on the running app. */
export default defineConfig({
  target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' },
  server: { url: process.env.UI_TESTS_PUBLIC_URL ?? 'http://localhost:4300' },
  product: 'ui-tests',
  author: 'ui-tests',
  // A pull request is tested when it carries this label.
  ci: { on: ['label:ui-test'] },
  reporters: ['default', 'json'],
  // The one model: the agent study (ui-tests/cli-first-run.ui.test.ts) runs on it with `npx ui-tests --actor agent`, `npx ui-tests lint -u`
  // drafts the screener snapshot with it, and the server codes the first look with it. The key stays in ANTHROPIC_API_KEY.
  model: { provider: 'anthropic', name: 'claude-opus-5-5' },
})
