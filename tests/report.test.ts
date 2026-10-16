import { it, expect } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify, stripVTControlCharacters } from 'node:util'
import { parseHTML } from 'linkedom'

const exec = promisify(execFile)
/** The coloured runs of an HTML fragment: each piece of text with the colour of its closest styled span, adjacent runs of one colour merged. */
function colourRuns(html: string) {
  const { document } = parseHTML(`<html><body><pre>${html}</pre></body></html>`)
  const runs: [string, string][] = []
  const walk = (node: Node, colour: string) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) { const text = child.textContent ?? ''; if (!text) continue; const last = runs.at(-1); if (last && last[1] === colour) last[0] += text; else runs.push([text, colour]) }
      else walk(child, /color:(#[\da-f]{6})/.exec((child as Element).getAttribute?.('style') ?? '')?.[1] ?? colour)
    }
  }
  walk(document.querySelector('pre')!, 'ink')
  // Whitespace carries no colour a reader can see.
  return runs.filter(([text]) => text.trim()).map(([text, colour]) => [text.trim(), colour])
}

it('renders agent trials separately even when a people report is supplied', async () => {
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import React from 'react';
    import { renderToString } from 'ink';
    import { TerminalOutput } from './packages/ui-tests/src/report.tsx';
    import { surfaces } from './apps/web/scripts/render-terminal.mjs';
    console.log(renderToString(React.createElement(TerminalOutput, {...surfaces.agent, report: surfaces.report.report}), {columns: 80}));
  `], { env: { ...process.env, FORCE_COLOR: '0' }, timeout: 10000 })
  expect(stdout).toContain('Agent run · add a member through the API · 5 trials')
  expect(stdout).toContain('3 of 5 trials reached the outcome. Report: https://ui-tests.com/r/k2m9-agent')
  // Fixed-width fields first (trial, time), the outcome text last.
  const trials = stdout.trim().split('\n').slice(1, 6)
  expect(trials).toEqual([
    '1  0:19  reached the outcome · POST /members, then GET /members',
    '2  0:22  reached the outcome',
    '3  0:41  stopped: called POST /invites, which does not exist',
    '4  0:17  reached the outcome',
    '5  0:35  stopped: sent the email in the query string, 400',
  ])
  expect(stdout).not.toMatch(/people|Problems found/)
  const html = await readFile('apps/web/generated/terminal-agent.html', 'utf8')
  expect(parseHTML(`<pre>${html}</pre>`).document.querySelector('pre')!.textContent?.trim()).toBe(stdout.trim())
  // Stop reasons in the dead colour, counts in the moment hue, the URL in blue, trial numbers in the comment role.
  const { stdout: ansi } = await exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import React from 'react';
    import { renderToString } from 'ink';
    import { TerminalOutput } from './packages/ui-tests/src/report.tsx';
    import { surfaces } from './apps/web/scripts/render-terminal.mjs';
    console.log(renderToString(React.createElement(TerminalOutput, surfaces.agent), {columns: 80}));
  `], { env: { ...process.env, FORCE_COLOR: '3' }, timeout: 10000 })
  const { ansiToHtml } = await import('../apps/web/scripts/render-terminal.mjs')
  expect(colourRuns(ansiToHtml(ansi.trimEnd()))).toEqual(colourRuns(html))
  expect(colourRuns(html)).toEqual(expect.arrayContaining([['stopped: called POST /invites, which does not exist', '#f7768e'], ['3 of 5', '#ff9e64'], ['https://ui-tests.com/r/k2m9-agent', '#7aa2f7'], ['2', '#a9b1d6']]))
}, 20000)

it('colours shell blocks and init output: prompt in the comment role, command in ink, flags yellow, arguments and created files green', async () => {
  const runs = colourRuns(await readFile('apps/web/generated/terminal-commands.html', 'utf8'))
  expect(runs.slice(0, 6)).toEqual([['$', '#a9b1d6'], ['npm', '#a9b1d6'], ['install', '#c0caf5'], ['-D', '#e0af68'], ['ui-tests', '#9ece6a'], ['$', '#a9b1d6']])
  expect(runs).toEqual(expect.arrayContaining([['Created', '#c0caf5'], ['ui-tests.config.ts', '#9ece6a']]))
  const agent = colourRuns(await readFile('apps/web/generated/terminal-agentCommand.html', 'utf8'))
  expect(agent).toEqual([['$', '#a9b1d6'], ['npx', '#a9b1d6'], ['ui-tests run', '#c0caf5'], ['--actor', '#e0af68'], ['agent', '#9ece6a']])
  const run = colourRuns(await readFile('apps/web/generated/terminal-run.html', 'utf8'))
  expect(run).toEqual(expect.arrayContaining([['https://ui-tests.com/t/k2m9', '#7aa2f7']]))
}, 15000)

// Three cold Node/tsx subprocesses exceed the default five seconds on CI.
// Bound each child as well as the whole integration test, without blocking Vitest.
it('regenerates every committed HTML frame from Ink and keeps CLI/report/README parity at 80 columns', async () => {
  const names = ['report', 'agent', 'commands', 'install', 'initCommand', 'devCommand', 'runCommand', 'reportCommand', 'agentCommand', 'init', 'dev', 'run']
  const before = await Promise.all(names.map(name => readFile(`apps/web/generated/terminal-${name}.html`, 'utf8')))
  await exec(process.execPath, ['--import', 'tsx', 'apps/web/scripts/render-terminal.mjs', '--check'], { env: { ...process.env, FORCE_COLOR: '3' }, timeout: 10000 })
  const after = await Promise.all(names.map(name => readFile(`apps/web/generated/terminal-${name}.html`, 'utf8')))
  expect(after).toEqual(before)
  const { stdout: cli } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'report', 'apps/web/generated/example-report.json'], { env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }, encoding: 'utf8', timeout: 10000 })
  const html = await readFile('apps/web/generated/terminal-report.html', 'utf8')
  const dom = parseHTML(`<html><body><pre>${html}</pre></body></html>`)
  expect(dom.document.querySelector('pre')!.textContent?.trimEnd()).toBe(stripVTControlCharacters(cli).trimEnd())
  const lines = stripVTControlCharacters(cli).trimEnd().split('\n')
  expect(lines).toHaveLength(6)
  expect(lines.every(line => line.length <= 80)).toBe(true)
  expect(lines[2]).toContain('found only link options')
  expect(lines.slice(2).map(line => line.indexOf('of 5'))).toEqual([lines[2].indexOf('of 5'), lines[2].indexOf('of 5'), lines[2].indexOf('of 5'), lines[2].indexOf('of 5')])
  // Rank and count first, padded and right-aligned; the problem text last, starting in one column.
  expect(lines.slice(2).map(line => line.slice(0, 10))).toEqual(['▏1  4 of 5', ' 2  2 of 5', ' 3  2 of 5', ' 4  1 of 5'])
  expect(new Set(lines.slice(2).map(line => line.search(/[A-Z]/)))).toEqual(new Set([12]))
  // The page carries the CLI's colours, not only its text: the coloured runs of the CLI's ANSI frame equal the committed fragment's.
  const { ansiToHtml } = await import('../apps/web/scripts/render-terminal.mjs')
  const { stdout: coloured } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'report', 'apps/web/generated/example-report.json'], { env: { ...process.env, FORCE_COLOR: '3', NO_COLOR: '' }, encoding: 'utf8', timeout: 10000 })
  expect(coloured).toMatch(/\x1b\[38;2;/)
  expect(colourRuns(ansiToHtml(coloured.trimEnd()))).toEqual(colourRuns(html))
  expect(colourRuns(html)).toEqual(expect.arrayContaining([['4 of 5', '#ff9e64'], ['1', '#a9b1d6'], ['Problems found: 4 across 5 people.', '#c0caf5']]))
  const { stdout: json } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'report', 'apps/web/generated/example-report.json', '--json'], { encoding: 'utf8', timeout: 10000 })
  expect(JSON.parse(json).people).toBe(5)
}, 30000)

it.each([
  null, 42, 'report', [],
  { people: 5, problems: [null] },
  { people: 5, problems: [42] },
  { people: 5, problems: [[]] },
  { people: 0, problems: [] },
  { people: 5, problems: [{ title: 'Problem', people: 6 }] },
])('rejects malformed report input with the CLI error: %j', async report => {
  const directory = await mkdtemp(join(tmpdir(), 'ui-tests-report-'))
  try {
    const file = join(directory, 'report.json')
    await writeFile(file, JSON.stringify(report))
    await expect(exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'report', file, '--json'], { timeout: 10000 }))
      .rejects.toMatchObject({ code: 1, stdout: '', stderr: 'Invalid report\n' })
  } finally { await rm(directory, { recursive: true, force: true }) }
}, 15000)
