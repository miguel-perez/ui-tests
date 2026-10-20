import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { PRODUCT_URL, createRehearsalRun } from './helpers'

const fixture = join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts')
const COLLECTOR = `${PRODUCT_URL}/api/ui-tests/`
const BAR = '[data-ui-tests], [data-ui-tests-bar]'

test('the collector refuses a request without a token', async ({ request }) => {
  const response = await request.get(COLLECTOR)
  expect(response.status()).toBe(401)
})

test('the landing renders in server mode with no bar and no call to the collector when no run is on', async ({ page }) => {
  const calls: string[] = []
  page.on('request', (r) => { if (new URL(r.url()).pathname.startsWith('/api/ui-tests')) calls.push(r.url()) })
  await page.goto(`${PRODUCT_URL}/`)
  await expect(page.locator('h1').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  await expect(page.locator(BAR)).toHaveCount(0)
  expect(calls).toEqual([])
})

test('the static export holds no player and no collector', () => {
  const out = join(import.meta.dirname, '..', '..', 'apps', 'web', 'out')
  expect(existsSync(out), `${out} exists`).toBe(true)
  expect(existsSync(join(out, 'index.html'))).toBe(true)
  expect(existsSync(join(out, 'ui-tests'))).toBe(false)
  expect(existsSync(join(out, 'api'))).toBe(false)
})

test('a rehearsal link opens the consent', async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(fixture)
  await page.goto(playerUrl)
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'I agree and continue' })).toBeEnabled()
})

test('after consent the bar shows on the target, and Done returns to the questions with the cookie alone', async ({ page, context }) => {
  const { runId, playerUrl } = await createRehearsalRun(fixture)
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  // The token has left the address bar; the cookies carry the run from here.
  expect(new URL(page.url()).search).toBe('')
  const cookies = await context.cookies(PRODUCT_URL)
  expect(cookies.find((c) => c.name === 'ui-tests-run')).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
  expect(cookies.find((c) => c.name === 'ui-tests-active')).toMatchObject({ value: '1', httpOnly: false })

  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = page.getByRole('region', { name: 'Read the landing page' })
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('button', { name: "I couldn't do this" })).toBeVisible()

  const ended = page.waitForResponse((r) => r.url() === COLLECTOR && r.request().method() === 'POST' && r.request().postDataJSON()?.action === 'end')
  await bar.getByRole('button', { name: 'Done' }).click()
  await expect(bar.getByText('Finished this task?')).toBeVisible()
  await bar.getByRole('button', { name: 'Yes' }).click()
  const end = await ended
  // Cookie-authenticated and same-origin: no Authorization header, an Origin the collector accepts.
  expect(end.request().headers().authorization).toBeUndefined()
  expect(end.status()).toBe(200)
  await page.waitForURL(`${PRODUCT_URL}/ui-tests/${runId}/?after=1`)
  await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
})

test('more time answers with the view the bar reads, and the limit grows once', async ({ page }) => {
  await page.clock.install()
  const { playerUrl } = await createRehearsalRun(fixture)
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = page.getByRole('region', { name: 'Read the landing page' })
  await expect(bar).toBeVisible()
  const before = (await (await page.request.get(COLLECTOR)).json()) as { goal: { timeoutSeconds: number } }

  // The offer comes at four fifths of the limit; the clock is moved there rather than waited for.
  await page.clock.fastForward(Math.ceil(before.goal.timeoutSeconds * 0.85) * 1000)
  const offer = bar.getByRole('button', { name: 'More time' })
  await expect(offer).toBeVisible()
  const replied = page.waitForResponse((r) => r.url() === COLLECTOR && r.request().postDataJSON()?.action === 'more-time')
  await offer.click()
  const reply = await replied
  expect(reply.status()).toBe(200)
  const view = (await reply.json()) as { status: string; attempt: string; goal: { timeoutSeconds: number; name: string } }
  expect(view).toMatchObject({ status: 'active', goal: { name: 'Read the landing page', timeoutSeconds: before.goal.timeoutSeconds + Math.ceil(before.goal.timeoutSeconds / 2) } })
  await expect(offer).toHaveCount(0)
  await expect(bar).toBeVisible()

  // A second request is refused; the bar treats that as spent.
  const again = await page.evaluate(async (url) => (await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'more-time' }) })).status, COLLECTOR)
  expect(again).toBe(409)
})
