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
    expect(JSON.parse(out)).toEqual({ n: 5, minutes: 3 })
  })
  it('says it in words without --json', async () => {
    const { out } = await estimate('example')
    expect(out).toContain('5 people, up to 3 minutes each.')
  })
  it('exits 2 for an unknown study and when there are no studies', async () => {
    expect((await estimate('example', '--study', 'nope')).code).toBe(2)
    expect((await estimate('example', '--study', 'invite flow', '--actor', 'agent')).err).toContain('No study admits the agent actor')
    expect((await estimate('empty')).err).toContain('no study files found')
  })
})
