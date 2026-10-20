import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { main, type CliDeps, type Io } from '../src/cli/main.ts'
import { idempotencyKey } from '../src/runner/key.ts'
import { refreshRun } from '../src/runner/progress.ts'
import { openStore } from '../src/store/open.ts'
import type { HookResult, RunRow, RunStore } from '../src/store/types.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
let target: Server
let targetUrl: string
let work: string
let data: string
let seen: IncomingHttpHeaders[] = []
const cleanup: (() => Promise<unknown> | unknown)[] = []
const hour = 3_600_000

beforeAll(async () => {
  target = createServer((req, res) => { seen.push(req.headers); res.end('ok') })
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  work = await mkdtemp(join(fixtures, '.tmp-recruit-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-recruit-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' } }\n`)
})
afterAll(async () => {
  target.closeAllConnections()
  await new Promise(resolve => target.close(resolve))
  await rm(work, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

function session(env: Record<string, string> = {}, deps: CliDeps = {}, cwd = work) {
  let out = ''
  let err = ''
  const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd, env: { UI_TESTS_DATA_DIR: data, ...env }, deps: { pollMs: 1, ...deps } }
  return { io, out: () => out, err: () => err }
}
async function recruit(argv: string[], env: Record<string, string> = {}, deps: CliDeps = {}) {
  const s = session(env, deps)
  const code = await main(['recruit', ...argv], s.io)
  return { code, out: s.out(), err: s.err(), json: () => JSON.parse(s.out()) }
}
async function store(): Promise<RunStore> {
  const s = await openStore({ UI_TESTS_DATA_DIR: data })
  cleanup.push(() => s.close())
  return s
}
/** A finished, verified attempt of a run; `began` false models someone the screener turned away. */
async function finish(s: RunStore, run: RunRow, status: HookResult['status'] | 'disconnected', patch: { rehearsal?: boolean; began?: boolean } = {}) {
  const { attempt } = await s.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: patch.rehearsal ?? false })
  await s.updateAttempt(attempt.id, {
    status: 'finished', reason: status === 'disconnected' ? 'disconnected' : 'done', ...(patch.began !== false && { startedAt: new Date().toISOString() }),
    ...(status !== 'disconnected' && { verification: { status, steps: [] } }),
  })
}
const runNamed = async (key: string) => (await (await store()).listRuns()).find(r => r.key === key)!

describe('idempotencyKey', () => {
  it('joins commit, context and actor, and uses the pull request in place of the commit', () => {
    expect(idempotencyKey({ commit: 'abc', contextId: 'c_1', actor: 'human' })).toBe('abc:c_1:human')
    expect(idempotencyKey({ commit: 'abc', pr: 12, contextId: 'c_1', actor: 'agent' })).toBe('pr-12:c_1:agent')
  })
})

describe('ui-tests recruit', () => {
  it('prints the run handle as JSON, with a deadline 48 hours out and n invite links', async () => {
    const before = Date.now()
    const { code, json } = await recruit(['--json'])
    expect(code).toBe(0)
    const handle = json()
    expect(handle).toMatchObject({
      run: expect.stringMatching(/^r_/), key: expect.stringMatching(/^[^:]+:[^:]+:human$/),
      context: { users: { are: 'People who read docs' }, id: expect.any(String) }, build: { url: targetUrl, commit: expect.any(String) },
      actor: 'human', states: { recruitment: 'open', collection: 'waiting', verification: 'pending', payment: 'none' }, result: 'pending', revision: 1,
    })
    expect(Date.parse(handle.deadline) - before).toBeGreaterThan(48 * hour - 5000)
    expect(Date.parse(handle.deadline) - before).toBeLessThan(48 * hour + 5000)
    expect(Object.keys(handle).sort()).toEqual(['actor', 'build', 'context', 'deadline', 'invites', 'key', 'result', 'revision', 'run', 'states'])
    expect(handle.invites).toHaveLength(5)
    expect(new Set(handle.invites).size).toBe(5)
    for (const link of handle.invites) expect(link).toMatch(new RegExp(`^${targetUrl}/ui-tests/${handle.run}/\\?t=\\S+$`))
    const s = await store()
    const attempts = await s.listAttempts(handle.run)
    expect(attempts).toHaveLength(5)
    expect(attempts.every(a => !a.rehearsal && a.setupValues.start === '/')).toBe(true)
    expect((await s.getRun(handle.run))?.reachability).toMatchObject({ url: targetUrl, reachable: true })
  })

  it('returns the same run for the same commit and creates no attempts or invites the second time', async () => {
    const first = await recruit(['--json'])
    const s = await store()
    const attempts = (await s.listAttempts(first.json().run)).length
    const second = await recruit(['--json'])
    expect(second.code).toBe(0)
    expect(second.json().run).toBe(first.json().run)
    expect(second.json().invites).toBeUndefined()
    expect(await s.listAttempts(first.json().run)).toHaveLength(attempts)
    expect(second.err).toContain('already exists')
  })

  it('--key overrides the key and makes its own run', async () => {
    const a = await recruit(['--json', '--key', 'my-key'])
    expect(a.json().key).toBe('my-key')
    const b = await recruit(['--json', '--key=my-key'])
    expect(b.json().run).toBe(a.json().run)
    expect((await recruit(['--json'])).json().run).not.toBe(a.json().run)
  })

  it('--deadline sets the hours', async () => {
    const before = Date.now()
    const { json } = await recruit(['--json', '--key', 'deadline-key', '--deadline', '2'])
    expect(Date.parse(json().deadline) - before).toBeLessThan(2 * hour + 5000)
  })

  it('--actor both exits 2 and creates nothing', async () => {
    const s = await store()
    const runs = (await s.listRuns()).length
    const result = await recruit(['--actor', 'both'])
    expect(result.code).toBe(2)
    expect(result.err).toContain('--actor both')
    expect(await s.listRuns()).toHaveLength(runs)
  })

  it('picks only a study that admits the actor', async () => {
    const result = await recruit(['--json', '--actor', 'agent', '--key', 'agent-key'])
    expect(result.code).toBe(0)
    expect(result.json()).toMatchObject({ actor: 'agent', context: { users: { are: 'Agents' } } })
  })

  it('exits 2 with "target not reachable" before any run exists', async () => {
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`
    await new Promise(resolve => closed.close(resolve))
    const dir = await mkdtemp(join(fixtures, '.tmp-recruit-down-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(dir, 'dev.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { target: { url: '${url}' } }\n`)
    const empty = await mkdtemp(join(tmpdir(), 'ui-tests-recruit-empty-'))
    cleanup.push(() => rm(empty, { recursive: true, force: true }))
    const s = session({ UI_TESTS_DATA_DIR: empty }, {}, dir)
    expect(await main(['recruit'], s.io)).toBe(2)
    expect(s.err()).toContain(`target not reachable: ${url}`)
    expect(await (await openStore({ UI_TESTS_DATA_DIR: empty })).listRuns()).toEqual([])
  })

  it('puts both bypass parameters on every link and the header on setup when the secret is set', async () => {
    seen = []
    const secret = 'bypass-secret-value'
    const result = await recruit(['--json', '--key', 'bypass-key'], { VERCEL_AUTOMATION_BYPASS_SECRET: secret })
    const links: string[] = result.json().invites
    expect(links).toHaveLength(5)
    for (const link of links) {
      const url = new URL(link)
      expect(url.searchParams.get('x-vercel-protection-bypass')).toBe(secret)
      expect(url.searchParams.get('x-vercel-set-bypass-cookie')).toBe('samesitenone')
      expect(url.searchParams.get('t')).toBeTruthy()
    }
    expect(seen.filter(h => h['x-vercel-protection-bypass'] === secret).length).toBeGreaterThanOrEqual(5)
    expect(result.err).not.toContain(secret)
  })

  it('without the secret no link carries a bypass parameter, no request a header, and nothing logs it', async () => {
    seen = []
    const result = await recruit(['--key', 'plain-key'])
    expect(result.out).not.toContain('bypass')
    expect(result.err).not.toContain('bypass')
    expect(result.out.match(/\/ui-tests\/r_\S+\?t=\S+/g)).toHaveLength(5)
    expect(seen.some(h => 'x-vercel-protection-bypass' in h)).toBe(false)
  })

  it('prints the key, the invite links and the status command for a person', async () => {
    const { out, code } = await recruit(['--key', 'human-key'])
    expect(code).toBe(0)
    expect(out).toMatch(/Run r_/)
    expect(out).toContain('key: human-key')
    expect(out).toMatch(/ui-tests status r_/)
  })
})

describe('refreshRun', () => {
  async function fresh(key: string, deadlineHours = 48) {
    const result = await recruit(['--json', '--key', key, '--deadline', String(deadlineHours)])
    return { s: await store(), run: result.json().run as string }
  }
  const at = (run: RunRow, plusHours: number) => new Date(Date.parse(run.deadline) + plusHours * hour)

  it('stays pending before n counted attempts and before the deadline', async () => {
    const { s, run } = await fresh('refresh-pending')
    for (let i = 0; i < 4; i++) await finish(s, (await s.getRun(run))!, 'correct')
    const refreshed = await refreshRun(s, run, new Date())
    expect(refreshed.result).toBe('pending')
    expect(refreshed.states).toMatchObject({ collection: 'collecting', verification: 'complete', recruitment: 'open' })
  })

  it('is none-found when n attempts are correct, and fills recruitment', async () => {
    const { s, run } = await fresh('refresh-none')
    for (let i = 0; i < 5; i++) await finish(s, (await s.getRun(run))!, 'correct')
    const refreshed = await refreshRun(s, run, new Date())
    expect(refreshed).toMatchObject({ result: 'none-found', states: { collection: 'complete', recruitment: 'filled' } })
  })

  it('is problems-found once n are counted with one incorrect', async () => {
    const { s, run } = await fresh('refresh-problems')
    for (const v of ['correct', 'correct', 'incorrect', 'correct', 'correct'] as const) await finish(s, (await s.getRun(run))!, v)
    expect((await refreshRun(s, run, new Date())).result).toBe('problems-found')
  })

  it('is inconclusive after the deadline with fewer than n, and problems-found if one was seen', async () => {
    const { s, run } = await fresh('refresh-late')
    const made = (await s.getRun(run))!
    for (let i = 0; i < 3; i++) await finish(s, made, 'correct')
    expect((await refreshRun(s, run, at(made, 1))).result).toBe('inconclusive')
    await finish(s, made, 'incorrect')
    expect((await refreshRun(s, run, at(made, 1))).result).toBe('problems-found')
  })

  it('does not count rehearsals, disconnected attempts or people the screener turned away', async () => {
    const { s, run } = await fresh('refresh-uncounted')
    const made = (await s.getRun(run))!
    await finish(s, made, 'correct', { rehearsal: true })
    await finish(s, made, 'disconnected')
    await finish(s, made, 'correct', { began: false })
    for (let i = 0; i < 4; i++) await finish(s, made, 'correct')
    expect((await refreshRun(s, run, new Date())).result).toBe('pending')
    expect((await refreshRun(s, run, at(made, 1))).result).toBe('inconclusive')
  })
})

describe('recruit --wait and status', () => {
  /** Makes a run with the clock at `now`, finishes attempts as given, and waits with the same clock. */
  async function waiting(key: string, verdicts: ('correct' | 'incorrect' | 'unknown')[], clockHours = 0) {
    const first = await recruit(['--json', '--key', key])
    const run = first.json().run as string
    const s = await store()
    for (const v of verdicts) await finish(s, (await s.getRun(run))!, v)
    const deadline = Date.parse(first.json().deadline)
    return recruit(['--json', '--wait', '--key', key], {}, { now: () => new Date(deadline + clockHours * hour) })
  }

  it('exits 0 when none was found', async () => {
    const result = await waiting('wait-none', ['correct', 'correct', 'correct', 'correct', 'correct'], -1)
    expect(result.code).toBe(0)
    expect(result.json()).toMatchObject({ result: 'none-found' })
  })

  it('exits 1 when problems were found', async () => {
    const result = await waiting('wait-problems', ['correct', 'incorrect', 'correct', 'correct', 'correct'], -1)
    expect(result.code).toBe(1)
    expect(result.json().result).toBe('problems-found')
  })

  it('exits 3 when inconclusive at the deadline', async () => {
    const result = await waiting('wait-inconclusive', ['correct', 'correct'], 1)
    expect(result.code).toBe(3)
    expect(result.json().result).toBe('inconclusive')
  })

  it('polls on the injected interval until a result arrives, then exits', async () => {
    const first = await recruit(['--json', '--key', 'wait-polls'])
    const run = first.json().run as string
    const s = await store()
    let polls = 0
    const waited = recruit(['--json', '--wait', '--key', 'wait-polls'], {}, {
      pollMs: 5,
      now: () => { if (++polls === 3) void (async () => { for (let i = 0; i < 5; i++) await finish(s, (await s.getRun(run))!, 'correct') })(); return new Date() },
    })
    expect((await waited).code).toBe(0)
    expect(polls).toBeGreaterThanOrEqual(3)
  })

  it('exits 2 when the store throws', async () => {
    const first = await recruit(['--json', '--key', 'wait-throws'])
    const run = first.json().run as string
    const s = await store()
    await finish(s, (await s.getRun(run))!, 'correct')
    const result = await recruit(['--json', '--wait', '--key', 'wait-throws'], {}, { now: () => { throw new Error('store is down') } })
    expect(result.code).toBe(2)
    expect(result.err).toContain('store is down')
  })

  it('status refreshes the run at the deadline and prints the handle', async () => {
    const first = await recruit(['--json', '--key', 'status-late'])
    const run = first.json().run as string
    const late = new Date(Date.parse(first.json().deadline) + hour)
    const text = session({}, { now: () => late })
    expect(await main(['status', run], text.io)).toBe(0)
    expect(text.out()).toContain('result: inconclusive')
    const asJson = session({}, { now: () => late })
    expect(await main(['status', run, '--json'], asJson.io)).toBe(0)
    expect(JSON.parse(asJson.out())).toMatchObject({ run, key: 'status-late', result: 'inconclusive' })
    expect(JSON.parse(asJson.out()).hooksBundle).toBeUndefined()
    expect((await runNamed('status-late')).result).toBe('inconclusive')
  })
})
