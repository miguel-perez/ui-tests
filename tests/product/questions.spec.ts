import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { uxLite } from '../../packages/ui-tests/src/measures.ts'
import { PRODUCT_URL, createLinkRun, createRehearsalRun } from './helpers'

/**
 * The questions after the task, and the way there, by keyboard alone and with a screen reader's tree in mind (Task 21). A link
 * run goes screener, consent, practice, card; the task happens on the target; then the questions one per screen. VoiceOver on
 * Safari is a manual check, written in the getting-started page's accessibility note.
 */

const fixture = (name: string) => join(import.meta.dirname, 'fixtures', `${name}.ui.test.ts`)
// A fake microphone, so the voice answer records without a person speaking.
test.use({ permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } })

const BAR = '[data-ui-tests]'
const heading = (page: Page) => page.getByRole('heading', { level: 1 })

/** Zero violations of WCAG 2 A and AA rules on what the page shows now (or inside `include`). */
async function axe(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  expect((await (include ? builder.include(include) : builder).analyze()).violations).toEqual([])
}

/** Presses Tab (or Shift+Tab, to reach the bar, which ends the page) until `target` has focus: the only way a keyboard user gets anywhere. */
async function tabTo(page: Page, target: Locator, key: 'Tab' | 'Shift+Tab' = 'Tab', limit = 400) {
  await expect(target).toBeVisible()
  for (let i = 0; i < limit && !(await target.evaluate((node) => node === document.activeElement)); i++) await page.keyboard.press(key)
  await expect(target).toBeFocused()
}

/** Chooses the option at `index` of the group the first control belongs to: Tab to the first, arrows to the rest, Space for the first. */
async function choose(page: Page, index: number) {
  await tabTo(page, page.locator('input[type=radio], input[type=checkbox]').first())
  if (index === 0) await page.keyboard.press('Space')
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown')
}

async function submit(page: Page, name: RegExp | string = /^(Continue|Submit)$/) {
  await tabTo(page, page.getByRole('button', { name }))
  await page.keyboard.press('Enter')
}

test.describe('a link participant, keyboard only, from the screener to the thanks', () => {
  test.describe.configure({ timeout: 180_000 })

  test('screener, consent, practice, card, bar, then the questions one per screen; no axe violation anywhere; the environment is stored', async ({ page }) => {
    const { runId, playerUrl } = await createLinkRun(fixture('questions'), { product: 'ui-tests' })
    const seen: string[] = []
    await page.goto(playerUrl)

    // The screener first, one question per screen; the last three are the environment.
    const answered: Record<string, string> = {}
    for (let guard = 0; guard < 20; guard++) {
      await expect(heading(page)).toBeVisible()
      const title = await heading(page).innerText()
      if (title === 'Before you start') break
      seen.push(title)
      await axe(page)
      if (await page.locator('textarea').count()) {
        await tabTo(page, page.locator('textarea'))
        await page.keyboard.type('A shared spreadsheet')
      } else if (title === 'Which browser do you usually use?') { await choose(page, 1); answered.browser = 'Safari' }
      else if (title === 'Which device do you usually use?') { await choose(page, 1); answered.device = 'Phone' }
      else if (title === 'Do you use any assistive technology?') { await choose(page, 0); answered.assistive = 'Screen reader' }
      else await choose(page, 0)
      await submit(page)
      await expect(heading(page)).not.toHaveText(title)
    }
    expect(seen.slice(-3)).toEqual(['Which browser do you usually use?', 'Which device do you usually use?', 'Do you use any assistive technology?'])

    // Consent, then practice, then the card (no first look: the study turns it off).
    await expect(heading(page)).toHaveText('Before you start')
    await axe(page)
    await submit(page, 'I agree and continue')
    await expect(heading(page)).toHaveText('A quick practice')
    await axe(page)
    await submit(page, 'Continue')
    await expect(heading(page)).toHaveText('Your task')
    await axe(page)
    await submit(page, 'Start task')

    // The bar on the target: reachable in tab order, and what it says changes in a live region.
    await page.waitForURL(`${PRODUCT_URL}/`)
    const bar = page.locator(BAR)
    await expect(bar).toBeVisible()
    await axe(page, BAR)
    await expect(bar.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    // Shift+Tab from the top of the page lands on the bar, the last thing in the document; its buttons come in reading order.
    await tabTo(page, bar.getByRole('button', { name: "I couldn't do this" }), 'Shift+Tab')
    const order: string[] = []
    for (let i = 0; i < 3; i++) {
      order.unshift(await page.evaluate(() => document.activeElement?.textContent ?? ''))
      await page.keyboard.press('Shift+Tab')
    }
    expect(order).toEqual(['Read the landing page', 'Done', "I couldn't do this"])
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(bar.getByRole('button', { name: 'Done' })).toBeFocused()
    await page.keyboard.press('Space')
    // The question is announced from the live region, and focus is on Yes.
    await expect(bar.getByRole('status')).toHaveText('Finished this task?')
    await expect(bar.getByRole('button', { name: 'Yes' })).toBeFocused()
    await axe(page, BAR)
    await page.keyboard.press('Enter')

    // The questions: the task's own ease (2 leads to "What made it difficult?"), then the three about the product, one per screen.
    await expect(heading(page)).toHaveText('Overall, how difficult or easy did you find this task?')
    await axe(page)
    await expect(page.locator('input:checked')).toHaveCount(0)
    await choose(page, 1)
    await submit(page)
    await expect(heading(page)).toHaveText('What made it difficult?')
    await axe(page)
    await tabTo(page, page.locator('textarea'))
    await page.keyboard.type('The links were hard to tell apart')
    await submit(page)

    await expect(heading(page)).toHaveText('Would ui-tests be useful to you?')
    await axe(page)
    await expect(page.getByRole('radio')).toHaveCount(5)
    await expect(page.locator('input:checked')).toHaveCount(0)
    await expect(page.getByRole('radiogroup')).toHaveAccessibleDescription(/^1, Not at all useful\s*5, Very useful$/)
    await choose(page, 4)
    await submit(page)
    await expect(heading(page)).toHaveText('ui-tests is easy to use.')
    await axe(page)
    await expect(page.getByRole('radio')).toHaveCount(5)
    await choose(page, 3)
    await submit(page)
    await expect(heading(page)).toHaveText('Anything you want to tell ui-tests?')
    await axe(page)
    await tabTo(page, page.locator('textarea'))
    await page.keyboard.type('Nothing more')
    await submit(page)
    await expect(heading(page)).toHaveText('Thank you')
    await axe(page)

    const store = await openStore()
    try {
      const [attempt] = await store.listAttempts(runId)
      expect(attempt!.status).toBe('finished')
      expect(attempt!.environment).toEqual(answered)
      expect(attempt!.answers).toMatchObject({ 'goal0.ease': 2, useful: 5, easy: 4, anything: 'Nothing more' })
      expect(uxLite(attempt!.answers.useful as 5, attempt!.answers.easy as 4)).toEqual({ useful: 100, easy: 75, score: 87.5 })
    } finally { await store.close() }
  })
})

test.describe('more time', () => {
  test.describe.configure({ timeout: 120_000 })

  test('is offered once near the end of the limit, announced, and is gone after it is taken', async ({ page }) => {
    const { runId, playerUrl } = await createRehearsalRun(fixture('more-time'))
    await page.goto(playerUrl)
    await page.getByRole('button', { name: 'I agree and continue' }).click()
    await page.getByRole('button', { name: 'Start task' }).click()
    await page.waitForURL(`${PRODUCT_URL}/`)
    const bar = page.locator(BAR)
    await expect(bar.getByRole('button', { name: 'Done' })).toBeVisible()
    await expect(bar.getByRole('button', { name: 'More time' })).toHaveCount(0)
    await expect(bar.getByRole('button', { name: 'More time' })).toBeVisible({ timeout: 40_000 })
    await expect(bar.getByRole('status')).toContainText('You can ask for more time once')
    await axe(page, BAR)
    await tabTo(page, bar.getByRole('button', { name: 'More time' }), 'Shift+Tab')
    await page.keyboard.press('Enter')
    await expect(bar.getByRole('button', { name: 'More time' })).toHaveCount(0)
    await expect(bar.getByRole('button', { name: 'Done' })).toBeFocused()
    // The limit grew from 30 to 45 seconds: the new 80% mark (36 s) passes and the offer does not come back.
    await page.waitForTimeout(14_000)
    await expect(bar.getByRole('button', { name: 'More time' })).toHaveCount(0)
    const store = await openStore()
    try {
      const [attempt] = await store.listAttempts(runId)
      expect(attempt!.answers.moreTime).toBe(true)
    } finally { await store.close() }
  })
})

test.describe('voice answers', () => {
  test('"Talk instead" asks about the microphone once, keeps the audio as a voice blob, and moves on', async ({ page }) => {
    const { runId, playerUrl } = await createRehearsalRun(fixture('questions'), { product: 'ui-tests' })
    await page.goto(playerUrl)
    await page.getByRole('button', { name: 'I agree and continue' }).click()
    await page.getByRole('button', { name: 'Start task' }).click()
    await page.waitForURL(`${PRODUCT_URL}/`)
    await page.locator(BAR).getByRole('button', { name: 'Done' }).click()
    await page.locator(BAR).getByRole('button', { name: 'Yes' }).click()
    await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=1$/)
    await page.getByRole('radio', { name: '2', exact: true }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(heading(page)).toHaveText('What made it difficult?')

    // Asked the first time.
    await page.getByRole('button', { name: 'Talk instead' }).click()
    await expect(page.getByText('Use the microphone?')).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Use the microphone' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Recording' })).toBeVisible()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Stop and send' }).click()
    await expect(heading(page)).toHaveText('Would ui-tests be useful to you?')

    // Not asked again: the next screen with a voice option goes straight to recording.
    await page.getByRole('radio', { name: '3', exact: true }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(heading(page)).toHaveText('ui-tests is easy to use.')
    await page.getByRole('radio', { name: '3', exact: true }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(heading(page)).toHaveText('Anything you want to tell ui-tests?')
    await page.getByRole('button', { name: 'Talk instead' }).click()
    await expect(page.getByText('Use the microphone?')).toHaveCount(0)
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Stop and send' }).click()
    await expect(heading(page)).toHaveText('Thank you')

    const store = await openStore()
    try {
      const [attempt] = await store.listAttempts(runId)
      expect(attempt!.status).toBe('finished')
      for (const key of ['goal0.difficulty.voice', 'anything.voice']) {
        const blob = await store.getBlob(attempt!.answers[key] as string)
        expect(blob?.contentType).toMatch(/^audio\//)
        expect(blob!.bytes.length).toBeGreaterThan(0)
      }
    } finally { await store.close() }
  })

  test('leaving the screen while recording sends nothing for the question that was left', async ({ page }) => {
    const { runId, playerUrl } = await createRehearsalRun(fixture('questions'), { product: 'ui-tests' })
    const voice: string[] = []
    page.on('request', (r) => { if (r.method() === 'POST' && (r.postData() ?? '').includes('"voice"')) voice.push(r.url()) })
    await page.goto(playerUrl)
    await page.getByRole('button', { name: 'I agree and continue' }).click()
    await page.getByRole('button', { name: 'Start task' }).click()
    await page.waitForURL(`${PRODUCT_URL}/`)
    await page.locator(BAR).getByRole('button', { name: 'Done' }).click()
    await page.locator(BAR).getByRole('button', { name: 'Yes' }).click()
    await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=1$/)
    await page.getByRole('radio', { name: '2', exact: true }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await page.getByRole('button', { name: 'Talk instead' }).click()
    await page.getByRole('button', { name: 'Use the microphone' }).click()
    await expect(page.getByRole('button', { name: 'Stop and send' })).toBeVisible()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(heading(page)).toHaveText('Would ui-tests be useful to you?')
    await page.waitForTimeout(1_000)
    expect(voice).toEqual([])
    const store = await openStore()
    try {
      const [attempt] = await store.listAttempts(runId)
      expect(attempt!.answers['goal0.difficulty.voice']).toBeUndefined()
    } finally { await store.close() }
  })

  test('a recording stops by itself at 90 seconds, says so, and is sent', async ({ page }) => {
    await page.clock.install()
    const { playerUrl } = await createRehearsalRun(fixture('questions'), { product: 'ui-tests' })
    await page.goto(playerUrl)
    await page.getByRole('button', { name: 'I agree and continue' }).click()
    await page.getByRole('button', { name: 'Start task' }).click()
    await page.waitForURL(`${PRODUCT_URL}/`)
    await page.locator(BAR).getByRole('button', { name: 'Done' }).click()
    await page.locator(BAR).getByRole('button', { name: 'Yes' }).click()
    await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=1$/)
    await page.getByRole('radio', { name: '2', exact: true }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await page.getByRole('button', { name: 'Talk instead' }).click()
    await page.getByRole('button', { name: 'Use the microphone' }).click()
    await expect(page.getByRole('button', { name: 'Stop and send' })).toBeVisible()
    const sent = page.waitForRequest((r) => r.method() === 'POST' && (r.postData() ?? '').includes('"voice"'))
    await page.clock.fastForward(91_000)
    await sent
    await expect(page.getByRole('heading', { name: 'Would ui-tests be useful to you?' })).toBeVisible()
  })
})
