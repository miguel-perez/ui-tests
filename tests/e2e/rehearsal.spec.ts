import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { promisify, stripVTControlCharacters } from 'node:util'
import path from 'node:path'
import { parseHTML } from 'linkedom'
/** The visible text of a rendered trace page. */
function traceText(html: string) { return parseHTML(html).document.body.textContent ?? '' }

let child: ChildProcess
let player: string, trace: string, output: string, authoredFile: string
/** Starts the CLI in dev mode against the landing test or an inline fixture and captures the player and trace URLs. */
async function start(body?: string) {
  const root = process.cwd()
  let file = path.join(root, 'apps/web/landing.ui.test.ts')
  if (body) {
    await mkdir(path.join(root, '.ui-tests'), { recursive: true })
    file = path.join(root, '.ui-tests', `fixture-${Date.now()}.ui.test.ts`)
    await writeFile(file, `import {study, setup, task, outcome, expect} from 'ui-tests'\nstudy('s',{users:'developers',purpose:'finish my work'},()=>{${body}})`)
  }
  authoredFile = file
  output = ''
  child = spawn(process.execPath, [path.join(root, 'packages/ui-tests/bin/ui-tests.mjs'), '--no-open', '--file', file], { cwd: path.join(root, 'apps/web'), env: { ...process.env, NO_COLOR: '1' } })
  // The CLI colours URLs; a test runner may force colour, so read the text without escape codes.
  child.stdout!.on('data', chunk => { output += stripVTControlCharacters(chunk.toString()) }); child.stderr!.on('data', chunk => { output += stripVTControlCharacters(chunk.toString()) })
  await expect.poll(() => output, { timeout: 5000, message: 'CLI must open player within five seconds' }).toContain('Player: ')
  player = /Player: (\S+)/.exec(output)![1]; trace = /Trace: (\S+)/.exec(output)![1]
}
/** Walks consent, the screener, the first impression and the scenario card with the keyboard, checking axe at each stage, until the task bar appears. */
async function begin(page: Page, impression = 'A way to find out whether people can use what I built') {
  await page.goto(player)
  await expect(page.getByRole('heading', { level: 1, name: 'This website would like to watch you try something on their site.' })).toBeVisible()
  await expect(page.getByText('The website is being tested, not you.', { exact: false })).toBeVisible()
  // What is always recorded comes first, in plain words; no screen video without video: true; voice optional; camera off.
  await expect(page.getByRole('list', { name: 'What is recorded' }).getByRole('listitem')).toHaveText([/What you do on their page: where you click, what you type, which pages you open\s*always/, /Your voice, only if you choose to talk later\s*optional/, /Your camera\s*off/])
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled({ timeout: 15_000 })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Continue' }).focus(); await page.keyboard.press('Enter')
  // The screener, one question per screen, nothing preselected and no drafting notes.
  const progress = page.getByText(/^A few questions first · \d+ of \d+$/)
  await expect(progress).toBeVisible()
  const total = Number(/of (\d+)/.exec(await progress.innerText())![1])
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  for (let i = 1; i <= total; i++) {
    await expect(page.getByText(`A few questions first · ${i} of ${total}`)).toBeVisible()
    await expect(page.locator('.uit-choices input:checked')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(/inferred|accept|reject|may-select/)
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await page.locator('.uit-choices label').first().click()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
  }
  // The first impression: the page for half a second, one appeal rating from 1 to 9, one open question, then the page back for one
  // first click toward the goal; the purpose is nowhere on the screen.
  await expect(page.getByRole('heading', { name: 'You will see a page for half a second, then a few questions about it.' })).toBeVisible()
  await page.getByRole('button', { name: 'Show the page' }).click({ timeout: 15_000 })
  await expect(page.getByRole('group', { name: 'How appealing did that page look?' })).toBeVisible()
  await expect(page.locator('.uit-scale input')).toHaveCount(9)
  await expect(page.locator('.uit-scale input:checked')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.keyboard.press('7')
  await expect(page.locator('.uit-scale input:checked')).toHaveValue('7')
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  const answer = page.getByLabel('What was that page for?')
  await expect(answer).toBeVisible()
  await expect(answer).toHaveAttribute('placeholder', 'In your own words. There is no right answer.')
  await expect(page.locator('main')).not.toContainText('without a researcher')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await answer.fill(impression)
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  // The page is back for one click, asked toward the goal in its own words.
  await expect(page.getByRole('heading', { name: /^Where would you click first to [a-z ]+\?$/ })).toBeVisible()
  await page.frameLocator('iframe.uit-flash').getByRole('link', { name: 'Get started', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Task 1 of 1' })).toBeVisible()
  await expect(page.getByText("When you think you've finished, press Done. If you get stuck, press I couldn't do this.")).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Start task' }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('complementary', { name: 'Your task' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Your task' }).getByRole('group', { name: 'Recording', exact: true })).toContainText('Screen not recorded · Voice off · Webcam off')
}
/** Chooses a point or a choice on the current question with its number key, retrying until the page has hydrated and it is checked. */
async function choose(page: Page, key: string) {
  await expect(async () => {
    await page.keyboard.press(key)
    await expect(page.locator('.uit-q input:checked')).toHaveValue(key, { timeout: 500 })
  }).toPass({ timeout: 10_000 })
}
/** Ends the task with Done and its confirmation. */
async function finish(page: Page) {
  const bar = page.getByRole('complementary', { name: 'Your task' })
  await bar.getByRole('button', { name: 'Done', exact: true }).click()
  await bar.getByRole('group', { name: 'Finished this task?' }).getByRole('button', { name: "Yes, I've finished" }).click()
}
/** Answers the questions one per screen, choosing every scale point with the number keys, and waits for the thank-you page and the CLI outcome. */
async function questions(page: Page, { seq = '3', confidence, validation }: { seq?: string; confidence?: string; validation?: string } = {}) {
  await expect(page).toHaveURL(/\/ui-tests\//, { timeout: 15_000 })
  await expect(page.getByText('After the task · 1 of', { exact: false })).toBeVisible({ timeout: 15_000 })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await expect(page.getByRole('group', { name: 'Overall, how difficult or easy did you find this task?' })).toBeVisible()
  // Nothing is preselected.
  await expect(page.locator('.uit-q input:checked')).toHaveCount(0)
  await choose(page, seq)
  await expect(page.getByRole('radio', { name: seq === '1' ? '1 Very difficult' : seq, exact: true })).toBeChecked()
  await page.keyboard.press('Enter')
  if (Number(seq) <= 4) {
    await expect(page.getByText('After the task · 2 of', { exact: false })).toBeVisible()
    await page.getByLabel('What made it difficult?').fill('I could not tell where people were added.')
    await page.getByRole('button', { name: 'Next', exact: true }).click()
  }
  if (confidence) { await expect(page.getByRole('group', { name: 'How confident are you that you completed the task?' })).toBeVisible(); await choose(page, confidence); await page.keyboard.press('Enter') }
  if (validation) { await page.getByRole('radio', { name: validation }).check(); await page.getByRole('button', { name: 'Next', exact: true }).click() }
  await expect(page.getByText('After all goals · 1 of 3')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Would this website be useful to you?' })).toBeVisible()
  await expect(page.locator('.uit-q input:checked')).toHaveCount(0)
  // The agreement choices are five: keys beyond them choose nothing.
  await page.keyboard.press('7')
  await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
  await choose(page, '4'); await expect(page.getByRole('radio', { name: 'Agree', exact: true })).toBeChecked(); await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'This website is easy to use.' })).toBeVisible()
  await choose(page, '2'); await page.keyboard.press('Enter')
  await page.getByLabel('Anything you want to tell us?').fill('Share seemed like the place for people. <script>not markup</script>')
  // The CLI verifies snapshots asynchronously; disabled buttons cannot receive keyboard focus.
  await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Finish' }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()
  await expect.poll(() => output).toContain('Reached the goal:')
}
// next dev compiles a route on its first visit; on a cold CI runner that alone can outlast an assertion, so the guide the rehearsals walk to is built first.
test.beforeAll(async ({ playwright }) => { const site = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL }); expect((await site.get('/docs/getting-started', { timeout: 60_000 })).ok()).toBe(true); await site.dispose() })
test.afterEach(async () => { if (child) { child.kill('SIGTERM'); await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', () => resolve()); setTimeout(resolve, 3000) } }) } })

test('keyboard rehearsal, privacy projection, a click that did nothing, off your path, separate trace and the goal reached', async ({ page, request }) => {
  await start(); await begin(page)
  const projection = await page.evaluate(async () => (await fetch('/api/ui-tests')).text())
  expect(projection).not.toMatch(/happyPath|expected|hooks|\/docs\/getting-started|ui-tests/)
  const taskbar = page.getByRole('complementary', { name: 'Your task' })
  // The chrome is the inverse of the host page: on this light site the pill is the site's ink with the canvas as its text, opaque,
  // so it never shares a panel colour; without an accent in the config, Done takes the chrome's own text colour.
  const pill = taskbar.locator('.uit-pill')
  await expect(pill).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(pill).toHaveCSS('color', 'rgb(246, 246, 246)')
  await expect(taskbar.getByRole('button', { name: 'Done', exact: true })).toHaveCSS('background-color', 'rgb(246, 246, 246)')
  expect(await pill.evaluate(node => getComputedStyle(node).fontFamily)).toBe(await page.evaluate(() => getComputedStyle(document.body).fontFamily))
  // The recording state leads the pill, and pausing it says so in words.
  await taskbar.getByRole('button', { name: 'Pause recording' }).click()
  await expect(taskbar.getByRole('group', { name: 'Recording', exact: true })).toContainText('Paused')
  await taskbar.getByRole('button', { name: 'Resume recording' }).click()
  // While the person types in the page the bar steps aside, and it comes back when they leave the field.
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'typing-probe'; document.body.prepend(input) })
  await page.locator('#typing-probe').focus()
  await expect(page.locator('aside[aria-label="Your task"]')).toBeHidden()
  await page.locator('#typing-probe').blur()
  await expect(taskbar).toBeVisible()
  // The grip drags the pill anywhere; where it was put is remembered.
  const before = (await pill.boundingBox())!
  const grip = (await taskbar.getByRole('button', { name: 'Move the task bar to the top' }).boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down()
  await page.mouse.move(grip.x - 150, grip.y - 120, { steps: 8 }); await page.mouse.up()
  const after = (await pill.boundingBox())!
  expect(before.x - after.x).toBeGreaterThan(100); expect(before.y - after.y).toBeGreaterThan(80)
  await expect(taskbar).toHaveClass(/uit-bottom/)
  expect(await page.evaluate(() => sessionStorage.getItem('ui-tests-bar-offset'))).toMatch(/"x":-\d+/)
  // The bar moves to the top and back, and is never removable.
  await taskbar.getByRole('button', { name: 'Move the task bar to the top' }).click()
  await expect(taskbar).toHaveClass(/uit-top/)
  await taskbar.getByRole('button', { name: 'Move the task bar to the bottom' }).click()
  await expect(taskbar).toHaveClass(/uit-bottom/)
  await taskbar.getByRole('button', { name: 'Show task' }).click()
  // The participant view never names the tool under test.
  await expect(taskbar.locator('.uit-task')).toContainText('Imagine you want to start trying this tool.')
  await expect(taskbar.locator('.uit-task')).toContainText("When you think you've finished, press Done. If you get stuck, press I couldn't do this.")
  await taskbar.getByRole('button', { name: 'Hide task' }).click()
  await page.evaluate(() => { const button = document.createElement('button'); button.id = 'dead-click-probe'; button.textContent = 'Probe'; document.body.append(button) })
  await page.locator('#dead-click-probe').click()
  await page.waitForTimeout(400)
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'private'; input.value = 'DO-NOT-RECORD'; document.body.append(input); input.dispatchEvent(new Event('input', { bubbles: true })); history.pushState({}, '', '/detour') })
  await page.waitForTimeout(350)
  await page.getByRole('link', { name: 'Get started' }).first().focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/docs\/getting-started$/, { timeout: 15_000 })
  await expect(taskbar).toBeVisible()
  await taskbar.getByRole('button', { name: 'Done', exact: true }).focus(); await page.keyboard.press('Enter')
  await taskbar.getByRole('button', { name: 'Not yet' }).click()
  await expect(taskbar.getByRole('group', { name: 'Finished this task?' })).toHaveCount(0)
  // Cancelling puts focus back on Done, which the confirmation had replaced in the pill.
  await expect(taskbar.getByRole('button', { name: 'Done', exact: true })).toBeFocused()
  await finish(page)
  await questions(page)
  await expect.poll(async () => traceText(await (await request.get(trace)).text())).toContain('"reached": "yes"')
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('Rehearsal: 0 of 5 planned attempts recorded.')
  expect(html).toContain('nothing happened'); expect(html).toContain('Off your path · opened /detour'); expect(html).toContain('Last page: http://localhost:3000/docs/getting-started')
  expect(html).not.toContain('DO-NOT-RECORD')
  expect(html).toContain('Their words: Share seemed like the place for people. <script>not markup</script>')
  // The open first-impression answer, with the code proposed against the purpose and how it was made.
  expect(html).toContain('Their words: A way to find out whether people can use what I built')
  expect(html).toContain('words in common: find, out, whether, people, use, built')
  expect(html).toContain('proposed by word overlap (no model configured)')
  // The appeal rating and the first click, coded against the happy path.
  expect(html).toContain('How appealing the page looked: 7 of 9')
  expect(html).toMatch(/First click, toward “start trying ui-tests”: a\S*[^·]*→ http:\/\/localhost:3000\/docs\/getting-started/)
  expect(await (await request.get(trace)).text()).toMatch(/aria-label="Where the first click led"[^>]*>\s*<option[^>]*selected[^>]*>on your path</)
  expect(html).toContain('What made it difficult: I could not tell where people were added.')
  expect(html).toContain('After the goal: Easy to use? 2 of 5 · Would it help them? 4 of 5')
  expect(html).toContain("How sure they'd done it: not asked")
  expect(html).toContain('Screener')
  expect(new URL(trace).port).not.toBe('3000')
})
test('pressing I couldn\'t do this after trying ends as such, apart from not reaching the goal, and still asks how easy it was', async ({ page, request }) => {
  await start(); await begin(page)
  await page.getByRole('heading', { level: 1 }).click()
  await page.getByRole('complementary', { name: 'Your task' }).getByRole('button', { name: "I couldn't do this" }).click(); await questions(page)
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain("How it ended: pressed I couldn't do this"); expect(html).toContain('"reached": "no"'); expect(html).toContain('How easy was it? 3 of 7 (7 = very easy)')
})
test('leaving before the first interaction confirms and records an early abandonment', async ({ page, request }) => {
  await start(); await begin(page)
  const bar = page.getByRole('complementary', { name: 'Your task' })
  await bar.getByRole('button', { name: "I couldn't do this" }).click()
  const confirm = bar.getByRole('group', { name: 'Leave this task before trying it?' })
  await confirm.getByRole('button', { name: 'Stay and try' }).click()
  await expect(confirm).toHaveCount(0)
  await bar.getByRole('button', { name: "I couldn't do this" }).click()
  await confirm.getByRole('button', { name: 'Leave this task' }).click()
  await questions(page, { seq: '1' })
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('How it ended: left before trying')
})
test('the path is only the route you expect: ending off it still reaches the goal, and the trace marks the pages off it', async ({ page, request }) => {
  await start(`task('start trying', {path:['/','/wrong']},()=>outcome(({page})=>expect(page.url()).toContain('/docs/getting-started')))`)
  await begin(page); await page.getByRole('link', { name: 'Get started' }).first().click(); await expect(page).toHaveURL(/\/docs\/getting-started$/); await finish(page); await questions(page)
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('"reached": "yes"'); expect(html).not.toContain('"expected": "/wrong"'); expect(html).toContain('Off your path · opened /docs/getting-started')
})
test('setup runs once for the attempt with request against the target, and the outcome reads the app with request and setup, whatever page they ended on', async ({ page, request }) => {
  await start(`setup(async({request})=>{const guide=await (await request.get('/docs/getting-started')).text();return {start:'/',colleague:'Sam',email:'sam@acme.example',heading:guide.includes('Getting started')?'Getting started':'missing'}})
task('start trying',{path:['/','/docs/getting-started'],firstLook:{page:'/'}},()=>outcome(async({request,setup})=>{expect(setup.email).toBe('sam@acme.example');expect(await (await request.get('/docs/getting-started')).text()).toContain(setup.heading)}))`)
  await begin(page)
  // They never open the guide: the outcome asks the app, not the page they ended on.
  await expect(page).toHaveURL(/localhost:3000\/$/)
  await finish(page); await questions(page)
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('"reached": "yes"')
  expect(html).toContain("Setup, run once for this attempt: started at /; the card's values: colleague Sam, email sam@acme.example, heading Getting started.")
  expect(output).toContain('Reached the goal: Yes')
})
test('a single task verifies its outcome through the CLI verify subcommand', async ({ page, request }) => {
  await start(`task('start trying',()=>outcome(({page})=>expect(page.url()).toContain('/docs/getting-started')))`)
  await begin(page); await page.getByRole('link', { name: 'Get started' }).first().click(); await expect(page).toHaveURL(/\/docs\/getting-started$/); await finish(page); await questions(page)
  expect(traceText(await (await request.get(trace)).text())).toContain('"reached": "yes"')
  await rm(authoredFile)
  const { stdout } = await promisify(execFile)(process.execPath, [path.resolve('packages/ui-tests/bin/ui-tests.mjs'), 'verify', new URL(player).pathname.split('/').at(-1)!])
  expect(JSON.parse(stdout).reached).toBe('yes')
})
test('a time-limited task warns, records evidence and has no result sentence', async ({ page, request }) => {
  await start(`task('explore possibilities',{timeLimit:'1 min'})`)
  expect(output).toContain('warning [outcome-required]')
  await begin(page); await finish(page); await questions(page, { confidence: '6' })
  const html = await (await request.get(trace)).text()
  expect(traceText(html)).toContain("How sure they'd done it: 6 of 7 (7 = completely sure)")
  expect(html).toContain('Issues-only exploration'); expect(parseHTML(html).document.querySelector('main > p > strong')).toBeNull()
})
test('running out of time keeps questions available, records a stop and masks final input evidence', async ({ page, request }) => {
  await start(`task('explore possibilities',{timeLimit:'0.18 min'})`)
  await begin(page)
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'secret-input'; input.setAttribute('value', 'PRIVATE-VALUE'); input.value = 'PRIVATE-VALUE'
    const area = document.createElement('textarea'); area.textContent = 'PRIVATE-TEXT'
    document.body.append(input, area); input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await questions(page, { confidence: '5' })
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('How it ended: ran out of time'); expect(html).toContain('stopped'); expect(html).toMatch(/Stopped \d+ s/); expect(html).toContain('[masked]')
  expect(html).not.toMatch(/PRIVATE-VALUE|PRIVATE-TEXT/)
})
test('non-observable outcome asks its validation question without sending the expected answer', async ({ page, request }) => {
  await start(`task('choose a plan',()=>outcome(async({participant})=>expect(await participant.answer('Which plan?',{choices:['April','May'],expected:'April'})).toBe('April')))`)
  await begin(page); await finish(page)
  await expect(page).toHaveURL(/\/ui-tests\//, { timeout: 15_000 })
  await expect(page.getByText('After the task · 1 of', { exact: false })).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => JSON.parse(await page.evaluate(async () => (await fetch('/api/ui-tests')).text())).validation?.question, { timeout: 15_000 }).toBe('Which plan?')
  const projection = await page.evaluate(async () => (await fetch('/api/ui-tests')).text())
  expect(projection).not.toContain('expected')
  await questions(page, { validation: 'April' })
  expect(traceText(await (await request.get(trace)).text())).toContain('"reached": "yes"')
})
test('Talk instead asks for the microphone once, records with a live indicator and a stop, shows the transcript as it arrives, and keeps audio and words with the attempt', async ({ page, request, context }) => {
  await context.grantPermissions(['microphone'], { origin: 'http://localhost:3000' })
  // A stand-in for the browser's speech service, which a headless browser does not have: it speaks one sentence in two parts.
  await page.addInitScript(() => {
    class FakeRecognition {
      continuous = false; interimResults = false; lang = 'en'; onresult: ((event: unknown) => void) | null = null; onerror: (() => void) | null = null
      start() {
        const result = (text: string, isFinal: boolean) => Object.assign([{ transcript: text }], { isFinal })
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [result('Share seemed like', false)] }), 300)
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [result('Share seemed like the place for people.', true)] }), 900)
      }
      stop() {}
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition })
  })
  await start(); await begin(page); await finish(page)
  await expect(page).toHaveURL(/\/ui-tests\//, { timeout: 15_000 })
  await expect(page.getByText('After the task · 1 of', { exact: false })).toBeVisible({ timeout: 15_000 })
  await choose(page, '6'); await page.keyboard.press('Enter')
  await choose(page, '4'); await page.keyboard.press('Enter')
  await choose(page, '2'); await page.keyboard.press('Enter')
  const indicator = page.getByRole('group', { name: 'Recording', exact: true })
  await expect(indicator).toContainText('Voice off')
  await page.getByRole('button', { name: 'Talk instead' }).click()
  // Consent first, in the flow; "Keep typing" leaves the microphone closed.
  await page.getByRole('group', { name: 'Talk instead of typing?' }).getByRole('button', { name: 'Keep typing' }).click()
  await page.getByRole('button', { name: 'Talk instead' }).click()
  await page.getByRole('button', { name: 'Use the microphone' }).click()
  await expect(page.getByRole('status').filter({ hasText: /Recording \d:\d\d/ })).toBeVisible()
  await expect(indicator).toContainText('Voice recording now')
  const box = page.getByLabel('Anything you want to tell us?')
  await expect(box).toHaveValue('Share seemed like the place for people.')
  await expect(box).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Finish' })).toBeDisabled()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await expect(page.getByText(/Voice recorded · \d:\d\d/)).toBeVisible()
  await expect(indicator).toContainText('Voice recorded')
  // The transcript can be corrected after recording.
  await box.fill('Share seemed like the place for people!')
  // Consent was given once: recording again does not ask a second time.
  await page.getByRole('button', { name: 'Record again' }).click()
  await expect(page.getByRole('group', { name: 'Talk instead of typing?' })).toHaveCount(0)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Stop' }).click()
  await box.fill('Share seemed like the place for people!')
  // A result the speech service delivers after Stop does not overwrite the correction.
  await page.waitForTimeout(500)
  await expect(box).toHaveValue('Share seemed like the place for people!')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await expect(page.getByRole('button', { name: 'Finish' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()
  await expect.poll(() => output).toContain('Reached the goal:')
  const html = await (await request.get(trace)).text()
  const text = traceText(html)
  expect(text).toContain('voice, with consent given when they chose to talk')
  expect(text).toContain('Spoken answer (their words')
  expect(text).toContain('Transcript: Share seemed like the place for people!')
  expect(text).toContain('Their words: Share seemed like the place for people!')
  const audio = parseHTML(html).document.querySelector('audio')!
  expect(audio.getAttribute('src')).toMatch(/^data:audio\/(webm|ogg|mp4);base64,[A-Za-z0-9+/]{100,}/)
  expect(audio.hasAttribute('controls')).toBe(true)
})
