import { defineConfig } from 'ui-tests/config'

/** The site is the first context under test: `npx ui-tests` in this folder rehearses ui-tests/landing.ui.test.ts on the running app. */
export default defineConfig({
  target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' },
  product: 'ui-tests',
  author: 'ui-tests',
  // A pull request is tested when it carries this label.
  ci: { on: ['label:ui-test'] },
  // The agent study (ui-tests/cli-first-run.ui.test.ts) runs on this model with `npx ui-tests --actor agent`; the json reporter writes its report.
  reporters: ['default', 'json'],
  agents: { model: { provider: 'anthropic', name: 'claude-opus-5-5' } },
})
