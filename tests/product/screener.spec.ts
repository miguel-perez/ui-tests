import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { createLinkRun } from './helpers'

const fixture = join(import.meta.dirname, 'fixtures', 'screener.ui.test.ts')

/** Everything the screener shows, one question per screen. */
const heading = (page: Page) => page.locator('h1')
const next = (page: Page) => page.getByRole('button', { name: 'Continue' })

test('the screener asks one question per screen, nothing preselected, then consent, the optional assistive question, then a practice screen', async ({ page }) => {
  const { playerUrl } = await createLinkRun(fixture)
  await page.goto(playerUrl)

  await expect(heading(page)).toHaveText('When did you last use a shared tool to plan work?')
  await expect(page.locator('input:checked')).toHaveCount(0)
  await expect(next(page)).toBeDisabled()
  await page.getByLabel('In the past week').check()
  await expect(next(page)).toBeEnabled()
  await next(page).click()

  await expect(heading(page)).toHaveText('Which of these do you use?')
  await expect(page.locator('input:checked')).toHaveCount(0)
  await expect(page.getByLabel('None of these')).toBeVisible()
  await page.getByLabel('Trello').check()
  await next(page).click()

  await expect(heading(page)).toHaveText('Do any of these apply to you?')
  await expect(page.locator('input:checked')).toHaveCount(0)
  await page.getByLabel('None of these').check()
  await next(page).click()

  // Three screens before consent (PRD 03): no question about the purpose, the browser or the device.
  await expect(heading(page)).toHaveText('Before you start')
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  // Asked after consent, and optional: Continue works with nothing chosen.
  await expect(heading(page)).toHaveText('Do you use any assistive technology? You can skip this.')
  await expect(next(page)).toBeEnabled()
  await next(page).click()
  await expect(heading(page)).toHaveText('A quick practice')
  const bar = page.getByRole('group', { name: 'Practice bar' })
  await bar.getByRole('button', { name: 'Done' }).click()
  await expect(bar.getByText('Finished this task?')).toBeVisible()
  await bar.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByRole('status')).toContainText('That is what Done does')
  await next(page).click()
  await expect(heading(page)).toHaveText('Your task')
})

test('an answer outside the users filters nobody: the person goes on to consent, and each criterion and the order they saw are kept', async ({ page }) => {
  const { runId, playerUrl } = await createLinkRun(fixture)
  await page.goto(playerUrl)
  await page.getByLabel('Never').check()
  await next(page).click()
  await expect(heading(page)).toHaveText('Which of these do you use?')
  await page.getByLabel('None of these').check()
  await next(page).click()
  await expect(heading(page)).toHaveText('Do any of these apply to you?')
  await page.getByLabel('I have used Weekboard').check()
  await next(page).click()
  await expect(heading(page)).toHaveText('Before you start')

  const store = await openStore()
  try {
    const [attempt] = await store.listAttempts(runId)
    expect(attempt).toMatchObject({ status: 'created', flags: [] })
    expect(attempt!.answers.screenerResult).toMatchObject({
      group: null,
      criteria: { recency: { value: 'Never', met: false }, uses: { value: ['None of these'], met: false }, not: { value: ['I have used Weekboard'], met: false } },
    })
    const order = (attempt!.answers.screenerResult as { order: Record<string, string[]> }).order
    expect(Object.keys(order)).toEqual(['screener.recency', 'screener.uses', 'screener.not'])
    expect(order['screener.uses']!.at(-1)).toBe('None of these')
  } finally { await store.close() }
})
