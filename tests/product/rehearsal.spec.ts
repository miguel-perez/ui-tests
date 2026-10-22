import { spawn, type ChildProcess } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { buildTrace, type Trace } from '../../packages/ui-tests/src/trace/build.ts'
import { BAR, PRODUCT_URL, SERVER_URL, barOf, createRehearsalRun, hasFocus } from './helpers'

/**
 * The rehearsal end to end (Task 15): the site is the first context under test. The author runs `npx ui-tests` in apps/web,
 * takes the landing study as a participant in a real browser, and reads the outcome, the signals and the sentence back from the
 * terminal and the trace. Fixture studies (tests/product/fixtures) cover the other shapes through the same player and bar.
 */

const root = join(import.meta.dirname, '..', '..')
const web = join(root, 'apps', 'web')
const bin = join(root, 'packages', 'ui-tests', 'bin', 'ui-tests.mjs')
const fixture = (name: string) => join(import.meta.dirname, 'fixtures', `${name}.ui.test.ts`)
const REHEARSAL = 'Rehearsal: 0 of 5 planned attempts recorded.'

test.use({ reducedMotion: 'reduce' })

/** Every command a test started, stopped with its process group if the test ended before it did. */
const started: ChildProcess[] = []
test.afterEach(() => {
  for (const child of started.splice(0)) if (child.exitCode === null && child.signalCode === null) try { process.kill(-child.pid!, 'SIGKILL') } catch { /* gone */ }
})

/**
 * `ui-tests …` in `cwd`, with the static export as the target and `ui-tests serve` as the server; stdout is collected as it comes. The bin `npx ui-tests` resolves
 * to, run by this Node directly: npx starts it under `sh -c`, and where sh is dash (Debian, Ubuntu, so CI) the shell neither
 * execs the CLI nor passes a SIGINT on, so the Ctrl-C below would never reach it.
 */
function cli(args: string[], cwd: string) {
  const child = spawn(process.execPath, [bin, ...args], { cwd, env: { ...process.env, PREVIEW_URL: PRODUCT_URL, UI_TESTS_PUBLIC_URL: SERVER_URL }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  started.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout!.on('data', (chunk: Buffer) => { stdout += chunk })
  child.stderr!.on('data', (chunk: Buffer) => { stderr += chunk })
  const exited = new Promise<number | null>(resolve => child.on('exit', code => resolve(code)))
  return { child, exited, output: () => stdout, errors: () => stderr }
}

/** Waits until stdout matches, failing with what the command printed so far. */
async function waitFor(run: ReturnType<typeof cli>, pattern: RegExp, timeout = 60_000): Promise<RegExpMatchArray> {
  const until = Date.now() + timeout
  for (;;) {
    const match = run.output().match(pattern)
    if (match) return match
    if (Date.now() > until || run.child.exitCode !== null) throw new Error(`No ${pattern} in:\n${run.output()}\n${run.errors()}`)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

/** Ctrl-C: the CLI closes the trace server and exits 0. */
const interrupt = (child: ChildProcess) => { child.kill('SIGINT') }

/** Starts dev mode on the landing study and returns the participant's link: the player on the running ui-tests server, which it reuses. */
async function rehearse() {
  const run = cli(['--no-open', '--port', '0'], web)
  const [, player] = await waitFor(run, /\{"player":"([^"]+)"\}/)
  expect(player).toMatch(new RegExp(`^${SERVER_URL}/ui-tests/r_\\w+/\\?t=[0-9a-f]{64}$`))
  expect(run.errors()).not.toContain('Started the ui-tests server')
  return { run, player }
}

/** After the participant finishes: the terminal's outcome, signals and sentence, the trace URL, and the trace as JSON and HTML. */
async function readBack(run: ReturnType<typeof cli>) {
  const [, traceUrl] = await waitFor(run, /Trace: (\S+)/)
  const trace = (await (await fetch(traceUrl.replace(/\/$/, '.json'))).json()) as Trace
  // React's text separators taken out, so the page reads as it renders.
  const html = (await (await fetch(traceUrl)).text()).replaceAll('<!-- -->', '')
  interrupt(run.child)
  expect(await run.exited).toBe(0)
  return { output: run.output(), trace, html }
}

/** `ui-tests verify <run>`: exits 0 and prints each attempt's verdict. */
async function verify(runId: string) {
  const run = cli(['verify', runId], root)
  expect(await run.exited, run.errors()).toBe(0)
  return run.output()
}

/** The trace from the store, as `ui-tests trace` serves it. */
async function traceOf(runId: string): Promise<Trace> {
  const store = await openStore()
  try { return await buildTrace(store, runId) } finally { await store.close() }
}

/** Consent, the first look (a tour of the live page, then the prompt) when the study has one, then the card. */
async function throughConsent(page: Page, player: string) {
  await page.goto(player)
  await page.getByRole('button', { name: 'I agree and continue' }).click()
  const firstLook = page.getByRole('heading', { name: 'Before your task, have a look at a page' })
  const card = page.getByRole('heading', { name: 'Your task' })
  await expect(firstLook.or(card)).toBeVisible()
  if (await firstLook.isVisible()) {
    await page.getByRole('button', { name: 'Open the page' }).click()
    await page.waitForURL(`${PRODUCT_URL}/`)
    // The bar is the sign the page is being toured; nothing on the page can be clicked until the person says they have had a look.
    const bar = barOf(page, "Have a look around. Scroll if you like; don't click anything yet.")
    await expect(bar).toBeVisible()
    await bar.getByRole('button', { name: "I've had a look" }).click()
    await expect(page.getByRole('heading', { name: /What do you make of that page/ })).toBeVisible()
    await page.getByRole('textbox').fill('A way to test what I built')
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(card).toBeVisible()
}

/** Start task, then the bar on the target. */
async function start(page: Page, name: string) {
  await page.getByRole('button', { name: 'Start task' }).click()
  await page.waitForURL(`${PRODUCT_URL}/`)
  const bar = barOf(page, name)
  await expect(bar).toBeVisible()
  return bar
}

/** Done, "Finished this task?", Yes: back on the player for the questions. */
async function done(page: Page, bar: ReturnType<Page['getByRole']>) {
  await bar.getByRole('button', { name: 'Done' }).click()
  await expect(bar.getByText('Finished this task?')).toBeVisible()
  await bar.getByRole('button', { name: 'Yes' }).click()
  await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=1$/)
}

/** Answers every question that follows, one per screen, until the thanks. */
async function answerAll(page: Page, ease = 6) {
  const heading = page.getByRole('heading', { level: 1 })
  for (let screen = 0; screen < 10; screen++) {
    await expect(heading).toBeVisible()
    const title = await heading.innerText()
    if (title === 'Thank you') return
    // The study's own two items are on five points, the task's on seven.
    if (await page.getByRole('radio').count()) await page.getByRole('radio', { name: String(title.startsWith('Overall') ? ease : title.startsWith('How confident') ? 6 : 5), exact: true }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(heading).not.toHaveText(title)
  }
  throw new Error('The questions did not end')
}

test.describe('the landing study, rehearsed with the CLI', () => {
  test.describe.configure({ timeout: 180_000 })

  test('completes the landing task: Get started, Done, the questions; verify and the trace say correct, with the rehearsal sentence', async ({ page }) => {
    const { run, player } = await rehearse()
    await throughConsent(page, player)
    await expect(page.getByText("When you think you've finished, press Done. If you get stuck, press I couldn't do this.")).toBeVisible()
    const bar = await start(page, 'start trying ui-tests')
    await page.locator('.hero .actions').getByRole('link', { name: 'Get started' }).click()
    await page.waitForURL(`${PRODUCT_URL}/docs/getting-started/`)
    await done(page, bar)
    await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
    await answerAll(page)

    const { output, trace, html } = await readBack(run)
    expect(output).toContain('Outcome: correct')
    expect(output).toContain(REHEARSAL)
    expect(output).toMatch(/Signals: (none|\n)/)
    const [attempt] = trace.attempts
    expect(trace.sentence).toBe(REHEARSAL)
    expect(trace.run.rehearsal).toBe(true)
    expect(attempt.verification?.status).toBe('correct')
    expect(attempt.attempt).toMatchObject({ reason: 'done', rehearsal: true })
    expect(attempt.snapshotUrl).toBe(`${PRODUCT_URL}/docs/getting-started/`)
    expect(attempt.path).toEqual(['/', '/docs/getting-started'])
    expect(attempt.signals).toEqual([])
    expect(html).toContain('Outcome: correct')
    expect(html).toContain(REHEARSAL)
    expect(html).toContain(`${PRODUCT_URL}/docs/getting-started/`)
    expect(await verify(trace.run.run)).toContain(`${attempt.attempt.id}: correct`)
  })

  test("I couldn't do this: gave up, not reached, the ease still asked, and a signal at its moment", async ({ page }) => {
    const { run, player } = await rehearse()
    await throughConsent(page, player)
    const bar = await start(page, 'start trying ui-tests')
    await bar.getByRole('button', { name: "I couldn't do this" }).click()
    await page.waitForURL(/\/ui-tests\/[^/]+\/\?after=1$/)
    await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
    await answerAll(page, 2)

    const { output, trace } = await readBack(run)
    expect(output).toContain('Outcome: incorrect')
    expect(output).toMatch(/Signals:\n {2}gave-up: /)
    expect(output).toContain(REHEARSAL)
    const [attempt] = trace.attempts
    expect(attempt.attempt.reason).toBe('gave up')
    expect(attempt.verification).toMatchObject({ status: 'incorrect', reason: 'Terminal reason: gave up' })
    expect(attempt.attempt.answers['goal0.ease']).toBe(2)
    const gaveUp = attempt.signals.find(s => s.kind === 'gave-up')
    expect(gaveUp?.at).toBe(Date.parse(attempt.attempt.endedAt!))
    expect(attempt.signals.map(s => s.kind)).toContain('low-ease')
    expect(await verify(trace.run.run)).toContain(`${attempt.attempt.id}: incorrect`)
  })

  test('keyboard only: the whole landing task with Tab, Enter and Space, and no axe violation on the consent, the card, the bar or the ease', async ({ page }) => {
    const { run, player } = await rehearse()
    const axe = async (include?: string) => {
      const builder = new AxeBuilder({ page })
      expect((await (include ? builder.include(include) : builder).analyze()).violations).toEqual([])
    }
    /** Tabs until `name` has focus, then presses `key`. */
    const press = async (role: 'button' | 'link' | 'radio' | 'textbox', name: string | undefined, key: 'Enter' | 'Space') => {
      const target = name === undefined ? page.getByRole(role).first() : page.getByRole(role, { name, exact: true }).first()
      for (let i = 0; i < 400 && !(await target.evaluate(hasFocus).catch(() => false)); i++) await page.keyboard.press('Tab')
      await expect(target).toBeFocused()
      await page.keyboard.press(key)
    }

    await page.goto(player)
    await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
    await axe()
    await press('button', 'I agree and continue', 'Enter')
    await expect(page.getByRole('heading', { name: 'Before your task, have a look at a page' })).toBeVisible()
    await press('button', 'Open the page', 'Enter')
    await page.waitForURL(`${PRODUCT_URL}/`)
    await expect(barOf(page, "Have a look around. Scroll if you like; don't click anything yet.")).toBeVisible()
    await press('button', "I've had a look", 'Enter')
    await expect(page.getByRole('heading', { name: /What do you make of that page/ })).toBeVisible()
    await press('textbox', undefined, 'Space')
    await press('button', 'Continue', 'Enter')
    await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
    await axe()
    await press('button', 'Start task', 'Enter')
    await page.waitForURL(`${PRODUCT_URL}/`)
    await expect(barOf(page)).toBeVisible()
    await axe(BAR)
    await press('link', 'Get started', 'Enter')
    await page.waitForURL(`${PRODUCT_URL}/docs/getting-started/`)
    await press('button', 'Done', 'Space')
    await expect(page.locator(BAR).getByRole('button', { name: 'Yes' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
    await axe()
    // Tab enters a radio group with nothing chosen at its first option; Space chooses it, so the follow-up comes next.
    await press('radio', '1', 'Space')
    await press('button', 'Submit', 'Enter')
    await expect(page.getByRole('heading', { name: 'What made it difficult?' })).toBeVisible()
    await press('textbox', undefined, 'Space')
    await press('button', 'Submit', 'Enter')
    for (const question of ['Would ui-tests be useful to you?', 'ui-tests is easy to use.']) {
      await expect(page.getByRole('heading', { name: question })).toBeVisible()
      await press('radio', '1', 'Space')
      await press('button', 'Submit', 'Enter')
    }
    await expect(page.getByRole('heading', { name: 'Anything you want to tell ui-tests?' })).toBeVisible()
    await press('button', 'Submit', 'Enter')
    await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()

    const { trace } = await readBack(run)
    expect(trace.attempts[0].verification?.status).toBe('correct')
    expect(trace.attempts[0].attempt.answers).toMatchObject({ 'goal0.ease': 1, useful: 1, easy: 1 })
  })
})

test.describe('fixture studies through the same player and bar', () => {
  test.describe.configure({ timeout: 120_000 })

  test('a path that ends elsewhere: finishing on / is incorrect, with the expected and the actual URL in the diff', async ({ page }) => {
    const { runId, playerUrl } = await createRehearsalRun(fixture('nowhere'))
    await throughConsent(page, playerUrl)
    const bar = await start(page, 'Find the page about nothing')
    await done(page, bar)
    await answerAll(page)
    expect(await verify(runId)).toMatch(/: incorrect \(/)
    const [attempt] = (await traceOf(runId)).attempts
    expect(attempt.verification).toMatchObject({ status: 'incorrect', diff: { expected: '/nowhere', actual: `${PRODUCT_URL}/` } })
    expect(attempt.signals.map(s => s.kind)).toContain('false-done')
  })

  test('a dead click on the inert hero heading, and a page off the path, are signals naming the element and the page', async ({ page }) => {
    const { runId, playerUrl } = await createRehearsalRun(fixture('nowhere'))
    await throughConsent(page, playerUrl)
    const bar = await start(page, 'Find the page about nothing')
    await page.locator('h1#promise').click()
    // The click's window is 300 ms; the page is left alone until it closes.
    await page.waitForTimeout(500)
    await page.locator('.hero .actions').getByRole('link', { name: 'Get started' }).click()
    await page.waitForURL(`${PRODUCT_URL}/docs/getting-started/`)
    // Left as soon as the bar shows, well inside the buffer's one-second wait: the visit must still be kept.
    await expect(bar).toBeVisible()
    await page.goto(`${PRODUCT_URL}/`)
    await expect(bar).toBeVisible()
    await done(page, bar)
    await answerAll(page)
    await verify(runId)
    const [attempt] = (await traceOf(runId)).attempts
    expect(attempt.path).toEqual(['/', '/docs/getting-started', '/'])
    expect(attempt.signals.find(s => s.kind === 'dead-click')).toMatchObject({ target: '#promise', detail: expect.stringContaining('#promise') })
    expect(attempt.signals.find(s => s.kind === 'deviation')).toMatchObject({ detail: 'Off the path: /docs/getting-started' })
    expect(attempt.signals.map(s => s.kind)).toContain('backtrack')
    // The link click that took them away is stored too, settled as a change because the page unloaded inside its window.
    const clicks = attempt.events.filter(e => e.type === 'click')
    expect(clicks.map(e => [new URL(e.url).pathname, e.changed])).toEqual([['/', false], ['/', true]])
    expect(clicks[1].target).toMatch(/^div:nth-of-type\(\d+\) > a:nth-of-type\(2\)$|a:nth-of-type\(2\)$/)
  })

  test('steps show one at a time, each with its own Done, and each is checked against its own snapshot', async ({ page }) => {
    const { runId, playerUrl } = await createRehearsalRun(fixture('steps'))
    await throughConsent(page, playerUrl)
    const bar = await start(page, 'Look at the guide, then come back')
    await expect(bar.getByText('Step 1 of 2: Open the guide')).toBeVisible()
    await expect(bar.getByText(/Come back/)).toHaveCount(0)
    await page.locator('.hero .actions').getByRole('link', { name: 'Get started' }).click()
    await page.waitForURL(`${PRODUCT_URL}/docs/getting-started/`)
    // By keyboard: focus follows the question in and back out to Done, whether it closes with Not yet or with a step's Yes.
    const doneButton = bar.getByRole('button', { name: 'Done' })
    await doneButton.focus()
    await page.keyboard.press('Enter')
    await expect(bar.getByText('Finished this step?')).toBeVisible()
    await expect(bar.getByRole('button', { name: 'Yes' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(bar.getByRole('button', { name: 'Not yet' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(doneButton).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(bar.getByRole('button', { name: 'Yes' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(bar.getByText('Step 2 of 2: Come back to the first page')).toBeVisible()
    await expect(doneButton).toBeFocused()
    await page.goto(`${PRODUCT_URL}/`)
    await expect(bar.getByText('Step 2 of 2: Come back to the first page')).toBeVisible()
    await done(page, bar)
    await answerAll(page)
    expect(await verify(runId)).toMatch(/: correct$/m)
    const [attempt] = (await traceOf(runId)).attempts
    expect(attempt.verification?.steps).toEqual([{ name: 'Open the guide', status: 'correct' }, { name: 'Come back to the first page', status: 'correct' }])
  })

  test('minutes and no outcome: a trace, no result sentence, and a lint warning', async ({ page }) => {
    const lint = cli(['lint', fixture('minutes'), '--json'], root)
    expect(await lint.exited).toBe(0)
    const findings = (JSON.parse(lint.output()) as { studies: { findings: { severity: string; rule: string }[] }[] }).studies[0].findings
    expect(findings).toEqual([expect.objectContaining({ severity: 'warning', rule: 'outcome-present' })])

    const { runId, playerUrl } = await createRehearsalRun(fixture('minutes'))
    await throughConsent(page, playerUrl)
    const bar = await start(page, 'Look around the site')
    await done(page, bar)
    await answerAll(page)
    expect(await verify(runId)).toMatch(/: unknown \(Issues only: no outcome\)/)
    const trace = await traceOf(runId)
    expect(trace.attempts).toHaveLength(1)
    expect(trace.attempts[0].attempt.answers['goal0.confidence']).toBe(6)
    expect(trace.run.result).toBe('pending')
    expect(trace.sentence).toBe(REHEARSAL)
    expect(trace.sentence).not.toMatch(/could not|none was seen|Inconclusive|reached the outcome|completed the steps/)
  })

  test('white label: no participant surface names ui-tests, and the bar takes its colours from the host\'s variables', async ({ page }) => {
    const { playerUrl } = await createRehearsalRun(fixture('sentinel'))
    const unbranded = async (scope: string) => {
      // The bar is inside its host's shadow root: what it shows is there.
      const found = await page.locator(scope).evaluateAll(nodes => nodes.flatMap(node => [
        node.shadowRoot ? [...node.shadowRoot.children].map(child => (child as HTMLElement).innerText ?? '').join('\n') : (node as HTMLElement).innerText,
        ...[...(node.shadowRoot ?? node).querySelectorAll('[alt]')].map(el => el.getAttribute('alt') ?? ''),
        ...[...(node.shadowRoot ?? node).querySelectorAll('[href]'), ...(node.matches('[href]') ? [node] : [])].map(el => el.getAttribute('href') ?? ''),
      ]))
      expect(found.filter(text => /ui-tests/i.test(text)), scope).toEqual([])
    }
    await page.goto(playerUrl)
    await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
    await unbranded('main')
    await page.getByRole('button', { name: 'I agree and continue' }).click()
    await expect(page.getByRole('heading', { name: 'Your task' })).toBeVisible()
    await unbranded('main')
    const bar = await start(page, 'Read the landing page')
    await unbranded(BAR)
    const colours = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement)
      const probe = (value: string) => { const el = document.createElement('i'); el.style.color = value; document.body.append(el); const rgb = getComputedStyle(el).color; el.remove(); return rgb }
      const pill = getComputedStyle(document.querySelector('[data-ui-tests-root]')!.shadowRoot!.querySelector('.uit-pill')!)
      return { ink: probe(root.getPropertyValue('--ink').trim()), canvas: probe(root.getPropertyValue('--canvas').trim()), surface: pill.backgroundColor, text: pill.color }
    })
    // The inverse of the host page: its ink is the bar's surface, its ground the bar's text.
    expect(colours.surface).toBe(colours.ink)
    expect(colours.text).toBe(colours.canvas)
    await done(page, bar)
    for (let screen = 0; screen < 6; screen++) {
      await unbranded('main')
      const heading = await page.getByRole('heading', { level: 1 }).innerText()
      if (heading === 'Thank you') break
      if (await page.getByRole('radio').count()) await page.getByRole('radio', { name: heading.startsWith('Overall') || heading.startsWith('How confident') ? '6' : '5', exact: true }).check()
      await page.getByRole('button', { name: 'Submit' }).click()
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(heading)
    }
    await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()
  })

  test('the view the collector serves and the site\'s exported files hold neither the path nor the expected answer', async ({ page, request }) => {
    const { runId, token, playerUrl } = await createRehearsalRun(fixture('sentinel'))
    const view = await (await request.get(`${SERVER_URL}/api/ui-tests/?run=${runId}&t=${encodeURIComponent(token)}`)).text()
    expect(view).toContain('Read the landing page')
    for (const secret of ['/sentinel-path-7f3a', 'sentinel-answer-91c2']) expect(view).not.toContain(secret)
    await page.goto(playerUrl)
    await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible()
    for (const secret of ['/sentinel-path-7f3a', 'sentinel-answer-91c2']) expect(await page.content()).not.toContain(secret)

    const files: string[] = []
    const walk = async (directory: string) => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await walk(path)
        else files.push(path)
      }
    }
    await walk(join(web, 'out'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const text = await readFile(file, 'latin1')
      for (const secret of ['/sentinel-path-7f3a', 'sentinel-answer-91c2']) expect(text.includes(secret), `${file} holds ${secret}`).toBe(false)
    }
  })
})
