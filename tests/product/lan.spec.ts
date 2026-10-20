import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { main, type Io } from '../../packages/ui-tests/src/cli/main.ts'
import { lanAddress } from '../../packages/ui-tests/src/runner/hosts.ts'
import { stubScreenshotter } from '../../packages/ui-tests/src/runner/screenshot.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'

/**
 * Inside the perimeter (Task 34): the product server binds 0.0.0.0, and a participant opens an invite link on this machine's own
 * LAN address. Nothing here reaches outside the machine; a route guard fails the test on any request to another host.
 */

const lan = lanAddress()
const PORT = 3100
const fixture = join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts')

test.skip(!lan, 'This machine has no non-loopback IPv4 interface, so there is no LAN address to test on.')
test.use({ reducedMotion: 'reduce' })

let work: string
test.beforeAll(async () => {
  // Inside the repository, so the study file finds the workspace's `ui-tests` package.
  await mkdir(join(import.meta.dirname, '..', '..', '.ui-tests'), { recursive: true })
  work = await mkdtemp(join(import.meta.dirname, '..', '..', '.ui-tests', 'lan-'))
  await copyFile(fixture, join(work, 'landing.ui.test.ts'))
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: 'http://${lan}:${PORT}' } }\n`)
})
test.afterAll(async () => { if (work) await rm(work, { recursive: true, force: true }) })

/** `ui-tests recruit` in the work directory, against the store the product server reads. */
async function recruit(argv: string[]) {
  let out = ''
  let err = ''
  const io: Io = {
    stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work,
    env: { UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR }, deps: { screenshotter: stubScreenshotter(new Uint8Array([0])) },
  }
  const code = await main(['recruit', ...argv], io)
  return { code, out, err }
}

test('recruit --host gives links on the LAN address, and a participant there completes the landing task', async ({ page, context }) => {
  const key = `lan:${Date.now()}`
  const { code, out, err } = await recruit(['--json', '--host', lan!, '--key', key])
  expect(code, err).toBe(0)
  const handle = JSON.parse(out) as { run: string; invites: string[] }
  expect(handle.invites.length).toBeGreaterThan(0)
  for (const link of handle.invites) expect(link.startsWith(`http://${lan}:${PORT}/ui-tests/${handle.run}/?t=`), link).toBe(true)
  expect(err).toContain('Inside the perimeter')

  // Nothing leaves for any host other than the LAN address.
  const elsewhere: string[] = []
  await context.route('**', route => {
    const url = new URL(route.request().url())
    if (url.hostname === lan || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    elsewhere.push(route.request().url())
    return route.abort()
  })

  const base = `http://${lan}:${PORT}`
  await page.goto(handle.invites[0]!)
  // A link run meets the screener, consent and the practice screen before the card; answer whichever screen is up.
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
  expect(new URL(page.url()).origin).toBe(base)
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${base}/`)
  const bar = page.getByRole('region', { name: 'Read the landing page' })
  await expect(bar).toBeVisible()
  const ended = page.waitForResponse(r => r.url() === `${base}/api/ui-tests/` && r.request().postDataJSON()?.action === 'end')
  await bar.getByRole('button', { name: 'Done' }).click()
  await bar.getByRole('button', { name: 'Yes' }).click()
  expect((await ended).status()).toBe(200)
  await page.waitForURL(`${base}/ui-tests/${handle.run}/?after=1`)
  await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
  expect(elsewhere).toEqual([])

  // The record is in the local store the server reads.
  const store = await openStore({ UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR })
  try {
    const run = (await store.listRuns()).find(r => r.key === key)!
    expect(run.reachability).toMatchObject({ mode: 'perimeter' })
    // Done is stored the moment it is confirmed; the questions that follow settle the status afterwards.
    const ended = (await store.listAttempts(run.run)).filter(a => a.reason === 'done')
    expect(ended).toHaveLength(1)
  } finally { await store.close() }
})
