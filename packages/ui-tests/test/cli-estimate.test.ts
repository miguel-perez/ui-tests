import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../src/cli/main.ts'

const fixtures = join(import.meta.dirname, 'fixtures/cli-lint')
async function estimate(name: string, ...args: string[]) {
  let out = ''
  let err = ''
  const code = await main(['estimate', ...args], { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: join(fixtures, name), env: {} })
  return { code, out, err }
}

describe('ui-tests estimate', () => {
  it('prints n and minutes as JSON', async () => {
    const { code, out } = await estimate('example', '--json')
    expect(code).toBe(0)
    expect(JSON.parse(out)).toEqual({ n: 5, minutes: 3, groups: [{ name: 'everyone', quota: 5 }] })
  })
  it('writes the JSON to a file with --out', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ui-tests-estimate-out-'))
    try {
      expect((await estimate('example', '--out', join(dir, 'estimate.json'))).out).toContain('5 people')
      expect(JSON.parse(await readFile(join(dir, 'estimate.json'), 'utf8'))).toEqual({ n: 5, minutes: 3, groups: [{ name: 'everyone', quota: 5 }] })
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
  it('exits 2 when --out is missing, empty or only whitespace', async () => {
    for (const args of [['--out'], ['--out', ''], ['--out', '   ']]) {
      const { code, err } = await estimate('example', ...args)
      expect(code).toBe(2)
      expect(err).toContain('--out needs a file name')
    }
  })
  it('says it in words without --json', async () => {
    const { out } = await estimate('example')
    expect(out).toContain('5 people, up to 3 minutes each.')
  })
  it('names each group and its quota, since each is sampled on its own', async () => {
    let out = ''
    await main(['estimate'], { stdout: { write: t => (out += t) }, stderr: { write: () => true }, cwd: join(import.meta.dirname, 'fixtures/examples/accounting'), env: {} })
    expect(out).toContain('5 people, up to 3 minutes each. Business owner: 3, Bookkeeper: 2.')
  })
  it('exits 2 for an unknown study and when there are no studies', async () => {
    expect((await estimate('example', '--study', 'nope')).code).toBe(2)
    expect((await estimate('example', '--study', 'invite flow', '--actor', 'agent')).err).toContain('No study admits the agent actor')
    expect((await estimate('empty')).err).toContain('no study files found')
  })
})
