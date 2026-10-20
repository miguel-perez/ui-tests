import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { createLinkRun } from './helpers'

const fixture = join(import.meta.dirname, 'fixtures', 'screener.ui.test.ts')

/** Everything the screener shows, one question per screen. */
const heading = (page: Page) => page.locator('h1')
const next = (page: Page) => page.getByRole('button', { name: 'Continue' })

test('the screener asks one question per screen, nothing preselected, then consent, then a practice screen', async ({ page }) => {
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

  await expect(heading(page)).toHaveText('Which of these apply to you?')
  await expect(page.locator('input:checked')).toHaveCount(0)
  await page.getByLabel('None of these').check()
  await next(page).click()

  await expect(heading(page)).toHaveText('When did you last need to plan the week together?')
  await page.getByLabel('In the past month').check()
  await next(page).click()

  await expect(heading(page)).toHaveText('How do you do it today?')
  await expect(next(page)).toBeDisabled()
  await page.getByRole('textbox').fill('A shared spreadsheet')
  await next(page).click()

  await expect(heading(page)).toHaveText('How much does it matter to you to get this right?')
  await page.getByLabel('Quite a bit').check()
  await next(page).click()

  await expect(heading(page)).toHaveText('Which browser do you usually use?')
  await page.getByLabel('Firefox').check()
  await next(page).click()
  await expect(heading(page)).toHaveText('Which device do you usually use?')
  await page.getByLabel('Laptop or desktop').check()
  await next(page).click()
  await expect(heading(page)).toHaveText('Do you use any assistive technology?')
  await page.getByLabel('None of these').check()
  await next(page).click()

  // The screener comes before consent (PRD 03), and the practice screen after it.
  await expect(heading(page)).toHaveText('Before you start')
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  await expect(heading(page)).toHaveText('A quick practice')
  const bar = page.getByRole('group', { name: 'Practice bar' })
  await bar.getByRole('button', { name: 'Done' }).click()
  await expect(bar.getByText('Finished this task?')).toBeVisible()
  await bar.getByRole('button', { name: 'Yes' }).click()
  await expect(page.getByRole('status')).toContainText('That is what Done does')
  await next(page).click()
  await expect(heading(page)).toHaveText('Your task')
})

test('a rejecting answer ends at a thank-you without the task', async ({ page }) => {
  const { runId, playerUrl } = await createLinkRun(fixture)
  await page.goto(playerUrl)
  await page.getByLabel("I haven't").check()
  await next(page).click()
  await expect(heading(page)).toHaveText('Thank you')
  await expect(page.getByText('nothing more to do')).toBeVisible()
  await expect(page.getByRole('button', { name: /I agree|Start task/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Stop and delete my recording' })).toHaveCount(0)

  // Reloading does not bring the questions back.
  await page.reload()
  await expect(heading(page)).toHaveText('Thank you')

  const store = await openStore()
  try {
    const [attempt] = await store.listAttempts(runId)
    expect(attempt).toMatchObject({ status: 'finished', flags: ['screened-out'] })
    expect(attempt!.startedAt).toBeUndefined()
  } finally { await store.close() }
})
