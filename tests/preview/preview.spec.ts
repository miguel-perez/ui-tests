import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { compileStudy } from '../../packages/ui-tests/src/compile.ts'
import { bundleStudyFile, loadBundle } from '../../packages/ui-tests/src/load.ts'
import { startFrontDoor } from '../../packages/ui-tests/src/server/front-door.ts'
import { setRunApp } from '../../packages/ui-tests/src/server/origins.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import type { RunStore } from '../../packages/ui-tests/src/store/types.ts'

/**
 * A preview proved the way CI proves it: `ui-tests serve` started in the job, a front door in front of the preview and that server, and a
 * rehearsal attempt that takes the landing task through the player and the bar. Locally the site's export on 3000 stands in for the preview.
 * The door rewrites the tag's address to its own origin, so the preview needs no server address of its own.
 */

const PREVIEW_URL = process.env.PREVIEW_URL ?? 'http://localhost:3000'
const SERVER_URL = process.env.SERVER_URL ?? 'http://127.0.0.1:4300'
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const root = join(import.meta.dirname, '..', '..')
const study = join(root, 'apps', 'web', 'ui-tests', 'landing.ui.test.ts')

test.use({ reducedMotion: 'reduce' })
test.describe.configure({ timeout: 180_000 })

/** The run to prove: the one named, else the latest for this preview, else one made from the landing study. */
async function runFor(store: RunStore): Promise<string> {
  if (process.env.UI_TESTS_RUN) return process.env.UI_TESTS_RUN
  const known = (await store.listRuns()).filter(run => run.build.url === PREVIEW_URL).at(-1)
  if (known) return known.run
  const { code } = await bundleStudyFile(study)
  const [authored] = await loadBundle(code, study)
  if (!authored) throw new Error(`No study in ${study}`)
  const compiled = compileStudy(authored, {})
  const { run } = await store.createRun({
    key: `ci-preview:${compiled.id}:${Date.now()}`,
    context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
    build: { url: PREVIEW_URL, commit: 'ci-preview' },
    actor: 'human', compiled, hooksBundle: code, rehearsal: false, target: PREVIEW_URL,
  })
  return run.run
}

/** Consent and whatever precedes the card, one screen at a time. */
async function throughScreens(page: Page) {
  const heading = page.locator('h1')
  for (let step = 0; step < 20 && (await heading.first().textContent()) !== 'Your task'; step++) {
    const title = (await heading.first().textContent()) ?? ''
    if (title === 'Before you start') await page.getByRole('button', { name: 'I agree and continue' }).click()
    else if (title === 'A quick practice') {
      const practice = page.getByRole('group', { name: 'Practice bar' })
      await practice.getByRole('button', { name: 'Done' }).click()
      await practice.getByRole('button', { name: 'Yes' }).click()
      await page.getByRole('button', { name: 'Continue' }).click()
    } else {
      if (await page.getByRole('textbox').count()) await page.getByRole('textbox').fill('Fine')
      else await page.locator('input[type=radio], input[type=checkbox]').first().check()
      await page.getByRole('button', { name: 'Continue' }).click()
    }
    await expect(heading.first()).not.toHaveText(title)
  }
  await expect(heading.first()).toHaveText('Your task')
}

/** Answers every question that follows, one per screen, until the thanks. */
async function answerAll(page: Page) {
  const heading = page.getByRole('heading', { level: 1 })
  for (let screen = 0; screen < 12; screen++) {
    await expect(heading).toBeVisible()
    const title = await heading.innerText()
    if (title === 'Thank you') return
    if (await page.getByRole('radio').count()) await page.getByRole('radio').last().check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(heading).not.toHaveText(title)
  }
  throw new Error('The questions did not end')
}

test('a rehearsal attempt takes the landing task on the preview, through a front door on the ui-tests server', async ({ page }) => {
  const store = await openStore()
  const door = await startFrontDoor({ app: PREVIEW_URL, server: SERVER_URL, appHeaders: bypass ? { 'x-vercel-protection-bypass': bypass } : {} })
  try {
    const runId = await runFor(store)
    await setRunApp(store, runId, door.url)
    await mkdir(join(root, '.ui-tests'), { recursive: true })
    await writeFile(join(root, '.ui-tests', 'preview-run'), `${runId}\n`)
    // A rehearsal attempt of the first task: it is shown in the run but never counts toward n.
    const { attempt, token } = await store.createAttempt({ runId, participant: 'ci-preview', goalIndex: 0, rehearsal: true })

    await page.goto(`${door.url}/ui-tests/${runId}/?t=${encodeURIComponent(token)}`)
    await throughScreens(page)
    await page.getByRole('button', { name: 'Start task' }).click()
    await page.waitForURL(`${door.url}/`)
    // The tag the preview serves names the door, so the bar loads from it.
    expect(await page.locator('script[data-ui-tests]').getAttribute('data-ui-tests')).toBe(door.url)
    const bar = page.locator('[data-ui-tests-root]').getByRole('region')
    await expect(bar).toBeVisible()
    await page.locator('.hero .actions').getByRole('link', { name: 'Get started' }).click()
    await page.waitForURL(url => url.origin === door.url && url.pathname.startsWith('/docs/getting-started'))
    await bar.getByRole('button', { name: 'Done' }).click()
    await bar.getByRole('button', { name: 'Yes' }).click()
    await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=1$/)
    await answerAll(page)

    await expect.poll(async () => (await store.getAttempt(attempt.id))?.status).toBe('finished')
    expect((await store.getAttempt(attempt.id))?.reason).toBe('done')
    expect((await store.getSnapshot(attempt.id, 'end'))?.url).toContain('/docs/getting-started')
  } finally {
    await door.close()
    await store.close()
  }
})
