import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

const read = (name: string) => readFile(`.github/workflows/${name}`, 'utf8')

/** The steps of the `check` job as text, one entry each: the workflow's steps start at six spaces of indent and a dash. */
async function checkSteps(): Promise<string[]> {
  const text = await read('ui-tests-check.yml')
  const job = text.slice(text.indexOf('\n  check:'))
  return job.slice(job.indexOf('\n    steps:') + '\n    steps:'.length).split(/\n(?=      - )/).filter(step => step.trim())
}

it('proves the preview with a server started in the check job', async () => {
  const text = await read('ui-tests-check.yml')
  for (const part of ['ui-tests serve', '/healthz', 'playwright.preview.config.ts', 'ui-tests status']) expect(text).toContain(part)
  expect(text).not.toContain('UI_TESTS_PUBLIC_URL')
})

it('guards every step of the check job after the first with the configured output', async () => {
  const [first, ...rest] = await checkSteps()
  expect(first).toContain('id: configured')
  expect(rest.length).toBeGreaterThan(5)
  for (const step of rest) expect(step, step).toContain("if: steps.configured.outputs.run == 'true'")
})

it('starts the server before ui-tests check needs it', async () => {
  const steps = await checkSteps()
  const serve = steps.findIndex(step => step.includes('npx ui-tests serve'))
  expect(serve).toBeGreaterThan(-1)
  expect(serve).toBeLessThan(steps.findIndex(step => step.includes('npx ui-tests check')))
})

it('verifies and reports from apps/web, where the config is, reading the run id from the repository root', async () => {
  const step = (await checkSteps()).find(candidate => candidate.includes('npx ui-tests verify'))!
  expect(step).toContain('working-directory: apps/web')
  expect(step).toContain('npx ui-tests status "$(cat ../../.ui-tests/preview-run)"')
  expect(step).toContain('npx ui-tests verify "$(cat ../../.ui-tests/preview-run)"')
})

it('keeps the job named Automation CI', async () => {
  expect(await read('ci.yml')).toMatch(/name: Automation CI/)
})
