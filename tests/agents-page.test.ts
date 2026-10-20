import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

const page = () => readFile('apps/web/app/docs/agents/page.tsx', 'utf8')

it('introduces agent runs as a capability test with the shared heading and lead, never as taking a person\'s place', async () => {
  const source = await page()
  expect(source).toContain('agent.heading')
  expect(source).toContain('agent.lead')
  expect(source).toContain('capability test, not a usability one')
  expect(source).toContain('An agent passing says nothing about people.')
  expect(source).not.toMatch(/instead of a person|stand-?in|substitute/i)
})

it('is linked from getting started', async () => {
  expect(await readFile('apps/web/app/docs/getting-started/page.tsx', 'utf8')).toContain('href="/docs/agents/"')
})

it('runs the agent study on push, skips without the key, holds least privilege and never runs fork code with secrets', async () => {
  const workflow = await readFile('.github/workflows/ui-tests-agent.yml', 'utf8')
  expect(workflow).toMatch(/^on:\n {2}push:/m)
  expect(workflow).not.toMatch(/pull_request/)
  expect(workflow).toContain('permissions: {}')
  expect(workflow).toMatch(/permissions:\n {6}contents: read\n/)
  expect(workflow).not.toMatch(/: write/)
  expect(workflow).toContain('::notice::ui-tests agent skipped: the ANTHROPIC_API_KEY secret is not set.')
  expect(workflow).toContain('npx ui-tests --actor agent')
  expect(workflow).toContain('persist-credentials: false')
})

it('keeps the agent study out of human dev mode: it admits the agent only', async () => {
  const study = await readFile('apps/web/ui-tests/cli-first-run.ui.test.ts', 'utf8')
  expect(study).toContain("actors: ['agent']")
  expect(study).toContain("target: { cli: 'npx ui-tests' }")
  expect(study).toContain("workspace.file('.ui-tests/runs/*/report.json')")
})
