import { it, expect } from 'vitest'
import { readFile, stat } from 'node:fs/promises'
import sessions from '../apps/web/public/sessions/sessions.json'

it('keeps the approved nav mark', async () => {
  expect(await readFile('design/brand/logomark.svg', 'utf8')).toContain('currentColor')
})

it("keeps the example run's five attempts, the board and the replay's still, with the approved moments", async () => {
  expect(sessions.attempts.map(a => a.id).sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  // A blank still is a few kilobytes of white; a frame of the board is tens.
  for (const still of ['board.jpg', 'p3-58.jpg']) expect((await stat(`apps/web/public/sessions/${still}`)).size).toBeGreaterThan(15000)
  // Problems in the run's rank: 1 Add twice, 2 the grey Add, 3 the Share menu, 4 the board search.
  for (const [id, seconds, issue] of [['p1', 4, 3], ['p1', 30, 4], ['p2', 6, 3], ['p2', 49, 2], ['p3', 3, 3], ['p3', 58, 1], ['p3', 23, 4], ['p4', 41, 1], ['p5', 9, 3]] as const) {
    expect(sessions.attempts.find(a => a.id === id)?.moments).toContainEqual(expect.objectContaining({ seconds, issue }))
  }
  // Every attempt's flow ends where "How it ended" says.
  for (const attempt of sessions.attempts) expect(attempt.moments.at(-1)).toMatchObject({ kind: 'ended', what: attempt.ended === 'done' ? 'Pressed Done' : "Pressed I couldn't do this" })
  const p3 = sessions.attempts.find(a => a.id === 'p3')!
  expect(p3).toMatchObject({ person: 'Person 3', source: 'paid panel', reached: 'yes', ended: 'done', sure: 6, ease: 3, time: 63, consent: { screen: true, voice: true, camera: false } })
  expect(p3.blockers?.map(b => [b.n, b.impact, b.from, b.to])).toEqual([[1, 'confused', 58, 63], [2, 'slowed', 3, 19], [3, 'confused', 23, 36]])
})

it('carries the derived card text on the landing and in the artefact, and no old bar label', async () => {
  const { landing } = await import('../apps/web/lib/copy')
  const derived = "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example."
  expect(landing.scenario).toBe(derived)
  for (const file of ['design/artefacts/scenario-card.html']) {
    const text = await readFile(file, 'utf8')
    expect(text, file).toContain(derived)
    expect(text, file).not.toContain('Imagine you want to invite a colleague')
  }
})

it('shows the study file, verbatim, in the artefact and the landing copy, and each step\'s text as the artefact has it', async () => {
  const { exampleFile } = await import('../apps/web/lib/example')
  const { inviteExample, inviteFile, compilation } = await import('../apps/web/lib/copy')
  const { parseHTML } = await import('linkedom')
  const artefact = parseHTML(await readFile('design/artefacts/compile-section.html', 'utf8')).document
  expect([...artefact.querySelectorAll('#code li .src')].map(line => line.textContent!.replace(/^ $/, '')).join('\n')).toBe(exampleFile)
  expect(inviteExample).toBe(exampleFile)
  expect(inviteFile).toBe('ui-tests/invite.ui.test.ts')
  // Issue #54: the whole file comes after the steps' previous and next row, and no step carries code of its own.
  const pieces = [...artefact.querySelectorAll('li.pair')]
  expect(artefact.querySelector('.stepnav')!.nextElementSibling!.matches('section.whole-top.after-steps')).toBe(true)
  expect(artefact.querySelectorAll('.pair .excerpt, .pair .window, .pair .lines-note, .pair pre').length).toBe(0)
  expect(artefact.querySelector('#rows')!.textContent).not.toContain('After Done')
  // Issue #62, item 4: step 2 keeps its text, its screen and its "Comes back" line, and loses the worked-out box, its CSS and its copy.
  expect(artefact.querySelectorAll('.pair .check, .pair dl.res').length).toBe(0)
  expect(artefact.querySelector('#rows')!.textContent).not.toMatch(/Worked out on your side|Chance of seeing a 1-in-3 problem/)
  expect(await readFile('design/artefacts/compile-section.html', 'utf8')).not.toMatch(/^\.check\b/m)
  const step2 = pieces.find(p => p.getAttribute('data-name') === 'Screener')!
  expect([!!step2.querySelector('.intro .from'), !!step2.querySelector('.frame'), !!step2.querySelector('.back-line')]).toEqual([true, true, true])
  expect('sample' in compilation).toBe(false)
  expect(await readFile('apps/web/app/globals.css', 'utf8')).not.toContain('.compile-check')
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

it('licenses the code under MIT to miguel.design, with no personal name, and says so in every manifest (issue #51)', async () => {
  const licence = await readFile('LICENSE', 'utf8')
  expect(licence).toMatch(/^MIT License\n\nCopyright \(c\) 2026 miguel\.design\n/)
  expect(licence).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
  for (const manifest of ['package.json', 'apps/web/package.json']) expect(JSON.parse(await readFile(manifest, 'utf8')).license, manifest).toBe('MIT')
  const shell = await readFile('apps/web/components/site-shell.tsx', 'utf8')
  for (const text of [licence, shell]) expect(text).not.toMatch(/Miguel|Pérez|Perez/)
})

it('holds the host section to its artefact word for word: the server\'s command, what it prints, and the tag init prints', async () => {
  const { hosted, hostedServer } = await import('../apps/web/lib/copy')
  const { tagFor } = await import('../packages/ui-tests/src/browser/tag')
  const { parseHTML } = await import('linkedom')
  const artefact = parseHTML(await readFile('design/artefacts/hosted-section.html', 'utf8')).document
  const text = (selector: string) => [...artefact.querySelectorAll(selector)].map(node => node.textContent!)
  expect(text('.head h1')).toEqual([hosted.heading])
  expect(text('.head p')).toEqual([hosted.lead.replaceAll('`', '')])
  expect(text('.intro h2')).toEqual([hosted.command.name, hosted.line.name])
  expect(text('.intro p')).toEqual([hosted.command.intro, hosted.line.intro])
  expect(text('.tab span')).toEqual([...hosted.command.tab, ...hosted.line.tab])
  expect(text('.term')).toEqual([hosted.terminal])
  expect(text('.snip')).toEqual([hosted.snippet])
  expect(text('.closing')).toEqual([hosted.closing])
  // One way in: the line is the tag init prints, for the example's server, and the terminal starts that server.
  expect(hosted.snippet).toBe(tagFor(hostedServer))
  expect(hosted.terminal.split('\n')).toEqual(['$ npx ui-tests serve', `ui-tests server: ${hostedServer}`, `<script data-ui-tests="${hostedServer}">…</script>`])
  expect(hosted.lead).toContain('`npx ui-tests host`, one command that puts it in an account you own, is not shipped yet.')
})
