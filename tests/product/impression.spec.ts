import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { buildTrace } from '../../packages/ui-tests/src/trace/build.ts'
import { PRODUCT_URL, createRehearsalRun } from './helpers'

/**
 * The first look at run time (Task 20): a fixation point, a picture of the start page for 500 ms, "What was that page for?" with
 * nothing about the purpose on screen, then the real page for one click, taken by the SDK on the author's own site. The picture is taken by the runner (a stub here) and
 * served by the collector; the participant's page never loads the page itself.
 */

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)
const shot = new Uint8Array(readFileSync(fixture('first-look.png')))

test.use({ reducedMotion: 'reduce' })

/** The marks the player leaves around the flash, read back from the page. */
const flashSpan = (page: Page) => page.evaluate(() => {
  const at = (name: string) => performance.getEntriesByName(name)[0]?.startTime
  return { start: at('first-look:flash-start'), end: at('first-look:flash-end') }
})

test('shows a fixation point, the picture for 500 ms, the open question, then the picture for one click', async ({ page }) => {
  const { playerUrl, runId } = await createRehearsalRun(fixture('first-look.ui.test.ts'), { shot })
  const framed: string[] = []
  page.on('frameattached', frame => framed.push(frame.url()))
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()

  await expect(page.getByRole('heading', { name: 'Get ready' })).toBeAttached()
  await expect(page.locator('.pl-fix')).toBeVisible()

  const question = page.getByRole('heading', { name: 'What was that page for?' })
  await expect(question).toBeVisible()
  const { start, end } = await flashSpan(page)
  // The marks are the player's own: the picture loaded, stayed for the flash, and was taken away.
  expect(start).toBeDefined()
  expect(end).toBeDefined()
  expect(Math.abs((end! - start!) - 500)).toBeLessThan(100)

  // Nothing about the purpose is on screen while the question is asked.
  await expect(page.locator('body')).not.toContainText(/plan the week/i)
  await expect(page.locator('img')).toHaveCount(0)
  await page.getByRole('textbox').fill('To plan the week together with a team')
  await page.getByRole('button', { name: 'Continue' }).click()

  // The real page, with a one-line bar that has no Done and no way out; the first real click is recorded and the person goes back for the card.
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = page.getByRole('region', { name: 'Click where you would start.' })
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('button')).toHaveCount(0)
  await page.getByRole('link', { name: 'Get started' }).first().click()
  await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=first-look/)
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  expect(framed).toEqual([])

  const store = await openStore()
  try {
    const [stored] = (await buildTrace(store, runId)).attempts
    expect(stored!.impression).toMatchObject({ text: 'To plan the week together with a team', code: 'named the purpose', codedBy: 'rule' })
    expect(stored!.impression!.firstClick).toMatchObject({ onPath: true, url: `${PRODUCT_URL}/docs/getting-started/` })
    expect(stored!.impression!.firstClick!.target).toMatch(/a/)
  } finally { await store.close() }
})

test('keyboard: Tab to a link and Enter records that element, not a position', async ({ page }) => {
  const { playerUrl, runId } = await createRehearsalRun(fixture('first-look.ui.test.ts'), { shot })
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await page.getByRole('textbox').fill('A planner')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const link = page.getByRole('link', { name: 'Get started' }).first()
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  const store = await openStore()
  try {
    const click = (await buildTrace(store, runId)).attempts[0]!.impression!.firstClick
    expect(click).toMatchObject({ onPath: true })
    expect(Object.keys(click!).sort()).toEqual(['at', 'onPath', 'target', 'url'])
  } finally { await store.close() }
})

test('a first look on a page that is not the target ends with the question, and no click is recorded', async ({ page }) => {
  const { playerUrl, runId } = await createRehearsalRun(fixture('readme-first-look.ui.test.ts'), { shot })
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await page.getByRole('textbox').fill('A readme')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  const store = await openStore()
  try {
    expect((await buildTrace(store, runId)).attempts[0]!.impression).toMatchObject({ text: 'A readme', firstClick: null, firstClickReason: expect.stringContaining('not on the target') })
  } finally { await store.close() }
})

test('is skipped when firstLook is false', async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(fixture('no-first-look.ui.test.ts'), { shot })
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'What was that page for?' })).toHaveCount(0)
})

test('is skipped when no picture of the page could be taken', async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(fixture('first-look.ui.test.ts'))
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
})
