import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { buildTrace } from '../../packages/ui-tests/src/trace/build.ts'
import { PRODUCT_URL, barOf, createRehearsalRun } from './helpers'

/**
 * The first look at run time, a home page tour (issue #81): the start page live on the author's own site, untimed, where the person
 * can scroll and nothing can be clicked, then one open prompt, "What do you make of that page? …", with nothing about the purpose on
 * screen. No picture is taken and no page is framed.
 */

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', name)
const TOURING = "Have a look around. Scroll if you like; don't click anything yet."

test.use({ reducedMotion: 'reduce' })

test('tours the live start page with nothing clickable, then asks the four-part prompt, then the card', async ({ page }) => {
  const { playerUrl, runId } = await createRehearsalRun(fixture('first-look.ui.test.ts'))
  const framed: string[] = []
  page.on('frameattached', frame => framed.push(frame.url()))
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()

  await expect(page.getByRole('heading', { name: 'Before your task, have a look at a page' })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/plan the week/i)
  await page.getByRole('button', { name: 'Open the page' }).click()

  // The real page, with a bar that says what to do and one button; a click on the page goes nowhere, and scrolling still works.
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = barOf(page, TOURING)
  await expect(bar).toBeVisible()
  await expect(bar.getByRole('button')).toHaveCount(1)
  await page.getByRole('link', { name: 'Get started' }).first().click()
  await page.waitForTimeout(300)
  expect(page.url()).toBe(`${PRODUCT_URL}/`)
  await page.mouse.wheel(0, 600)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await bar.getByRole('button', { name: "I've had a look" }).click()

  await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=first-look/)
  await expect(page.getByRole('heading', { name: "What do you make of that page? Say what it is, whose it is, what you can do there, and what it's for." })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/plan the week/i)
  await expect(page.locator('img')).toHaveCount(0)
  await page.getByRole('textbox').fill('A site for testing what you built with real people')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  expect(framed).toEqual([])

  const store = await openStore()
  try {
    const [stored] = (await buildTrace(store, runId)).attempts
    // The server runs without a model here: the answer is kept uncoded, for the author to code in the trace.
    expect(stored!.impression).toEqual({ text: 'A site for testing what you built with real people', parts: null, uncoded: 'no model is configured' })
  } finally { await store.close() }
})

test('keyboard: Enter on a link while touring does nothing, and the bar\'s button ends the look', async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(fixture('first-look.ui.test.ts'))
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await page.getByRole('button', { name: 'Open the page' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  await expect(barOf(page, TOURING)).toBeVisible()
  const link = page.getByRole('link', { name: 'Get started' }).first()
  await link.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  expect(page.url()).toBe(`${PRODUCT_URL}/`)
  await barOf(page, TOURING).getByRole('button', { name: "I've had a look" }).press('Enter')
  await expect(page.getByRole('heading', { name: /What do you make of that page/ })).toBeVisible()
})

test('is skipped when firstLook is false', async ({ page }) => {
  const { playerUrl } = await createRehearsalRun(fixture('no-first-look.ui.test.ts'))
  await page.goto(playerUrl)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Before your task, have a look at a page' })).toHaveCount(0)
})
