import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { compileStudy } from '../../packages/ui-tests/src/compile.ts'
import { bundleStudyFile, loadBundle } from '../../packages/ui-tests/src/load.ts'
import { signPath, verifyPath } from '../../packages/ui-tests/src/report/sign.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { PRODUCT_URL, SERVER_URL } from './helpers'

/**
 * The shared report (Task 25): `ui-tests serve` runs with UI_TESTS_SHARE_SECRET=test, a signed link renders the report with no
 * ui-tests branding, and everything without its own signature is a 404.
 */

const SECRET = 'test'
const fixture = join(import.meta.dirname, 'fixtures', 'mount.ui.test.ts')
const START = Date.now() - 100_000

/** A finished attempt with a recording (a page, a note) and one click that did nothing, four seconds in; with `video`, a screen video too. */
async function seedRun({ video = false } = {}): Promise<string> {
  const { code } = await bundleStudyFile(fixture)
  const [authored] = await loadBundle(code, fixture)
  const compiled = compileStudy(authored!, { author: 'Acme Labs', product: 'Acme' } as never)
  const store = await openStore()
  try {
    const { run } = await store.createRun({
      key: `e2e-report:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
      build: { url: PRODUCT_URL, commit: 'e2e' }, actor: 'human', compiled, hooksBundle: 'HOOKS_BUNDLE_NEVER_SHOWN', rehearsal: false, target: PRODUCT_URL,
    })
    const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p_report', goalIndex: 0, rehearsal: false })
    await store.updateAttempt(attempt.id, {
      status: 'finished', reason: 'done', purposes: compiled.consent.purposes,
      startedAt: new Date(START).toISOString(), endedAt: new Date(START + 9000).toISOString(),
      verification: { status: 'correct', steps: [] },
      answers: { 'goal0.ease': 6 },
    })
    const page = `${PRODUCT_URL}/`
    const dom = { type: 0, id: 1, childNodes: [{ type: 2, id: 2, tagName: 'html', attributes: {}, childNodes: [{ type: 2, id: 3, tagName: 'body', attributes: {}, childNodes: [{ type: 3, id: 4, textContent: 'A page' }] }] }] }
    await store.appendEvents(attempt.id, [
      { type: 'url', at: START + 100, url: page, seq: 1 },
      { type: 'click', at: START + 4000, url: page, target: 'div#inert', changed: false, seq: 2 },
      { type: 'rrweb', at: START, url: page, seq: 3, data: { type: 4, timestamp: START, data: { href: page, width: 800, height: 600 } } },
      { type: 'rrweb', at: START + 10, url: page, seq: 4, data: { type: 2, timestamp: START + 10, data: { node: dom, initialOffset: { left: 0, top: 0 } } } },
      { type: 'rrweb', at: START + 9000, url: page, seq: 5, data: { type: 5, timestamp: START + 9000, data: { tag: 'end', payload: {} } } },
    ])
    if (video) {
      const blob = await store.putBlob(attempt.id, 'video', new Uint8Array([1, 2, 3]), 'video/webm')
      await store.updateAttempt(attempt.id, { answers: { 'goal0.ease': 6, video: { chunks: [{ segment: START, seq: 0, blob, size: 3 }], pauses: {} } } })
    }
    return run.run
  } finally { await store.close() }
}

const signed = (path: string) => `${SERVER_URL}${path}?sig=${signPath(path, SECRET)}`

test('a signed link renders the report with no ui-tests branding; each person and each moment is a signed link', async ({ page }) => {
  const runId = await seedRun()
  const response = await page.goto(signed(`/r/${runId}`))
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: 'mount fixture' })).toBeVisible()
  await expect(page.getByText('By Acme Labs')).toBeVisible()
  for (const name of ['Effectiveness', 'Efficiency', 'Satisfaction', 'Fit']) await expect(page.getByText(name).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What worked' })).toBeVisible()

  // The title, the description and everything on the page leave the site that serves it out.
  expect((await page.title()).toLowerCase()).not.toContain('ui-tests')
  expect(((await page.locator('meta[name=description]').getAttribute('content')) ?? '').toLowerCase()).not.toContain('ui-tests')
  expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('ui-tests')
  const hrefs = await page.locator('a').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''))
  expect(hrefs.filter((href) => href.toLowerCase().includes('ui-tests'))).toEqual([])

  // Each person links to their own signed page.
  const person = page.getByRole('link', { name: 'Person 1', exact: true })
  const href = (await person.getAttribute('href'))!
  const url = new URL(href, SERVER_URL)
  expect(url.pathname).toBe(`/r/${runId}/p1/`)
  expect(verifyPath(url.pathname, url.searchParams.get('sig'), SECRET)).toBe(true)

  // A play chip opens the attempt at its moment, and the page does not open without its own signature.
  const chip = page.getByRole('link', { name: /^Play moment 1, Person 1$/ })
  await expect(chip).toBeVisible()
  const chipUrl = new URL((await chip.getAttribute('href'))!, SERVER_URL)
  expect(chipUrl.searchParams.get('at')).toBe(String(START + 4000))
  expect(verifyPath(chipUrl.pathname, chipUrl.searchParams.get('sig'), SECRET)).toBe(true)
  await chip.click()
  await expect(page.getByRole('heading', { name: /^Person 1/ })).toBeVisible()
  await expect(page.getByText('Opened at the moment 0:04')).toBeVisible()
  const player = page.locator('[data-replay-ready="true"]').first()
  await expect(player).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('status').last()).toHaveText('Moment at 0:04')
  await expect.poll(async () => Number(await player.getAttribute('data-current-ms'))).toBeCloseTo(4000, -2)
  expect((await page.title()).toLowerCase()).not.toContain('ui-tests')

  await page.getByRole('link', { name: 'Back to the report' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'mount fixture' })).toBeVisible()
})

test('the slash makes no difference to the signature', async ({ page }) => {
  const runId = await seedRun()
  for (const path of [`/r/${runId}`, `/r/${runId}/`]) {
    const response = await page.goto(`${SERVER_URL}${path}?sig=${signPath(`/r/${runId}`, SECRET)}`)
    expect(response?.status(), path).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'mount fixture' })).toBeVisible()
  }
})

test('an unsigned, tampered, other-run or other-page link is a 404', async ({ page, request }) => {
  const runId = await seedRun()
  const sig = signPath(`/r/${runId}`, SECRET)
  const status = async (url: string) => (await page.goto(url))?.status()
  expect(await status(`${SERVER_URL}/r/${runId}`)).toBe(404)
  expect(await status(`${SERVER_URL}/r/${runId}/`)).toBe(404)
  expect(await status(`${SERVER_URL}/r/${runId}/?sig=`)).toBe(404)
  expect(await status(`${SERVER_URL}/r/${runId}/?sig=${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}`)).toBe(404)
  expect(await status(`${SERVER_URL}/r/${runId}/?sig=${signPath(`/r/${runId}`, 'not-the-secret')}`)).toBe(404)
  // A signature is for one path: the report's does not open a person, and another run's does not open this one.
  expect(await status(`${SERVER_URL}/r/${runId}/p1/?sig=${sig}`)).toBe(404)
  expect(await status(`${SERVER_URL}/r/r_other/?sig=${sig}`)).toBe(404)
  expect(await status(signed('/r/r_nothing'))).toBe(404)
  expect(await status(signed(`/r/${runId}/p7`))).toBe(404)
  expect((await request.get(`${SERVER_URL}/r/${runId}/`)).status()).toBe(404)
  await expect(page.getByText('ui-tests')).toHaveCount(0)
})

test('the report and a person page have no axe violations', async ({ page }) => {
  const runId = await seedRun()
  for (const path of [`/r/${runId}`, `/r/${runId}/p1`]) {
    await page.goto(signed(path))
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    if (path.endsWith('p1')) await expect(page.locator('[data-replay-ready="true"]').first()).toBeVisible({ timeout: 30_000 })
    // The recording's own frame is rrweb's, not this page's.
    const results = await new AxeBuilder({ page }).exclude('.rr-player').analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), path).toEqual([])
  }
})

test('a person\'s video is on the server, under its own signature', async ({ page, request }) => {
  const runId = await seedRun({ video: true })
  await page.goto(signed(`/r/${runId}/p1`))
  const src = (await page.locator('video[data-clip]').getAttribute('src'))!
  const url = new URL(src, SERVER_URL)
  expect(url.origin).toBe(SERVER_URL)
  expect(url.pathname).toBe(`/rv/${runId}/p1/`)
  expect(verifyPath(url.pathname, url.searchParams.get('sig'), SECRET)).toBe(true)
  const response = await request.get(url.toString())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('video/')
  expect((await request.get(`${SERVER_URL}/rv/${runId}/p1`)).status()).toBe(404)
})
