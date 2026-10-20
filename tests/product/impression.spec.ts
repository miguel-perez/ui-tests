import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { buildTrace } from '../../packages/ui-tests/src/trace/build.ts'
import { createRehearsalRun } from './helpers'

/**
 * The first look at run time (Task 20): a fixation point, a picture of the start page for 500 ms, "What was that page for?" with
 * nothing about the purpose on screen, then the picture again for one click. The picture is taken by the runner (a stub here) and
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

  await expect(page.getByRole('heading', { name: 'Where would you click first?' })).toBeVisible()
  const hit = page.getByRole('button', { name: /Click where you would start/ })
  const box = (await hit.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5)
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  expect(framed).toEqual([])

  const store = await openStore()
  try {
    const [stored] = (await buildTrace(store, runId)).attempts
    expect(stored!.impression).toMatchObject({ text: 'To plan the week together with a team', code: 'named the purpose', codedBy: 'rule' })
    expect(stored!.impression!.firstClick!.x).toBeCloseTo(0.25, 1)
    expect(stored!.impression!.firstClick!.y).toBeCloseTo(0.5, 1)
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
