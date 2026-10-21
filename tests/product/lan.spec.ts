import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { main, type Io } from '../../packages/ui-tests/src/cli/main.ts'
import { lanAddress } from '../../packages/ui-tests/src/runner/hosts.ts'
import { stubScreenshotter } from '../../packages/ui-tests/src/runner/screenshot.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { PRODUCT_URL, SERVER_URL, isBarCall } from './helpers'

/**
 * Inside the perimeter: `recruit --host <LAN address>` starts a front door on every interface that serves the product server and
 * `ui-tests serve` (both on this machine's loopback) from one origin, and points the app's tag at it. A participant opens an invite
 * link at the LAN address and takes the task with every request on the door's origin; a route guard fails the test on any other.
 */

const lan = lanAddress()
const fixture = join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts')

test.skip(!lan, 'This machine has no non-loopback IPv4 interface, so there is no LAN address to test on.')
test.use({ reducedMotion: 'reduce' })

let work: string
test.beforeAll(async () => {
  // Inside the repository, so the study file finds the workspace's `ui-tests` package.
  await mkdir(join(import.meta.dirname, '..', '..', '.ui-tests'), { recursive: true })
  work = await mkdtemp(join(import.meta.dirname, '..', '..', '.ui-tests', 'lan-'))
  await copyFile(fixture, join(work, 'landing.ui.test.ts'))
  // The default server address, where `ui-tests serve` runs with no public address pinned, so the door's is its own.
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: '${PRODUCT_URL}' } }\n`)
})
test.afterAll(async () => { if (work) await rm(work, { recursive: true, force: true }) })

/** `ui-tests recruit` in the work directory, against the store the product server reads; it holds its front door until `stop`. */
function recruit(argv: string[]) {
  let out = ''
  let err = ''
  const stop = new AbortController()
  const io: Io = {
    stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work,
    env: { UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR }, deps: { screenshotter: stubScreenshotter(new Uint8Array([0])), signal: stop.signal },
  }
  const done = main(['recruit', ...argv], io)
  const ready = async (): Promise<{ run: string; invites: string[] }> => {
    for (let i = 0; i < 600 && !out.trim().endsWith('}'); i++) {
      if (await Promise.race([done.then(() => true), new Promise(resolve => setTimeout(resolve, 50, false))])) break
    }
    expect(out.trim().endsWith('}'), err).toBe(true)
    return JSON.parse(out)
  }
  return { ready, err: () => err, stop: async () => { stop.abort(); return done } }
}

test('recruit --host gives links on the front door at the LAN address, and a participant there completes the landing task', async ({ page, context }) => {
  const key = `lan:${Date.now()}`
  const session = recruit(['--json', '--host', lan!, '--key', key])
  try {
    const handle = await session.ready()
    expect(handle.invites.length).toBeGreaterThan(0)
    const door = new URL(handle.invites[0]!).origin
    expect(new URL(door).hostname).toBe(lan)
    expect(new URL(door).port).not.toBe(new URL(PRODUCT_URL).port)
    expect(door).not.toBe(SERVER_URL)
    for (const link of handle.invites) expect(link.startsWith(`${door}/ui-tests/${handle.run}/?t=`), link).toBe(true)
    expect(session.err()).toContain(`Inside the perimeter: links are on ${door}.`)

    // Every request is on the door's origin: the player, the app, the bar and the collector.
    const elsewhere: string[] = []
    await context.route('**', route => {
      const url = new URL(route.request().url())
      if (url.origin === door || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
      elsewhere.push(route.request().url())
      return route.abort()
    })

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
    expect(new URL(page.url()).origin).toBe(door)
    await page.getByRole('button', { name: 'Start task' }).click()
    await page.waitForURL(`${door}/`)
    // The app's tag names the door, so the bar loads from it.
    expect(await page.locator('script[data-ui-tests]').getAttribute('data-ui-tests')).toBe(door)
    const bar = page.getByRole('region', { name: 'Read the landing page' })
    await expect(bar).toBeVisible()
    const ended = page.waitForResponse(r => isBarCall(r, 'end'))
    await bar.getByRole('button', { name: 'Done' }).click()
    await bar.getByRole('button', { name: 'Yes' }).click()
    expect((await ended).status()).toBe(200)
    // Done leads back to the player on the door, where this participant's link was opened, and straight to the questions.
    await page.waitForURL(`${door}/ui-tests/${handle.run}/?after=1`)
    await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
    expect(elsewhere).toEqual([])

    // The record is in the local store the server reads.
    const store = await openStore({ UI_TESTS_DATA_DIR: process.env.UI_TESTS_DATA_DIR })
    try {
      const run = (await store.listRuns()).find(r => r.key === key)!
      expect(run.reachability).toMatchObject({ mode: 'perimeter' })
      expect(run.appUrl).toBe(door)
      // Done is stored the moment it is confirmed; the questions that follow settle the status afterwards.
      const ended = (await store.listAttempts(run.run)).filter(a => a.reason === 'done')
      expect(ended).toHaveLength(1)
    } finally { await store.close() }
  } finally {
    expect(await session.stop()).toBe(0)
  }
})
