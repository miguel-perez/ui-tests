import { it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseHTML } from 'linkedom'
import { was, shown, offences, verbatim } from './vocabulary'

const exec = promisify(execFile)


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

it('finds none of the old words in apps/web, packages/ui-tests/src or the generated fragments', async () => {
  const found: string[] = []
  // Issues #38 and #43: globals.css takes the light block of design/artefacts/tokens.css verbatim as its token block, and the item
  // wins over this list; the block's lines are blanked first (tests/contrast.test.ts holds the block equal), so the line numbers stay true.
  const tokens = /^:root \{[^}]*\}/m.exec(await readFile('design/artefacts/tokens.css', 'utf8'))![0]
  for (const file of [...await files('apps/web'), ...await files('packages/ui-tests/src')]) {
    let text = await readFile(file, 'utf8')
    if (file.endsWith('globals.css')) text = text.replace(tokens, tokens.replace(/[^\n]/g, ''))
    // The sources section's verbatim phrases are taken out first; everything else on the line is still checked.
    text.split('\n').forEach((line, index) => { const rest = verbatim.reduce((left, phrase) => left.replaceAll(phrase, ''), line.replaceAll("\\'", "'")); for (const name of offences(rest, was)) found.push(`${file}:${index + 1} ${name}`) })
  }
  expect(found).toEqual([])
})

it('keeps every verbatim exception in the sources artefact, word for word', async () => {
  // The artefact is a fragment without a body: its words are the markup with the tags taken out.
  const artefact = (await readFile('design/artefacts/sources-section.html', 'utf8')).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')
  for (const phrase of verbatim) expect(artefact, phrase).toContain(phrase)
})

it('renders every terminal surface and fragment in the new words only', async () => {
  for (const file of (await readdir('apps/web/generated')).filter(name => name.endsWith('.html'))) {
    const text = parseHTML(`<pre>${await readFile(join('apps/web/generated', file), 'utf8')}</pre>`).document.querySelector('pre')!.textContent!
    expect(offences(text, shown), file).toEqual([])
  }
  const { stdout } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'report', 'apps/web/generated/example-report.json'], { env: { ...process.env, FORCE_COLOR: '0' }, timeout: 10000 })
  expect(offences(stdout, shown)).toEqual([])
  expect(stdout).toContain('Reached the goal: 2 of 5.')
  // The goal has a check: two pressed Done but the check failed, and "Wrong, and sure" is never shown for it.
  expect(stdout).toContain('Pressed Done, but your check failed: 2 of 5.')
  expect(stdout).toContain('Problems found: 4, seen across all 5 people.')
  expect(stdout).not.toContain('Wrong, and sure')
  expect(stdout.split('\n').filter(line => /^[▏ ]\d/.test(line)).map(line => line.slice(10, 20).trim())).toEqual(['blocked', 'blocked', 'slowed', 'confused'])
}, 20000)

it('shows "Wrong, and sure" only at 7 of 7, the goal not reached and without a check, and ranks problems by impact then by people', async () => {
  const { ranked } = await import('../packages/ui-tests/src/report')
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import React from 'react';
    import { renderToString } from 'ink';
    import { TerminalOutput } from './packages/ui-tests/src/report.tsx';
    console.log(renderToString(React.createElement(TerminalOutput, { report: { people: 5, reached: 3, wrongAndSure: 1, problems: [{ title: 'Confusing label', people: 4, impact: 'confused' }, { title: 'Slow menu', people: 2, impact: 'slowed' }, { title: 'Hidden button', people: 1, impact: 'blocked' }, { title: 'Slow search', people: 3, impact: 'slowed' }] } }), { columns: 80 }));
  `], { env: { ...process.env, FORCE_COLOR: '0' }, timeout: 10000 })
  expect(stdout).toContain('Reached the goal: 3 of 5.')
  expect(stdout).toContain('Wrong, and sure: 1 of 5.')
  expect(ranked([{ title: 'a', people: 4, impact: 'confused' }, { title: 'b', people: 2, impact: 'slowed' }, { title: 'c', people: 1, impact: 'blocked' }, { title: 'd', people: 3, impact: 'slowed' }]).map(p => p.title)).toEqual(['c', 'd', 'b', 'a'])
  const { wrongAndSure } = await import('../apps/web/lib/attempts')
  const p3 = (await import('../apps/web/lib/attempts')).attempt('p3')
  expect(wrongAndSure(p3)).toBe(false)
  expect(wrongAndSure({ ...p3, sure: 7 })).toBe(true)
  expect(wrongAndSure({ ...p3, sure: 7, reached: 'yes' })).toBe(false)
  // Weekboard's goal has a check, so the attempt view says the check failed instead (attempt-view.tsx reads `!run.check`).
  expect(await readFile('apps/web/components/artefacts/attempt-view.tsx', 'utf8')).toContain('!run.check && wrongAndSure(shown)')
}, 20000)

it('catches the old labels of issue #35, item 4, and lets the new ones through', () => {
  for (const old of ['<th>Watch</th>', "label: 'Watch'", 'Watch Person 3 at 00:58', '<p>What to change</p>', 'Problems found: 4 across 5 people.', 'P3 · 00:03']) expect(offences(old, was), old).not.toEqual([])
  for (const now of ['Moments', 'Watch the clips.', 'the moment to watch', 'Suggested change', 'Problems found: 4, seen across all 5 people.', 'Person 3 · 00:03']) expect(offences(now, was), now).toEqual([])
})

it('ranks the Share-menu problem third on the report rows, the check and the Ink output', async () => {
  const { findings, exampleCheck } = await import('../apps/web/lib/pull-request')
  const report = JSON.parse(await readFile('apps/web/generated/example-report.json', 'utf8'))
  expect(findings[2]).toMatchObject({ rank: 3, impact: 'slowed', people: [1, 2, 3, 5] })
  expect(findings[2].title).toContain('Share menu')
  expect(exampleCheck.problems[2].title).toContain('Share menu')
  expect(report.problems[2].title).toContain('Share menu')
}, 20000)

it('writes the rehearsal trace page in the new words', async () => {
  const { SQLiteAdapter } = await import('../packages/ui-tests/src/storage')
  const { compile } = await import('../packages/ui-tests/src/compiler')
  const { renderTrace } = await import('../packages/ui-tests/src/trace')
  const store = new SQLiteAdapter(':memory:')
  try {
    const run = store.create(compile([{ users: 'people who plan work', purpose: 'plan the week', goals: [{ name: 'invite a colleague', options: { happyPath: ['/board', '/settings/members'] }, tasks: [], outcomes: [() => {}], source: 'test' }], source: 'test' }])[0])
    Object.assign(run, { reason: "couldn't do this", seq: 2, confidence: 6, afterGoal: { ease: 2, usefulness: 4 }, result: { reached: 'no', reason: "How it ended: pressed I couldn't do this" }, endedAt: run.startedAt + 63000 })
    const { document } = parseHTML(renderTrace(run, [{ type: 'pause', at: run.startedAt + 5000, url: 'http://localhost/board', stoppedMs: 7000 }, { type: 'url', at: run.startedAt + 12000, url: 'http://localhost/board/link' }]))
    // Raw records (the stored result, events and compiled context) keep their field names; everything a person reads uses the new words.
    for (const pre of document.querySelectorAll('pre, script, style')) pre.remove()
    const text = document.body.textContent!
    expect(offences(text, shown)).toEqual([])
    for (const line of ['Reached the goal: No', "How it ended: pressed I couldn't do this", 'Time on this goal: 63.0 s', 'How easy was it? 2 of 7 (7 = very easy)', "How sure they'd done it: 6 of 7 (7 = completely sure)", 'Easy to use? 2 of 5 · Would it help them? 4 of 5', 'Stopped 7 s', 'Off your path · opened /board/link', 'Their path and yours']) expect(text).toContain(line)
  } finally { store.close() }
})
