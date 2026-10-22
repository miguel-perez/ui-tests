import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { GOAL_ORDER } from '../../packages/ui-tests/src/runner/sequence.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { BAR, PRODUCT_URL, createLinkRun } from './helpers'

/**
 * A link participant attempts every goal of a two-goal study (PRD 02: "the same people attempt every goal"): one screener, consent and
 * practice, then each goal's card, task and questions in order, and the study's own questions once, after the last goal.
 */

const fixture = join(import.meta.dirname, 'fixtures', 'two-goals.ui.test.ts')
const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const next = (page: Page) => page.getByRole('button', { name: /^(Continue|Submit)$/ })

/** Does one goal from its card: start, press Done and confirm on the target, then rate it 6 back on the player. */
async function doGoal(page: Page, start: string) {
  await expect(heading(page)).toHaveText('Your task')
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}${start}`)
  await page.locator(BAR).getByRole('button', { name: 'Done' }).click()
  await page.locator(BAR).getByRole('button', { name: 'Yes' }).click()
  await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=1$/)
  await expect(heading(page)).toHaveText('Overall, how difficult or easy did you find this task?')
  await page.getByRole('radio', { name: '6', exact: true }).check()
  await next(page).click()
}

test.describe('a two-goal study', () => {
  test.describe.configure({ timeout: 180_000 })

  test('the participant does both goals in order and is asked the study questions once, after the last', async ({ page }) => {
    const { runId, playerUrl } = await createLinkRun(fixture, { product: 'ui-tests' })
    await page.goto(playerUrl)

    // The screener, whatever it asks: the first option of each question, or a few words.
    for (let guard = 0; guard < 20; guard++) {
      await expect(heading(page)).toBeVisible()
      if ((await heading(page).innerText()) === 'Before you start') break
      const title = await heading(page).innerText()
      if (await page.getByRole('textbox').count()) await page.getByRole('textbox').fill('A shared spreadsheet')
      else await page.locator('input[type=radio], input[type=checkbox]').first().check()
      await next(page).click()
      await expect(heading(page)).not.toHaveText(title)
    }
    await page.getByRole('button', { name: 'I agree and continue' }).click()
    // Assistive technology is asked once, after consent, and is optional: Continue with nothing chosen.
    await expect(heading(page)).toHaveText('Do you use any assistive technology? You can skip this.')
    await next(page).click()
    await expect(heading(page)).toHaveText('A quick practice')
    await page.getByRole('button', { name: 'Continue' }).click()

    await doGoal(page, '/')
    // The first goal's questions end with its own ease: the second goal's card follows, with no second practice and no study questions yet.
    await expect(heading(page)).toHaveText('Your task')
    await expect(page.getByText('getting started guide', { exact: false })).toBeVisible()
    await doGoal(page, '/docs/getting-started/')

    await expect(heading(page)).toHaveText('Would ui-tests be useful to you?')
    await page.getByRole('radio', { name: '4', exact: true }).check()
    await next(page).click()
    await expect(heading(page)).toHaveText('ui-tests is easy to use.')
    await page.getByRole('radio', { name: '4', exact: true }).check()
    await next(page).click()
    await expect(heading(page)).toHaveText('Anything you want to tell ui-tests?')
    await page.getByRole('textbox').fill('Both done')
    await next(page).click()
    await expect(heading(page)).toHaveText('Thank you')

    const store = await openStore()
    try {
      const attempts = await store.listAttempts(runId)
      expect(attempts.map(a => [a.participant, a.goalIndex, a.status])).toEqual([['p_e2e', 0, 'finished'], ['p_e2e', 1, 'finished']])
      expect(attempts.map(a => a.answers[GOAL_ORDER])).toEqual([[0, 1], [0, 1]])
      expect(attempts[0]!.answers).toMatchObject({ 'goal0.ease': 6 })
      expect(attempts[0]!.answers.useful).toBeUndefined()
      expect(attempts[1]!.answers).toMatchObject({ 'goal1.ease': 6, useful: 4, easy: 4, anything: 'Both done' })
      // Each goal's page visit was recorded on that goal's own attempt.
      for (const a of attempts) expect((await store.listEvents(a.id)).some(e => e.type === 'url')).toBe(true)
    } finally { await store.close() }
  })
})
