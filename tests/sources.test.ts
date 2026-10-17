import { it, expect, vi } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseHTML } from 'linkedom'

/** Issue #31: where the people come from. */
const artefact = async () => parseHTML(`<html><body>${await readFile('design/artefacts/sources-section.html', 'utf8')}</body></html>`).document
const text = (node: Element | null | undefined) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim()
const plain = (value: string) => value.replaceAll('`', '')

it('carries every cell, step and caveat of the sources artefact verbatim, in the order your link, your visitors, a paid panel', async () => {
  const { sources } = await import('../apps/web/lib/copy')
  const document = await artefact()
  expect(sources.heading).toBe(text(document.querySelector('.head h1')))
  expect(sources.lead).toBe(text(document.querySelector('.head p')))
  expect([...document.querySelectorAll('.cols span')].map(text).filter(Boolean)).toEqual([...sources.columns])
  const rows = [...document.querySelectorAll('.src')]
  expect(sources.rows.map(row => row.name)).toEqual(['Your link', 'Your visitors', 'A paid panel'])
  expect(rows.map(row => text(row.querySelector('.name b')))).toEqual(sources.rows.map(row => row.name))
  sources.rows.forEach((row, i) => {
    const html = rows[i]
    const cell = (k: string) => html.querySelector(`.cell[data-k="${k}"]`)!
    const note = (k: string) => text(cell(k).querySelector('small'))
    const main = (k: string) => text(cell(k)).slice(0, text(cell(k)).length - note(k).length).trim()
    expect(plain(row.what), row.name).toBe(text(html.querySelector('.name > span')))
    expect(plain(row.who), row.name).toBe(text(cell('Who')))
    expect([row.cost, row.costNote], row.name).toEqual([main('Cost'), note('Cost')])
    expect([row.time, row.timeNote], row.name).toEqual([main('Time'), note('Time')])
    expect(row.goodFor, row.name).toBe(text(cell('Good for')))
    expect(row.steps.map(plain), row.name).toEqual([...html.querySelectorAll('.steps3 li')].map(text))
    expect(`${row.caveat[0]} ${row.caveat[1]}`, row.name).toBe(text(html.querySelector('.caveat')))
  })
  // The fill: each panel's count, first person, pool and speed, and the payment against the cap.
  const fill = document.querySelector('.fill')!
  expect([...fill.querySelectorAll('.fill-row')].map(row => [text(row.querySelector('.mark')).replace(/^[PC]/, ''), text(row.querySelector('.mono')), text(row.querySelector('.when'))])).toEqual(sources.fill.sources.map(s => [s.name, s.count, s.first]))
  expect([...fill.querySelectorAll('.fill-sub dd')].map(text)).toEqual(sources.fill.sources.flatMap(s => [plain(s.pool), s.speed]))
  expect(text(fill.querySelector('.fill-f'))).toBe(`Paid ${sources.fill.paid} of the ${sources.fill.cap} cap · ${sources.fill.back} back${sources.fill.labelled}`)
  // The three items the issue names, word for word.
  expect(sources.rows[0].cost + ' ' + sources.rows[0].costNote).toBe('Free Pay them if you like; the consent says so either way')
  expect(sources.rows[2].cost + '. ' + sources.rows[2].costNote).toBe('About $11 a person. Five about $55; a cap of $70 holds the reserve')
  expect(sources.rows[2].time + '. ' + sources.rows[2].timeNote).toBe('First people within minutes. Usually all five within a few hours; a narrow audience a day or more')
  expect(sources.rows[1].cost + ', ' + sources.rows[1].costNote.toLowerCase()).toBe('Paid like the panel, under a daily cap you set')
})

async function files(directory: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['node_modules', '.next'].includes(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await files(path))
    else if (/\.(tsx?|mjs|css|html|json|md)$/.test(entry.name)) found.push(path)
  }
  return found
}

it('says 48 hours only as the deadline, and has no $60 cap, no $54 and no "visibly struggling" anywhere a visitor or the docs read', async () => {
  const { deadlineSentence } = await import('../packages/ui-tests/src/compiler')
  expect(deadlineSentence).toBe('The run closes at its deadline, 48 hours unless you set one.')
  const found: string[] = []
  for (const file of [...await files('apps/web'), ...await files('packages/ui-tests/src'), ...await files('docs/design'), 'README.md']) {
    const lines = (await readFile(file, 'utf8')).split('\n')
    lines.forEach((line, i) => {
      if (/48 hours/.test(line.replaceAll(deadlineSentence, '').replaceAll("'The run closes at its deadline, 48 hours unless you set one.'", ''))) found.push(`${file}:${i + 1} 48 hours`)
      if (/\$60\b/.test(line)) found.push(`${file}:${i + 1} $60`)
      if (/\$54\b/.test(line)) found.push(`${file}:${i + 1} $54`)
      if (/visibly struggling/i.test(line)) found.push(`${file}:${i + 1} visibly struggling`)
    })
  }
  expect(found).toEqual([])
  // The example cap is $70 in the guide's run output, the config example, the hosted form and PRD 01.
  expect(await readFile('apps/web/generated/terminal-run.html', 'utf8')).toContain('cap $70')
  expect((await import('../packages/ui-tests/src/example')).configFile).toContain('budget: { max: 70')
  expect(await readFile('apps/web/components/artefacts/hosted-form.tsx', 'utf8')).toContain('defaultValue="70"')
  expect(await readFile('docs/prd/01-dx-contract.md', 'utf8')).toContain('budget: { max: 70')
})

it('keeps the invitation one string in PRD 03, the player and the demo, and the trigger in the PRD\'s words', async () => {
  const { invitationText, invitation } = await import('../packages/ui-tests/src/next')
  expect(invitationText).toBe('This page seems to be giving you trouble. Would you show us where? Five minutes, paid, in your own words. The site is being tested, not you.')
  const prd = await readFile('docs/prd/03-participants.md', 'utf8')
  expect(prd).toContain(`"${invitationText}"`)
  expect(prd).not.toContain('Having trouble with this?')
  expect(prd).toContain('invited when a page has given them trouble twice')
  expect(prd).toContain('A no is not asked again that visit')
  expect(prd).toContain('[`../discovery/intercept-recruiting.md`](../discovery/intercept-recruiting.md)')
  const demo = parseHTML(await readFile('apps/web/public/demo/weekboard.html', 'utf8')).document
  expect(text(demo.querySelector('#invitation h2')) + ' ' + text(demo.querySelector('#invitation p'))).toBe(invitationText)
  expect([text(demo.querySelector('#inviteSure')), text(demo.querySelector('#inviteNo'))]).toEqual([invitation.accept, invitation.decline])
  for (const old of ['Looks like this is not going smoothly', 'Mind helping us', 'Having trouble with this?']) {
    for (const file of ['apps/web/public/demo/weekboard.html', 'packages/ui-tests/src/next.tsx', 'design/artefacts/sources-section.html']) expect(await readFile(file, 'utf8'), file).not.toContain(old)
  }
})

it('codes the first click against the happy path from where it starts', async () => {
  const { codeFirstClick } = await import('../packages/ui-tests/src/impression')
  const path = ['/board', '/settings/members']
  expect(codeFirstClick({ target: 'a#members', href: 'http://localhost/settings/members', x: .5, y: .5 }, path, '/board').code).toBe('on your path')
  expect(codeFirstClick({ target: 'button#share', after: 'http://localhost/board/link', x: .5, y: .1 }, path, '/board').code).toBe('off your path')
  expect(codeFirstClick({ target: 'button#avatar', after: 'http://localhost/board', x: .9, y: .1 }, path, '/board').code).toBe("couldn't tell")
  expect(codeFirstClick({ target: 'a point on the page', x: .2, y: .3 }, path, '/board').code).toBe("couldn't tell")
  expect(codeFirstClick({ target: 'a#x', href: '/settings/members', x: 0, y: 0 }, [], '/').code).toBe("couldn't tell")
  expect(codeFirstClick(null, path, '/board').code).toBe('no click')
})

it('takes the appeal rating and the first click with the open answer, codes the click, keeps the codes on the author\'s side and shows both in the trace', async () => {
  const { SQLiteAdapter } = await import('../packages/ui-tests/src/storage')
  const { compile } = await import('../packages/ui-tests/src/compiler')
  const { createCollector, participantView } = await import('../packages/ui-tests/src/server')
  const { renderTrace } = await import('../packages/ui-tests/src/trace')
  const store = new SQLiteAdapter(':memory:')
  const close = vi.spyOn(store, 'close').mockImplementation(() => {})
  try {
    const compiled = compile([{ users: 'people who plan work', purpose: 'plan the week together', goals: [{ name: 'invite a colleague', options: { happyPath: ['/board', '/settings/members'] }, tasks: [], outcomes: [() => {}], source: 'test' }], source: 'test' }])[0]
    expect(compiled.impression).toMatchObject({ appeal: { points: 9 }, firstClick: { toward: 'invite a colleague', codedAgainst: 'happyPath' } })
    const run = store.create(compiled)
    expect(participantView(run).impression).toMatchObject({ goal: 'invite a colleague' })
    expect(participantView(run).impression).not.toHaveProperty('codedAgainst')
    run.status = 'consented'; store.update(run)
    const handler = createCollector(() => store)
    const post = (body: unknown) => handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://localhost', cookie: `ui-tests-run=${run.id}.${run.token}` }, body: JSON.stringify(body) }))
    const click = { target: 'a#members', href: 'http://localhost/settings/members', x: .4, y: .2 }
    expect((await post({ action: 'impression', answer: 'planning the week', spoken: false, appeal: 10, firstClick: click })).status).toBe(400)
    const response = await post({ action: 'impression', answer: 'planning the week', spoken: false, appeal: 6, firstClick: click })
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toMatch(/on your path|happyPath/)
    const saved = store.get(run.id)!
    expect(saved.impression).toMatchObject({ appeal: 6, firstClick: { ...click, code: { code: 'on your path' } } })
    // Once per session: an identical retry is accepted, a different click refused.
    expect((await post({ action: 'impression', answer: 'planning the week', spoken: false, appeal: 6, firstClick: click })).status).toBe(200)
    expect((await post({ action: 'impression', answer: 'planning the week', spoken: false, appeal: 6, firstClick: null })).status).toBe(409)
    const trace = renderTrace(saved, [])
    expect(trace).toContain('How appealing the page looked: 6 of 9')
    expect(trace).toMatch(/<select aria-label="Where the first click led">/)
    expect(trace).toContain('on your path')
  } finally { close.mockRestore(); store.close() }
})

it('prints where the people come from in the run plan: both panels, the cap, how long people take and the deadline', async () => {
  const { compile, plan } = await import('../packages/ui-tests/src/compiler')
  const compiled = compile([{ users: 'people who plan work', purpose: 'plan the week together', goals: [{ name: 'invite a colleague', options: { happyPath: ['/board', '/settings/members'] }, tasks: [], outcomes: [() => {}], source: 'test' }], source: 'test' }])
  expect(plan(compiled)).not.toContain('Prolific')
  const run = plan(compiled, { cap: 70 })
  expect(run).toContain('the paid panel on Prolific and CloudResearch Connect: invitations spread across both under your $70 cap, each person labelled with the one they came from.')
  expect(run).toContain('Time: First people within minutes. Usually all 5 within a few hours; a narrow audience a day or more. The run closes at its deadline, 48 hours unless you set one.')
  expect(plan(compiled, {})).toContain('budget: { max: 70 }')
  // The guide's run output names the panel each person came from.
  const fragment = await readFile('apps/web/generated/terminal-run.html', 'utf8')
  for (const line of ['Person 1 · Prolific', 'Person 3 · CloudResearch Connect', 'Paid $55 of the $70 cap']) expect(fragment).toContain(line)
})
