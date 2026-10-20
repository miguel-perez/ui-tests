import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import { main } from '../src/cli/main.ts'

const fixtures = join(import.meta.dirname, 'fixtures/cli-lint')
async function lintIn(name: string, ...args: string[]) {
  let out = ''
  let err = ''
  const code = await main(['lint', ...args], { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: join(fixtures, name), env: {} })
  return { code, out, err }
}

describe('ui-tests lint', () => {
  it('writes the JSON result to a file with --out, beside the words on stdout; a study that cannot load writes its error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-tests-lint-out-'))
    try {
      const file = join(dir, 'nested', 'lint.json')
      const { code, out } = await lintIn('example', '--out', file)
      expect(code).toBe(0)
      expect(out).toContain('Study: invite flow')
      const written = JSON.parse(await readFile(file, 'utf8'))
      expect(written).toEqual(JSON.parse((await lintIn('example', '--json')).out))
      expect(written.studies[0].plan[0]).toBe('Study: invite flow')
      const broken = join(dir, 'broken.json')
      expect((await lintIn('throws', `--out=${broken}`)).code).toBe(2)
      expect(JSON.parse(await readFile(broken, 'utf8')).error.message).toContain('boom at the top level')
      expect((await lintIn('example', '--out')).code).toBe(2)
      for (const blank of ['', '   ']) {
        const blanked = await lintIn('example', '--out', blank)
        expect(blanked.code).toBe(2)
        expect(blanked.err).toContain('--out needs a file name')
      }
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  it('passes the example and prints the plan lines, including the video recording line', async () => {
    expect(await readFile(join(fixtures, 'example/ui-tests/invite.ui.test.ts'), 'utf8')).toBe(exampleFile)
    const { code, out } = await lintIn('example')
    expect(out).toContain('Study: invite flow')
    expect(out).toContain('Sample: 5 people.')
    expect(out).toContain('Task 1: invite a colleague (up to 3 min)')
    expect(out).toContain("Recording: event replay (what people do on the page) and screen video (record: 'video'")
    expect(code).toBe(0)
  })
  it('flags interface terms with file:line, rule, why: and source:, and exits 1', async () => {
    const { code, out } = await lintIn('interface')
    expect(code).toBe(1)
    expect(out).toMatch(/a\.ui\.test\.ts:\d+\n/)
    expect(out).toContain('interface-terms')
    expect(out).toContain('  why: ')
    expect(out).toContain('  source: NN/g task writing')
  })
  it('prints file:line for a study file that throws and exits 2', async () => {
    const { code, out, err } = await lintIn('throws')
    expect(code).toBe(2)
    expect(err).toContain('a.ui.test.ts:4: boom at the top level')
    expect(out).toBe('')
  })
  it('prints file:line for a study file that does not parse and exits 2', async () => {
    const { code, err } = await lintIn('.', 'syntax/a.ui.test.ts')
    expect(code).toBe(2)
    expect(err).toMatch(/a\.ui\.test\.ts:4: /)
  })
  it('prints file:line for a study that fails to compile and exits 2', async () => {
    const { code, err } = await lintIn('.', 'compile/a.ui.test.ts')
    expect(code).toBe(2)
    expect(err).toMatch(/compile\/a\.ui\.test\.ts:3: study "empty study" has no tasks/)
  })
  it('exits 2 when there are no study files', async () => {
    const { code, err } = await lintIn('empty')
    expect(code).toBe(2)
    expect(err).toContain('no study files found')
  })
  it('defaults product to the target hostname before lint runs', async () => {
    const { code, out } = await lintIn('product')
    expect(out).toContain('names example.test')
    expect(code).toBe(1)
  })
  it('--json writes JSON to stdout only', async () => {
    const { code, out, err } = await lintIn('interface', '--json')
    expect(code).toBe(1)
    expect(err).toBe('')
    const parsed = JSON.parse(out)
    expect(parsed.studies[0].findings[0]).toMatchObject({ rule: 'interface-terms', file: 'a.ui.test.ts' })
    expect(parsed.studies[0].plan[0]).toBe('Study: docs')
    const failed = await lintIn('throws', '--json')
    expect(failed.code).toBe(2)
    expect(JSON.parse(failed.out).error).toMatchObject({ file: 'a.ui.test.ts', line: 4 })
  })
})

describe('the real binary', () => {
  const bin = join(import.meta.dirname, '../bin/ui-tests.mjs')
  const exec = (cwd: string, ...args: string[]) => new Promise<{ code: number; out: string; err: string }>(resolve =>
    promisify(execFile)('node', [bin, ...args], { cwd }).then(r => resolve({ code: 0, out: r.stdout, err: r.stderr }), e => resolve({ code: e.code, out: e.stdout, err: e.stderr })))

  it('resolves the ui-tests import outside Vitest and lints the example', async () => {
    const { code, out, err } = await exec(join(fixtures, 'example'), 'lint')
    expect(err).toBe('')
    expect(out).toContain('Study: invite flow')
    expect(code).toBe(0)
  })
  it('keeps stderr free of the SQLite ExperimentalWarning while the store loads', async () => {
    const { err } = await exec(join(fixtures, 'example'), 'lint')
    expect(err).not.toContain('ExperimentalWarning')
  })
  it('filters only the SQLite ExperimentalWarning, as Node 22 emits it', async () => {
    const { isSqliteWarning, quietSqliteWarning } = await import('../bin/quiet-sqlite.mjs')
    const seen: unknown[] = []
    const fake = { emitWarning: (w: unknown, _type?: unknown) => void seen.push(w) }
    quietSqliteWarning(fake as never)
    fake.emitWarning('SQLite is an experimental feature and might change at any time', 'ExperimentalWarning' as never)
    fake.emitWarning('Other thing is experimental', 'ExperimentalWarning' as never)
    fake.emitWarning('SQLite deprecated', 'DeprecationWarning' as never)
    expect(seen).toEqual(['Other thing is experimental', 'SQLite deprecated'])
    expect(isSqliteWarning('SQLite is an experimental feature', { type: 'ExperimentalWarning' })).toBe(true)
  })
  it('exits 2 with file:line for a throwing study', async () => {
    const { code, err } = await exec(join(fixtures, 'throws'), 'lint')
    expect(code).toBe(2)
    expect(err).toContain('a.ui.test.ts:4: boom at the top level')
  })
  it('exits 2 with usage for an unknown command', async () => {
    const { code, err } = await exec(join(fixtures, 'example'), 'nope')
    expect(code).toBe(2)
    expect(err).toContain('Usage: ui-tests')
  })
}, 60_000)
