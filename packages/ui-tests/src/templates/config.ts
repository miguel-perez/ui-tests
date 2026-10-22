/** What `ui-tests init` writes as `ui-tests.config.ts`. */
export const configTemplate = `import { defineConfig } from 'ui-tests'

export default defineConfig({
  target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' },
  server: { url: process.env.UI_TESTS_PUBLIC_URL ?? 'http://localhost:4300' },
  // record: 'video' on a study adds the screen as a video to the event replay.
  // model: { provider: 'anthropic', name: 'claude-sonnet-5-5' } drafts the screener (npx ui-tests lint -u), codes the first look and runs agents; the key stays in ANTHROPIC_API_KEY.
})
`
