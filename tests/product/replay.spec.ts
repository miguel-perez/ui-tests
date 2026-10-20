import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { buildTrace } from '../../packages/ui-tests/src/trace/build.ts'
import { serveTrace } from '../../packages/ui-tests/src/trace/serve.ts'
import { PRODUCT_URL, createRehearsalRun } from './helpers'

/**
 * Event replay (Task 23): rrweb is fetched only once an attempt has begun, every typed value is masked and private fields are
 * blocked, and the trace plays the highlight reel and seeks to each moment.
 */

const fixture = join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts')
/** A string only rrweb's own code carries. */
const RRWEB_MARK = 'rr-block'
const SECRET = 'hunter2-typed-by-the-participant'
const CARD = '4111111111111111'
const RICH = 'typed-into-a-rich-text-editor'

/** Script bodies the page fetches, so a chunk can be recognised by what it holds and not by its hashed name. */
function watchScripts(page: Page) {
  const scripts: Promise<string>[] = []
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') scripts.push(response.text().catch(() => ''))
  })
  return async () => (await Promise.all(scripts)).filter((body) => body.includes(RRWEB_MARK)).length
}

test('the landing loads no rrweb without the run cookie', async ({ page }) => {
  const rrwebScripts = watchScripts(page)
  await page.goto(`${PRODUCT_URL}/`)
  await expect(page.locator('h1').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(await rrwebScripts()).toBe(0)
})

test('during an attempt rrweb loads, typed values never reach the store, and the trace plays the reel and seeks to each moment', async ({ page }) => {
  test.setTimeout(120_000)
  const { runId, playerUrl } = await createRehearsalRun(fixture)
  const rrwebScripts = watchScripts(page)
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  // Nothing of rrweb has been fetched before the attempt begins.
  expect(await rrwebScripts()).toBe(0)
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = page.getByRole('region', { name: 'Read the landing page' })
  await expect(bar).toBeVisible()
  await expect.poll(rrwebScripts).toBeGreaterThan(0)

  // A page with a text field, a password field, a card field and something that does not respond.
  await page.evaluate(() => {
    const form = document.createElement('div')
    form.id = 'probe'
    form.innerHTML = '<input id="name" type="text" value="prefilled-name"><input id="pw" type="password"><input id="cc" autocomplete="cc-number"><textarea id="note"></textarea><div id="rich" contenteditable="true"><p>prefilled-rich</p></div><div id="inert" style="padding:20px">Nothing happens here</div>'
    document.body.prepend(form)
  })
  await page.locator('#name').fill(SECRET)
  await page.locator('#pw').fill(SECRET)
  await page.locator('#cc').fill(CARD)
  await page.locator('#note').fill(SECRET)
  await page.locator('#rich').focus()
  await page.keyboard.type(RICH)
  // Late enough that the moment starts after the recording does, so seeking to it is not seeking to the start.
  await page.waitForTimeout(4000)
  await page.locator('#inert').click()
  // A second dead click, far enough on that its window does not merge with the first: the reel has two moments.
  await page.waitForTimeout(8000)
  await page.locator('#inert').click()
  await page.waitForTimeout(800)

  const ended = page.waitForResponse((r) => r.url() === `${PRODUCT_URL}/api/ui-tests/` && r.request().postDataJSON()?.action === 'end')
  await bar.getByRole('button', { name: 'Done' }).click()
  await bar.getByRole('button', { name: 'Yes' }).click()
  expect((await ended).status()).toBe(200)
  await page.waitForURL(`${PRODUCT_URL}/ui-tests/${runId}/?after=1`)

  const store = await openStore()
  const trace = serveTrace({ store, port: 0 })
  try {
    const stored = await store.listEvents((await store.listAttempts(runId))[0]!.id)
    const replay = stored.filter((e) => e.type === 'rrweb')
    expect(replay.length).toBeGreaterThan(2)
    // The recording starts from a whole page, and holds nothing that was typed.
    expect(replay.some((e) => (e.data as { type: number }).type === 2)).toBe(true)
    const text = JSON.stringify(replay)
    for (const secret of [SECRET, CARD, 'prefilled-name', RICH, 'prefilled-rich']) expect(text).not.toContain(secret)
    // The bar's own content is not in it either (its stylesheet is; its text and buttons are not).
    expect(text).not.toContain('Read the landing page')

    const traced = (await buildTrace(store, runId)).attempts[0]!
    expect(traced.reel.some((m) => m.signal.kind === 'dead-click')).toBe(true)

    const { url } = await trace
    await page.goto(`${url}/runs/${runId}/`)
    const player = page.locator('[data-replay-ready="true"]').first()
    await expect(player).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('.rr-player')).toBeVisible()
    const moments = page.getByRole('button', { name: /^Go to / })
    expect(await moments.count()).toBe(traced.reel.length)

    // Each moment seeks to where it starts, from the start of the recording.
    const first = (replay[0]!.data as { timestamp: number }).timestamp
    for (let i = 0; i < traced.reel.length; i++) {
      expect(traced.reel[i]!.start - first).toBeGreaterThan(500)
      await moments.nth(i).click()
      await expect(page.getByRole('status')).toHaveText(`Moment ${i + 1} of ${traced.reel.length}`)
      await expect.poll(async () => Number(await player.getAttribute('data-current-ms'))).toBeCloseTo(Math.max(0, traced.reel[i]!.start - first), -2)
    }

    // The reel plays from its first moment.
    // It really plays: moment 1, then the player's clock reaches moment 2's start, then the reel ends.
    expect(traced.reel).toHaveLength(2)
    await page.getByRole('button', { name: 'Play the highlight reel' }).click()
    await expect(page.getByRole('status')).toHaveText('Highlight reel: moment 1 of 2', { timeout: 10_000 })
    await expect(page.getByRole('status')).toHaveText('Highlight reel: moment 2 of 2', { timeout: 20_000 })
    expect(Number(await player.getAttribute('data-current-ms'))).toBeGreaterThanOrEqual(traced.reel[1]!.start - first - 200)
    await expect(page.getByRole('status')).toHaveText('End of the highlight reel', { timeout: 20_000 })
    expect(Number(await player.getAttribute('data-current-ms'))).toBeGreaterThanOrEqual(traced.reel[1]!.end - first - 500)
  } finally {
    await (await trace).close()
    await store.close()
  }
})
