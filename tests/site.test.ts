import { it, expect } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { rehearsal } from '../apps/web/lib/copy'
import { sentence } from '../packages/ui-tests/src/compiler'
import sessions from '../apps/web/public/sessions/sessions.json'

it('refuses to rewrite a README without its contributing section and preserves that section when present', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-tests-readme-'))
  const exec = promisify(execFile)
  const args = ['--import', import.meta.resolve('tsx'), resolve('apps/web/scripts/render-readme.mjs')]
  const options = { cwd: directory, timeout: 10000 }
  try {
    const file = join(directory, 'README.md')
    const original = '# Hand-maintained README\n\nKeep this content.\n'
    await writeFile(file, original)
    await expect(exec(process.execPath, args, options)).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('README contributing section not found') })
    expect(await readFile(file, 'utf8')).toBe(original)
    const contributing = '## Contributing and automation\n\nPreserve **exactly**.\n'
    await writeFile(file, original + contributing)
    await exec(process.execPath, args, options)
    const rendered = await readFile(file, 'utf8')
    expect(rendered).toContain('## Terminal output')
    expect(rendered.slice(rendered.indexOf('## Contributing and automation'))).toBe(contributing)
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 30000)

it('keeps the actual rehearsal sentence and the approved nav mark', async () => {
  expect(rehearsal).toBe(sentence())
  expect(await readFile('design/brand/logomark.svg', 'utf8')).toContain('currentColor')
  const demo = await readFile('apps/web/public/demo/weekboard.html', 'utf8')
  expect(demo).toContain('noindex, nofollow')
})

it('ships all five real attempts, four small playable reels and the card posters, with the approved moments', async () => {
  expect(sessions.attempts.map(a => a.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  for (const attempt of sessions.attempts) {
    expect((await stat(`apps/web/public${attempt.video}`)).size).toBeLessThan(2 * 1024 * 1024)
    expect((await stat(`apps/web/public${attempt.poster}`)).size).toBeGreaterThan(1000)
  }
  for (let i = 1; i <= 4; i++) {
    const video = await readFile(`apps/web/public/sessions/problem-${i}.webm`)
    expect(video.subarray(0, 4).toString('hex')).toBe('1a45dfa3')
    expect(video.length).toBeLessThan(2 * 1024 * 1024)
    // A blank poster is a few kilobytes of white; a frame of the board is tens.
    expect((await stat(`apps/web/public/sessions/problem-${i}.jpg`)).size).toBeGreaterThan(15000)
  }
  // Problems in the run's rank: 1 Add twice, 2 the grey Add, 3 the Share menu, 4 the board search.
  for (const [id, seconds, issue] of [['p1', 4, 3], ['p1', 30, 4], ['p2', 6, 3], ['p2', 49, 2], ['p3', 3, 3], ['p3', 58, 1], ['p3', 23, 4], ['p4', 41, 1], ['p5', 9, 3]] as const) {
    expect(sessions.attempts.find(a => a.id === id)?.moments).toContainEqual(expect.objectContaining({ seconds, issue }))
  }
  // Every attempt's flow ends where "How it ended" says.
  for (const attempt of sessions.attempts) expect(attempt.moments.at(-1)).toMatchObject({ kind: 'ended', what: attempt.ended === 'done' ? 'Pressed Done' : "Pressed I couldn't do this" })
  const p3 = sessions.attempts.find(a => a.id === 'p3')!
  expect(p3).toMatchObject({ person: 'Person 3', source: 'paid panel', reached: 'no', ended: 'done', sure: 6, ease: 3, time: 63, consent: { screen: true, voice: true, camera: false } })
  expect(p3.blockers?.map(b => [b.n, b.impact, b.from, b.to])).toEqual([[1, 'wrong end state', 58, 63], [2, 'slowed', 3, 19], [3, 'confused', 23, 36]])
  for (const blocker of p3.blockers ?? []) expect((await stat(`apps/web/public${blocker.poster}`)).size).toBeGreaterThan(15000)
})

it('applies the light Weekboard palette to the demo and draws the chrome as its inverse with the mint accent', async () => {
  const demo = await readFile('apps/web/public/demo/weekboard.html', 'utf8')
  const palette = await readFile('design/artefacts/weekboard-light.css', 'utf8')
  // The light canvas is a cool grey, never white, with the same orange accent.
  for (const token of ['--canvas: #e1e2e7', '--surface: #eef0f5', '--ink: #2c3353', '--moment: #b15c00']) {
    expect(palette).toContain(token)
    expect(demo).toContain(token)
  }
  // The chrome: Weekboard's ink as the surface and its canvas as the text, the mint accent, never the app's orange.
  for (const token of ['--ch-surface: #2c3353', '--ch-ink: #e1e2e7', '--ch-accent: #5fe3c0']) expect(demo).toContain(token)
  expect(demo).toMatch(/\.sheet \{[^}]*background: var\(--ch-surface\)/)
  expect(demo).toMatch(/\.pill \{[^}]*background: var\(--ch-surface\)/)
  expect(demo).not.toMatch(/--player-|#ff9e64/)
  // The card's text and the bar's two labels, as the research settled them.
  expect(demo).toContain("You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.")
  expect(demo).toContain("When you think you've finished, press <b>Done</b>. If you get stuck, press <b>I couldn't do this</b>.")
  expect(demo).toMatch(/id="scenarioStart">Start task</)
  expect(demo).toMatch(/id="done" type="button">Done</)
  expect(demo).toMatch(/id="cant" type="button">I couldn't do this</)
})

it('carries the derived card text in all four places and no old bar label anywhere it is shown', async () => {
  const { landing, guide } = await import('../apps/web/lib/copy')
  const derived = "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co."
  expect(landing.scenario).toBe(derived)
  expect(guide.next).toContain(derived)
  for (const file of ['apps/web/public/demo/weekboard.html', 'design/artefacts/scenario-card.html', 'README.md']) {
    const text = await readFile(file, 'utf8')
    expect(text, file).toContain(derived)
    expect(text, file).not.toContain('Imagine you want to invite a colleague')
  }
})

it('shows the file init writes, verbatim, in the artefact, the landing copy, the guide and the README, and each step\'s text as the artefact has it', async () => {
  const { exampleFile } = await import('../packages/ui-tests/src/example')
  const { inviteExample, inviteFile, compilation } = await import('../apps/web/lib/copy')
  const { parseHTML } = await import('linkedom')
  const artefact = parseHTML(await readFile('design/artefacts/compile-section.html', 'utf8')).document
  expect([...artefact.querySelectorAll('#code li .src')].map(line => line.textContent!.replace(/^ $/, '')).join('\n')).toBe(exampleFile)
  expect(inviteExample).toBe(exampleFile)
  expect(inviteFile).toBe('ui-tests/invite.ui.test.ts')
  expect(await readFile('README.md', 'utf8')).toContain(exampleFile)
  expect(await readFile('apps/web/app/docs/getting-started/page.tsx', 'utf8')).toContain('code={inviteExample} title={inviteFile}')
  // Issue #54: the whole file comes after the steps' previous and next row, and no step carries code of its own.
  const pieces = [...artefact.querySelectorAll('li.pair')]
  expect(artefact.querySelector('.stepnav')!.nextElementSibling!.matches('section.whole-top.after-steps')).toBe(true)
  expect(artefact.querySelectorAll('.pair .excerpt, .pair .window, .pair .lines-note, .pair pre').length).toBe(0)
  expect(artefact.querySelector('#rows')!.textContent).not.toContain('After Done')
  expect(compilation.pieces.every(p => !('lines' in p) && !('fields' in p))).toBe(true)
  expect('check' in compilation).toBe(false)
  // Each step's text, against the artefact, in participant order.
  expect(compilation.pieces.map(p => p.notes.join(' ').replaceAll('`', ''))).toEqual(pieces.map(p => [...p.querySelectorAll('.intro .from')].map(from => from.textContent).join(' ').replace("the ones that gave up", "the ones that ended with I couldn't do this")))
  expect(compilation.pieces.map(p => p.returns)).toEqual(pieces.map(p => p.querySelector('.back-line')!.textContent!.replace(/^Comes back/, '')))
  // Issue #46, item 3: the tabs carry the names the artefact gives its steps, 1 Consent to 6 After the task.
  expect(compilation.pieces.map(p => p.tab)).toEqual(pieces.map(p => p.getAttribute('data-name')))
})

it('carries the contract changes in the PRDs and the taskbar sentence in PRD 06', async () => {
  const prd01 = await readFile('docs/prd/01-dx-contract.md', 'utf8'), prd02 = await readFile('docs/prd/02-study-and-verdict.md', 'utf8')
  expect(await readFile('docs/prd/06-nonfunctional.md', 'utf8')).toContain("styled as a distinct overlay, the inverse of the host page with the author's font and accent, never sharing the host page's panel colour.")
  for (const text of ['video: true', 'impression: { page }', '`start`', 'What was that page for?']) expect(prd01, text).toContain(text)
  expect(prd01).not.toContain("record: 'screen'`")
  expect(prd02).toContain('What was that page for?')
  expect(prd02).not.toMatch(/"What is this for\?" with the (context's )?purpose/)
})

it('the demo bar steps aside while a field has focus, drags by its grip, and Done asks in place', async () => {
  const demo = await readFile('apps/web/public/demo/weekboard.html', 'utf8')
  expect(demo).toMatch(/\.bar\.typing \{ visibility: hidden; \}/)
  expect(demo).toContain("document.addEventListener('focusin'")
  expect(demo).toContain("grip.addEventListener('pointermove'")
  expect(demo).toMatch(/aria-label="Finished this task\?"[^>]*hidden><p>Finished this task\?<\/p><button class="yes" id="doneYes" type="button">Yes, I've finished<\/button><button class="no" id="doneNo" type="button">Not yet<\/button>/)
})

it('licenses the code under MIT to miguel.design, with no personal name, and says so in every manifest (issue #51)', async () => {
  const licence = await readFile('LICENSE', 'utf8')
  expect(licence).toMatch(/^MIT License\n\nCopyright \(c\) 2026 miguel\.design\n/)
  expect(licence).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  for (const manifest of ['package.json', 'apps/web/package.json', 'packages/ui-tests/package.json']) expect(JSON.parse(await readFile(manifest, 'utf8')).license, manifest).toBe('MIT')
  const shell = await readFile('apps/web/components/site-shell.tsx', 'utf8')
  for (const text of [licence, shell]) expect(text).not.toMatch(/Miguel|Pérez|Perez/)
})

