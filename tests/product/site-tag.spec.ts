import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { BAR, PRODUCT_URL, SERVER_URL, barOf, createRehearsalRun, isBarCall } from './helpers'

/**
 * This site as it ships: a static export that carries the tag and nothing else of ui-tests. The player, the collector and the report
 * are on `ui-tests serve`; the page holds the attempt key, and the participant's cookie stays on the server.
 */

const fixture = join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts')
const GOAL = 'Read the landing page'
/** The same export reached by another host name. Cookies ignore ports, so only a second host tells the server's cookies from the app's. */
const SITE = 'http://localhost:3000'

/** Consent on the player, then Start task: the person lands on the app's page with the bar. */
async function startTask(page: Page, playerUrl: string, app = PRODUCT_URL) {
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${app}/`)
  await expect(barOf(page, GOAL)).toBeVisible()
}

/** The bar's view, read as the bar reads it: from the tag's server, with the attempt key the page holds. */
const barView = (page: Page) => page.evaluate(async () => {
  const stored = JSON.parse(localStorage.getItem('ui-tests-attempt')!) as { server: string; run: string; key: string }
  const response = await fetch(`${stored.server}/api/ui-tests/?run=${stored.run}&view=bar`, { headers: { Authorization: `Bearer ${stored.key}` } })
  return (await response.json()) as { goal: { name: string; timeoutSeconds: number } }
})

test('the landing carries the tag and makes no request without an attempt', async ({ page }) => {
  const elsewhere: string[] = []
  page.on('request', (r) => { if (new URL(r.url()).origin !== PRODUCT_URL) elsewhere.push(r.url()) })
  await page.goto(`${PRODUCT_URL}/`)
  await expect(page.locator('h1').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(await page.locator('script[data-ui-tests]').getAttribute('data-ui-tests')).toBe(SERVER_URL)
  expect(elsewhere).toEqual([])
  await expect(page.locator(BAR)).toHaveCount(0)
})

test('the static export holds no player, collector or report', () => {
  const out = join(import.meta.dirname, '..', '..', 'apps', 'web', 'out')
  expect(existsSync(join(out, 'index.html')), `${out}/index.html exists`).toBe(true)
  for (const directory of ['ui-tests', 'api', 'r', 'rv']) expect(existsSync(join(out, directory)), directory).toBe(false)
})

test('a rehearsal link opens the consent on the server', async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(fixture)
  expect(new URL(playerUrl).origin).toBe(SERVER_URL)
  await page.goto(playerUrl)
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'I agree and continue' })).toBeEnabled()
})

test('the cookie stays on the server', async ({ page, context }) => {
  const { playerUrl } = await createRehearsalRun(fixture, { app: SITE })
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  const server = await context.cookies(SERVER_URL)
  expect(server.find((c) => c.name === 'ui-tests-run')).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  expect(server.find((c) => c.name === 'ui-tests-active')).toBeUndefined()

  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${SITE}/`)
  await expect(barOf(page, GOAL)).toBeVisible()
  expect((await context.cookies(SITE)).filter((c) => c.name.startsWith('ui-tests'))).toEqual([])
})

test('Done on the site returns to the questions with the attempt key alone', async ({ page }) => {
  const { runId, playerUrl } = await createRehearsalRun(fixture)
  await startTask(page, playerUrl)
  // One bar, in its shadow root.
  await expect(page.locator(BAR)).toHaveCount(1)
  expect(await page.locator(BAR).evaluate((host) => host.shadowRoot !== null)).toBe(true)
  const bar = barOf(page, GOAL)
  await expect(bar.getByRole('button', { name: "I couldn't do this" })).toBeVisible()

  const ended = page.waitForResponse((r) => isBarCall(r, 'end'))
  await bar.getByRole('button', { name: 'Done' }).click()
  await expect(bar.getByText('Finished this task?')).toBeVisible()
  await bar.getByRole('button', { name: 'Yes' }).click()
  const end = await ended
  expect(new URL(end.url()).origin).toBe(SERVER_URL)
  const headers = await end.request().allHeaders()
  expect(headers.authorization).toMatch(/^Bearer [0-9a-f]{64}$/)
  expect(headers.cookie).toBeUndefined()
  expect(end.status()).toBe(200)
  await page.waitForURL(`${SERVER_URL}/ui-tests/${runId}/?after=1`)
  await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
})

test('more time answers with the view the bar reads, and the limit grows once', async ({ page }) => {
  await page.clock.install()
  const { playerUrl } = await createRehearsalRun(fixture)
  await startTask(page, playerUrl)
  const bar = barOf(page, GOAL)
  const before = await barView(page)

  // The offer comes at four fifths of the limit; the clock is moved there rather than waited for.
  await page.clock.fastForward(Math.ceil(before.goal.timeoutSeconds * 0.85) * 1000)
  const offer = bar.getByRole('button', { name: 'More time' })
  await expect(offer).toBeVisible()
  const replied = page.waitForResponse((r) => isBarCall(r, 'more-time'))
  await offer.click()
  const reply = await replied
  expect(reply.status()).toBe(200)
  const view = (await reply.json()) as { status: string; goal: { timeoutSeconds: number; name: string } }
  expect(view).toMatchObject({ status: 'active', goal: { name: GOAL, timeoutSeconds: before.goal.timeoutSeconds + Math.ceil(before.goal.timeoutSeconds / 2) } })
  expect((await barView(page)).goal.timeoutSeconds).toBe(view.goal.timeoutSeconds)
  await expect(offer).toHaveCount(0)
  await expect(bar).toBeVisible()

  // A second request, with the same key, is refused; the bar treats that as spent.
  const again = await page.evaluate(async () => {
    const stored = JSON.parse(localStorage.getItem('ui-tests-attempt')!) as { server: string; run: string; key: string }
    const response = await fetch(`${stored.server}/api/ui-tests/?run=${stored.run}`, { method: 'POST', headers: { Authorization: `Bearer ${stored.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'more-time' }) })
    return response.status
  })
  expect(again).toBe(409)
})
