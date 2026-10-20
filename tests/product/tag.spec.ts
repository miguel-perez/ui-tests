import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page, type Request } from '@playwright/test'
import { tagFor } from '../../packages/ui-tests/src/browser/tag.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { PLAIN_URL, PRODUCT_URL, SERVER_URL, createRehearsalRun } from './helpers'

/**
 * The tag on a plain static site and on this site: from the player on `ui-tests serve` to the app's page and back, with the bar in a
 * shadow root and the attempt key as the page's only credential.
 */

const fixture = join(import.meta.dirname, 'fixtures', 'plain.ui.test.ts')
const plain = join(import.meta.dirname, 'fixtures', 'plain')
const ROOT = '[data-ui-tests-root]'
const GOAL = 'Reach the next page'
const STORED = 'ui-tests-attempt'

const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), STORED)

/** From the player's consent to the app's page: returns the handoff URL the player was given. */
async function startTask(page: Page, playerUrl: string): Promise<string> {
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  // The address the page commits to, before the tag takes the code out of it.
  const handoff = page.waitForEvent('framenavigated', (frame) => frame === page.mainFrame() && frame.url().includes('#ui-tests='))
  await page.getByRole('button', { name: 'Start task' }).click()
  return (await handoff).url()
}

test('a page with the tag and no attempt makes no request and changes nothing', async ({ page }) => {
  const elsewhere: string[] = []
  page.on('request', (r) => { if (new URL(r.url()).origin !== PLAIN_URL) elsewhere.push(r.url()) })
  await page.goto(PLAIN_URL)
  await page.waitForLoadState('networkidle')
  expect(elsewhere).toEqual([])
  await expect(page.locator(ROOT)).toHaveCount(0)
  const file = await readFile(join(plain, 'index.html'), 'utf8')
  const body = /<body>([\s\S]*)<\/body>/.exec(file)![1]!
  expect((await page.evaluate(() => document.body.innerHTML)).trim()).toBe(body.trim())
})

test('a person goes from the player to the plain page and back, with the bar in a shadow root', async ({ page }) => {
  const { runId, playerUrl } = await createRehearsalRun(fixture, { app: PLAIN_URL, player: SERVER_URL })
  // What the app's page sends to the collector, and every cookie anything sets on the app's origin.
  const calls: Request[] = []
  const appCookies: string[] = []
  page.on('request', (r) => { if (r.frame().url().startsWith(PLAIN_URL) && new URL(r.url()).pathname.startsWith('/api/ui-tests/')) calls.push(r) })
  page.on('response', async (r) => {
    const fromApp = new URL(r.url()).origin === PLAIN_URL || r.frame().url().startsWith(PLAIN_URL)
    const set = await r.headerValue('set-cookie').catch(() => null)
    if (fromApp && set) appCookies.push(set)
  })

  await startTask(page, playerUrl)
  await page.waitForURL(`${PLAIN_URL}/`)
  expect(new URL(page.url()).hash).toBe('')
  const bar = page.getByRole('region', { name: GOAL })
  await expect(bar).toBeVisible()
  expect(await page.locator(ROOT).evaluate((host) => host.shadowRoot !== null)).toBe(true)
  await expect(page.locator(ROOT).getByRole('button', { name: 'Done' })).toBeVisible()
  await expect(page.locator(ROOT).getByRole('button', { name: "I couldn't do this" })).toBeVisible()
  expect(JSON.parse((await stored(page))!)).toMatchObject({ v: 1, server: SERVER_URL, run: runId })

  await page.getByRole('link', { name: 'Go to the next page' }).click()
  await page.waitForURL(`${PLAIN_URL}/next.html`)
  await expect(bar).toBeVisible()

  await bar.getByRole('button', { name: 'Done' }).click()
  await expect(bar.getByText('Finished this task?')).toBeVisible()
  await bar.getByRole('button', { name: 'Yes' }).click()
  await page.waitForURL(`${SERVER_URL}/ui-tests/${runId}/?after=1`)
  await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()

  // The page held the attempt key and nothing else: no cookie came to it, and none went from it.
  expect(appCookies).toEqual([])
  const collector = calls.filter((r) => new URL(r.url()).pathname === '/api/ui-tests/')
  expect(collector.length).toBeGreaterThan(0)
  for (const call of collector) {
    const headers = await call.allHeaders()
    expect(headers.authorization, call.url()).toMatch(/^Bearer [0-9a-f]{64}$/)
    expect(headers.cookie, call.url()).toBeUndefined()
  }
  for (const call of calls) expect((await call.allHeaders()).cookie, call.url()).toBeUndefined()

  // The attempt is over on the app's origin too.
  const app = await page.context().newPage()
  await app.goto(`${PLAIN_URL}/next.html`)
  expect(await stored(app)).toBeNull()
  await expect(app.locator(ROOT)).toHaveCount(0)

  const store = await openStore()
  try {
    const [attempt] = await store.listAttempts(runId)
    expect(attempt!.status).toBe('questions')
    expect((await store.getSnapshot(attempt!.id, 'end'))?.url).toMatch(/\/next\.html$/)
  } finally {
    await store.close()
  }
})

test('every tab of the app sees the attempt, and the end', async ({ page, context }) => {
  const { playerUrl } = await createRehearsalRun(fixture, { app: PLAIN_URL, player: SERVER_URL })
  await startTask(page, playerUrl)
  await page.waitForURL(`${PLAIN_URL}/`)
  const bar = page.getByRole('region', { name: GOAL })
  await expect(bar).toBeVisible()

  const other = await context.newPage()
  await other.goto(`${PLAIN_URL}/next.html`)
  await expect(other.getByRole('region', { name: GOAL })).toBeVisible()

  await bar.getByRole('button', { name: 'Done' }).click()
  await bar.getByRole('button', { name: 'Yes' }).click()
  await expect(other.locator(ROOT)).toHaveCount(0, { timeout: 2000 })
})

test("the host page's CSS cannot hide the bar", async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(fixture, { app: PLAIN_URL, player: SERVER_URL })
  await startTask(page, playerUrl)
  await page.waitForURL(`${PLAIN_URL}/`)
  await expect(page.getByRole('region', { name: GOAL })).toBeVisible()
  // The task starts on the plain page; the next page the person opens hides every element it has.
  await page.goto(`${PLAIN_URL}/hostile.html`)
  const done = page.locator(ROOT).getByRole('button', { name: 'Done' })
  await expect(done).toBeVisible()
  await done.click()
  await expect(page.locator(ROOT).getByText('Finished this task?')).toBeVisible()
})

test('a spent or crafted link loads nothing from elsewhere', async ({ page, browser }) => {
  const { runId, playerUrl } = await createRehearsalRun(fixture, { app: PLAIN_URL, player: SERVER_URL })
  const handoff = await startTask(page, playerUrl)
  await page.waitForURL(`${PLAIN_URL}/`)
  await expect(page.getByRole('region', { name: GOAL })).toBeVisible()

  // The same link again, in a browser that keeps nothing: the code is spent.
  const fresh = await browser.newContext()
  try {
    const again = await fresh.newPage()
    const exchanged = again.waitForResponse((r) => r.url() === `${SERVER_URL}/api/ui-tests/exchange?run=${runId}`)
    await again.goto(handoff)
    // The exchange is the loader's last request: refused, it stops there.
    expect((await exchanged).status()).toBe(401)
    await expect(again.locator(ROOT)).toHaveCount(0)
    expect(await again.evaluate(() => localStorage.length)).toBe(0)

    // A link that names another script: only the tag's own server and the page itself are asked for one.
    const crafted = await fresh.newPage()
    const scripts: string[] = []
    crafted.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(new URL(r.url()).origin) })
    // The loader's last step is the exchange, at the tag's own server, which knows no such run and refuses the preflight.
    const exchange = crafted.waitForRequest((r) => r.url().startsWith(`${SERVER_URL}/api/ui-tests/exchange?run=`))
    await crafted.goto(`${PLAIN_URL}/#ui-tests=r_X.https%3A%2F%2Fevil.test%2Fx.js`)
    await exchange
    expect(scripts.length).toBeGreaterThan(0)
    for (const origin of scripts) expect([SERVER_URL, PLAIN_URL]).toContain(origin)
    await expect(crafted.locator(ROOT)).toHaveCount(0)
  } finally {
    await fresh.close()
  }
})

test('the collector refuses an origin the run does not know', async ({ request }) => {
  const { runId } = await createRehearsalRun(fixture, { app: PLAIN_URL, player: SERVER_URL })
  const response = await request.post(`${SERVER_URL}/api/ui-tests/exchange?run=${runId}`, { headers: { Origin: 'http://evil.test' }, data: { code: '0'.repeat(64) } })
  expect(response.status()).toBe(403)
  expect(response.headers()['access-control-allow-origin']).toBeUndefined()
})

test('apps/web carries the tag and shows one bar', async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts'), { app: PRODUCT_URL, player: SERVER_URL })
  await startTask(page, playerUrl)
  await page.waitForURL(`${PRODUCT_URL}/`)
  await expect(page.getByRole('region', { name: 'Read the landing page' })).toBeVisible()
  // The tag's bar, in its shadow root, has loaded; this site's own mount, which would show first, has stayed out.
  await expect.poll(() => page.locator(ROOT).evaluateAll((roots) => roots.filter((root) => root.shadowRoot).length)).toBe(1)
  await expect(page.locator(ROOT)).toHaveCount(1)
})

test('the plain fixture carries the tag init prints', async () => {
  for (const name of ['index.html', 'next.html', 'hostile.html']) {
    expect(await readFile(join(plain, name), 'utf8'), name).toContain(tagFor(SERVER_URL))
  }
})
