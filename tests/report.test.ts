import { it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify, stripVTControlCharacters } from 'node:util'
import { parseHTML } from 'linkedom'

const exec = promisify(execFile)

// Three cold Node/tsx subprocesses exceed the default five seconds on CI.
// Bound each child as well as the whole integration test, without blocking Vitest.
it('regenerates every committed HTML frame from Ink and keeps CLI/report/README parity at 80 columns', async () => {
  const names = ['report', 'commands', 'install', 'initCommand', 'devCommand', 'runCommand', 'reportCommand', 'init', 'dev', 'run']
  const before = await Promise.all(names.map(name => readFile(`apps/web/generated/terminal-${name}.html`, 'utf8')))
  await exec(process.execPath, ['--import', 'tsx', 'apps/web/scripts/render-terminal.mjs', '--check'], { env: { ...process.env, FORCE_COLOR: '1' }, timeout: 10000 })
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
  const { stdout: json } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'report', 'apps/web/generated/example-report.json', '--json'], { encoding: 'utf8', timeout: 10000 })
  expect(JSON.parse(json).people).toBe(5)
}, 30000)
