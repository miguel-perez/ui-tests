import { it, expect } from 'vitest'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseHTML } from 'linkedom'
import { was, shown, offences } from './vocabulary'

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
  for (const file of [...await files('apps/web'), ...await files('packages/ui-tests/src')]) {
    const text = await readFile(file, 'utf8')
    text.split('\n').forEach((line, index) => { for (const name of offences(line, was)) found.push(`${file}:${index + 1} ${name}`) })
  }
  expect(found).toEqual([])
})

it('renders every terminal surface and fragment in the new words only', async () => {
  for (const file of (await readdir('apps/web/generated')).filter(name => name.endsWith('.html'))) {
    const text = parseHTML(`<pre>${await readFile(join('apps/web/generated', file), 'utf8')}</pre>`).document.querySelector('pre')!.textContent!
    expect(offences(text, shown), file).toEqual([])
  }
  const { stdout } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'report', 'apps/web/generated/example-report.json'], { env: { ...process.env, FORCE_COLOR: '0' }, timeout: 10000 })
  expect(offences(stdout, shown)).toEqual([])
  expect(stdout).toContain('Reached the goal: 2 of 5.')
  // Nobody was 7 of 7 sure and wrong, so the line is not shown.
  expect(stdout).not.toContain('Wrong, and sure')
  expect(stdout.split('\n').filter(line => /^[▏ ]\d/.test(line)).map(line => line.slice(10, 20).trim())).toEqual(['blocked', 'blocked', 'slowed', 'confused'])
}, 20000)

it('shows "Wrong, and sure" only at 7 of 7 and the goal not reached, and ranks problems by impact then by people', async () => {
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
