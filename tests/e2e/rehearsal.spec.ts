import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import path from 'node:path'
import { parseHTML } from 'linkedom'
function traceText(html: string) { return parseHTML(html).document.body.textContent ?? '' }

let child: ChildProcess
let player: string, trace: string, output: string, authoredFile: string
async function start(body?: string) {
  const root = process.cwd()
  let file = path.join(root, 'apps/web/landing.ui.test.ts')
  if (body) {
    await mkdir(path.join(root, '.ui-tests'), { recursive: true })
    file = path.join(root, '.ui-tests', `fixture-${Date.now()}.ui.test.ts`)
    await writeFile(file, `import {context, goal, task, outcome, expect} from 'ui-tests'\ncontext({users:'developers',purpose:'finish my work'},()=>{${body}})`)
  }
  authoredFile = file
  output = ''
  child = spawn(process.execPath, [path.join(root, 'packages/ui-tests/bin/ui-tests.mjs'), '--no-open', '--file', file], { cwd: path.join(root, 'apps/web'), env: { ...process.env, NO_COLOR: '1' } })
  child.stdout!.on('data', chunk => { output += chunk.toString() }); child.stderr!.on('data', chunk => { output += chunk.toString() })
  await expect.poll(() => output, { timeout: 5000, message: 'CLI must open player within five seconds' }).toContain('Player: ')
  player = /Player: (\S+)/.exec(output)![1]; trace = /Trace: (\S+)/.exec(output)![1]
}
async function begin(page: Page) {
  await page.goto(player)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await expect(page.getByRole('button', { name: 'I consent' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: 'I consent' }).focus(); await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Begin task' }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('complementary', { name: 'Your task' })).toBeVisible()
}
async function questions(page: Page) {
  await expect(page.getByRole('heading', { name: 'A few final questions' })).toBeVisible({ timeout: 15_000 })
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByLabel('Overall,').selectOption('3')
  // The CLI verifies snapshots asynchronously; disabled buttons cannot receive keyboard focus.
  await expect(page.getByRole('button', { name: 'Send answers' })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Send answers' }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible()
  await expect.poll(() => output).toContain('Outcome:')
}
test.afterEach(async () => { if (child) { child.kill('SIGTERM'); await new Promise<void>(resolve => { if (child.exitCode !== null) resolve(); else { child.once('exit', () => resolve()); setTimeout(resolve, 3000) } }) } })

test('keyboard rehearsal, privacy projection, dead click, deviation, separate trace and correct outcome', async ({ page, request }) => {
  await start(); await begin(page)
  const projection = await page.evaluate(async () => (await fetch('/api/ui-tests')).text())
  expect(projection).not.toMatch(/happyPath|expected|hooks|\/docs\/getting-started|ui-tests/)
  const taskbar = page.getByRole('complementary', { name: 'Your task' })
  expect(await taskbar.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(250, 249, 246)')
  await page.getByText('From working software to usable software').click()
  await page.waitForTimeout(400)
  await page.evaluate(() => { const input = document.createElement('input'); input.id = 'private'; input.value = 'DO-NOT-RECORD'; document.body.append(input); input.dispatchEvent(new Event('input', { bubbles: true })); history.pushState({}, '', '/detour') })
  await page.waitForTimeout(350)
  await page.getByRole('link', { name: 'Get started' }).focus(); await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/docs\/getting-started$/)
  await expect(taskbar).toBeVisible()
  await page.getByRole('button', { name: "I'm done" }).focus(); await page.keyboard.press('Enter')
  await questions(page)
  await expect.poll(async () => traceText(await (await request.get(trace)).text())).toContain('"status": "correct"')
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('Rehearsal: 0 of 5 planned attempts recorded.')
  expect(html).toContain('dead click'); expect(html).toContain('deviation'); expect(html).toContain('/detour'); expect(html).toContain('Final URL: http://localhost:3000/docs/getting-started')
  expect(html).not.toContain('DO-NOT-RECORD')
  expect(new URL(trace).port).not.toBe('3000')
})
test('gave-up remains incorrect and still collects SEQ', async ({ page, request }) => {
  await start(); await begin(page)
  await page.getByRole('button', { name: "I can't do this" }).click(); await questions(page)
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('Terminal reason: gave up'); expect(html).toContain('"status": "incorrect"'); expect(html).toContain('Ease rating 3 of 7')
})
test('wrong happy path has an expected/actual URL diff', async ({ page, request }) => {
  await start(`goal('start trying', {happyPath:['/','/wrong']},()=>outcome(({page})=>expect(page.url()).toContain('/docs/getting-started')))`)
  await begin(page); await page.getByRole('link', { name: 'Get started' }).click(); await expect(page).toHaveURL(/\/docs\/getting-started$/); await page.getByRole('button', { name: "I'm done" }).click(); await questions(page)
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('"status": "incorrect"'); expect(html).toContain('"expected": "/wrong"'); expect(html).toContain('"actual": "http://localhost:3000/docs/getting-started"')
})
test('task steps advance individually and run checks against their own snapshots', async ({ page, request }) => {
  await start(`goal('start trying',()=>{task('Read the promise',({page})=>expect(page.url()).toContain('localhost:3000/'));task('Find the instructions',({page})=>expect(page.url()).toContain('/docs/getting-started'));outcome(({page})=>expect(page.url()).toContain('/docs/getting-started'))})`)
  await begin(page); await expect(page.getByText('Read the promise', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Done with this step' }).click()
  await expect(page.getByText('Find the instructions', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Get started' }).click(); await expect(page).toHaveURL(/\/docs\/getting-started$/)
  // Hold the separate verifier process so readiness cannot depend on machine speed.
  child.kill('SIGSTOP')
  try {
    await page.getByRole('button', { name: "I'm done" }).click()
    await expect(page.getByRole('heading', { name: 'A few final questions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send answers' })).toBeDisabled()
  } finally { child.kill('SIGCONT') }
  await questions(page)
  expect(traceText(await (await request.get(trace)).text())).toContain('"status": "correct"')
  await rm(authoredFile)
  const { stdout } = await promisify(execFile)(process.execPath, [path.resolve('packages/ui-tests/bin/ui-tests.mjs'), 'verify', new URL(player).pathname.split('/').at(-1)!])
  expect(JSON.parse(stdout).status).toBe('correct')
})
test('minutes-only exploration warns, records evidence and has no result sentence', async ({ page, request }) => {
  await start(`goal('explore possibilities',{minutes:1})`)
  expect(output).toContain('warning [outcome-required]')
  await begin(page); await page.getByRole('button', { name: "I'm done" }).click(); await questions(page)
  const html = await (await request.get(trace)).text()
  expect(html).toContain('Issues-only exploration'); expect(parseHTML(html).document.querySelector('main > p > strong')).toBeNull()
})
test('timeout keeps questions available, records a pause and masks final input evidence', async ({ page, request }) => {
  await start(`goal('explore possibilities',{minutes:0.18})`)
  await begin(page)
  await page.evaluate(() => {
    const input = document.createElement('input'); input.id = 'secret-input'; input.setAttribute('value', 'PRIVATE-VALUE'); input.value = 'PRIVATE-VALUE'
    const area = document.createElement('textarea'); area.textContent = 'PRIVATE-TEXT'
    document.body.append(input, area); input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await questions(page)
  const html = traceText(await (await request.get(trace)).text())
  expect(html).toContain('Terminal reason: timed out'); expect(html).toContain('pause at'); expect(html).toContain('[masked]')
  expect(html).not.toMatch(/PRIVATE-VALUE|PRIVATE-TEXT/)
})
test('non-observable outcome asks its validation question without sending the expected answer', async ({ page, request }) => {
  await start(`goal('choose a plan',()=>outcome(async({participant})=>expect(await participant.answer('Which plan?',{choices:['April','May'],expected:'April'})).toBe('April')))`)
  await begin(page); await page.getByRole('button', { name: "I'm done" }).click()
  await expect(page.getByLabel('Which plan?')).toBeVisible()
  const projection = await page.evaluate(async () => (await fetch('/api/ui-tests')).text())
  expect(projection).not.toContain('expected')
  await page.getByLabel('Which plan?').selectOption('April')
  await questions(page)
  expect(traceText(await (await request.get(trace)).text())).toContain('"status": "correct"')
})
