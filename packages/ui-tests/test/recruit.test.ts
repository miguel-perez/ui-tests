import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { SqliteStore } from '../src/store/sqlite.ts'
import { main, type CliDeps, type Io } from '../src/cli/main.ts'
import { idempotencyKey } from '../src/runner/key.ts'
import { refreshRun } from '../src/runner/progress.ts'
import { openStore } from '../src/store/open.ts'
import type { HookResult, RunRow, RunStore } from '../src/store/types.ts'
import { stubServer } from './server-stub.ts'
import { draftSnapshots } from './snapshots.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
let target: Server
let targetUrl: string
/** The ui-tests server the links are on: a stub that answers its health check. */
let server: Awaited<ReturnType<typeof stubServer>>
let serverUrl: string
let work: string
let data: string
let seen: IncomingHttpHeaders[] = []
/** When set, the target answers `boom` after this many more requests, which the flaky fixture's setup turns into a throw. */
let boomAfter: number | undefined
const cleanup: (() => Promise<unknown> | unknown)[] = []
const hour = 3_600_000

beforeAll(async () => {
  target = createServer((req, res) => {
    seen.push(req.headers)
    const boom = boomAfter !== undefined && boomAfter-- <= 0
    res.end(boom ? 'boom' : 'ok')
  })
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  server = await stubServer()
  serverUrl = server.url
  work = await mkdtemp(join(fixtures, '.tmp-recruit-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-recruit-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${serverUrl}' }, target: { url: '${targetUrl}' } }\n`)
  await draftSnapshots(work)
})
afterAll(async () => {
  await server.close()
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
    // The links open the player on the ui-tests server; the run sends people on to the target.
    for (const link of handle.invites) expect(link).toMatch(new RegExp(`^${serverUrl}/ui-tests/${handle.run}/\\?t=[0-9a-f]{64}$`))
    const s = await store()
    const attempts = await s.listAttempts(handle.run)
    expect(attempts).toHaveLength(5)
    expect(attempts.every(a => !a.rehearsal && a.setupValues.start === '/')).toBe(true)
    expect(await s.getRun(handle.run)).toMatchObject({ reachability: { url: targetUrl, reachable: true }, target: targetUrl, appUrl: targetUrl })
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
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { server: { url: '${serverUrl}' }, target: { url: '${url}' } }\n`)
    await draftSnapshots(dir)
    const empty = await mkdtemp(join(tmpdir(), 'ui-tests-recruit-empty-'))
    cleanup.push(() => rm(empty, { recursive: true, force: true }))
    const s = session({ UI_TESTS_DATA_DIR: empty }, {}, dir)
    expect(await main(['recruit'], s.io)).toBe(2)
    expect(s.err()).toContain(`target not reachable: ${url}`)
    expect(await (await openStore({ UI_TESTS_DATA_DIR: empty })).listRuns()).toEqual([])
  })

  it('exits 2 with "ui-tests server not reachable" before any run exists', async () => {
    const down = await stubServer()
    await down.close()
    const dir = await mkdtemp(join(fixtures, '.tmp-recruit-no-server-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(dir, 'dev.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { server: { url: '${down.url}' }, target: { url: '${targetUrl}' } }\n`)
    await draftSnapshots(dir)
    const empty = await mkdtemp(join(tmpdir(), 'ui-tests-recruit-empty-'))
    cleanup.push(() => rm(empty, { recursive: true, force: true }))
    const s = session({ UI_TESTS_DATA_DIR: empty }, {}, dir)
    expect(await main(['recruit', '--json'], s.io)).toBe(2)
    expect(s.err()).toBe(`ui-tests server not reachable: ${down.url}\n`)
    const runs = await openStore({ UI_TESTS_DATA_DIR: empty })
    cleanup.push(() => runs.close())
    expect(await runs.listRuns()).toEqual([])
  })

  it('puts the bypass on every link for the player to pass on, and the header on setup, when the secret is set', async () => {
    seen = []
    const secret = 's'
    const result = await recruit(['--json', '--key', 'bypass-key'], { VERCEL_AUTOMATION_BYPASS_SECRET: secret })
    const links: string[] = result.json().invites
    expect(links).toHaveLength(5)
    for (const link of links) {
      expect(link).toMatch(new RegExp(`^${serverUrl}/ui-tests/${result.json().run}/\\?t=[0-9a-f]{64}&bypass=s$`))
      expect(link).not.toContain('x-vercel')
    }
    expect(seen.filter(h => h['x-vercel-protection-bypass'] === secret).length).toBeGreaterThanOrEqual(5)
    // Diagnostics never carry the secret: they name no bypass at all.
    expect(result.err).not.toContain('bypass')
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

  it('exits 2 when the store throws while polling', async () => {
    const first = await recruit(['--json', '--key', 'wait-throws'])
    const run = first.json().run as string
    const s = await store()
    await finish(s, (await s.getRun(run))!, 'correct')
    let calls = 0
    const spy = vi.spyOn(SqliteStore.prototype, 'listAttempts').mockImplementation(async function (this: SqliteStore, ...args) {
      if (++calls > 1) throw new Error('store is down')
      return Object.getPrototypeOf(SqliteStore.prototype).listAttempts?.call(this, ...args) ?? []
    })
    cleanup.push(() => spy.mockRestore())
    const result = await recruit(['--json', '--wait', '--key', 'wait-throws'])
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

describe('recruit plan, repair and state', () => {
  it('prints the plan and the unpaid line before the links, and keeps stdout JSON-only with --json', async () => {
    const text = await recruit(['--key', 'plan-text'])
    expect(text.out).toContain('Study: dev fixture')
    expect(text.out).toContain('You can stop at any time. This is unpaid.')
    expect(text.out.indexOf('Study:')).toBeLessThan(text.out.indexOf('Invite links:'))
    const json = await recruit(['--json', '--key', 'plan-json'])
    expect(json.err).toContain('Study: dev fixture')
    expect(json.err).toContain('This is unpaid.')
    expect(() => json.json()).not.toThrow()
  })

  it('prints the paid line when participants.link.amount is set', async () => {
    const dir = await mkdtemp(join(fixtures, '.tmp-recruit-paid-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(dir, 'dev.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { server: { url: '${serverUrl}' }, target: { url: '${targetUrl}' }, participants: { sources: ['link'], link: { amount: 750 } } }\n`)
    await draftSnapshots(dir)
    const s = session({}, {}, dir)
    expect(await main(['recruit', '--key', 'paid-key'], s.io)).toBe(0)
    expect(s.out()).toContain('You can stop at any time and still be paid $7.50.')
  })

  it('tops up missing invite slots when the same key is run again after setup failed part-way', async () => {
    const dir = await mkdtemp(join(fixtures, '.tmp-recruit-flaky-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await writeFile(join(dir, 'flaky.ui.test.ts'), `import { outcome, setup, study, task } from 'ui-tests'
study('flaky', { users: 'People who read docs', purpose: 'find the docs' }, () => {
  setup(async ({ request }) => {
    if ((await (await request.get('/')).text()) === 'boom') throw new Error('setup broke')
    return { start: '/' }
  })
  task('Go', { path: ['/'] }, () => { outcome(async () => {}) })
})
`)
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { server: { url: '${serverUrl}' }, target: { url: '${targetUrl}' } }\n`)
    await draftSnapshots(dir)
    const first = session({}, {}, dir)
    boomAfter = 3
    const code = await main(['recruit', '--json', '--key', 'flaky-key'], first.io)
    expect(first.err()).toContain('setup broke')
    expect(code).toBe(2)
    boomAfter = undefined
    const s = await store()
    const run = await runNamed('flaky-key')
    expect((await s.listAttempts(run.run)).length).toBe(2)
    const again = session({}, {}, dir)
    expect(await main(['recruit', '--json', '--key', 'flaky-key'], again.io)).toBe(0)
    expect(JSON.parse(again.out()).invites).toHaveLength(3)
    expect(await s.listAttempts(run.run)).toHaveLength(5)
    const third = session({}, {}, dir)
    expect(await main(['recruit', '--json', '--key', 'flaky-key'], third.io)).toBe(0)
    expect(JSON.parse(third.out()).invites).toBeUndefined()
    expect(await s.listAttempts(run.run)).toHaveLength(5)
  })

  it('status right after recruit still says waiting; the deadline stops recruitment', async () => {
    const first = await recruit(['--json', '--key', 'state-waiting'])
    const run = first.json().run as string
    const now = session()
    expect(await main(['status', run, '--json'], now.io)).toBe(0)
    expect(JSON.parse(now.out()).states).toMatchObject({ collection: 'waiting', recruitment: 'open' })
    const late = session({}, { now: () => new Date(Date.parse(first.json().deadline) + hour) })
    await main(['status', run, '--json'], late.io)
    expect(JSON.parse(late.out()).states).toMatchObject({ recruitment: 'stopped' })
  })

  it('exits 2 and lists the studies when several admit the actor and none is named', async () => {
    const dir = await mkdtemp(join(fixtures, '.tmp-recruit-many-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await writeFile(join(dir, 'two.ui.test.ts'), `import { outcome, study, task } from 'ui-tests'
study('one', { users: 'People who read docs' }, () => { task('Go', () => { outcome(async () => {}) }) })
study('two', { users: 'People who write docs' }, () => { task('Go', () => { outcome(async () => {}) }) })
`)
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { server: { url: '${serverUrl}' }, target: { url: '${targetUrl}' } }\n`)
    await draftSnapshots(dir)
    const s = session({}, {}, dir)
    expect(await main(['recruit'], s.io)).toBe(2)
    expect(s.err()).toMatch(/--study[\s\S]*one[\s\S]*two/)
    const named = session({}, {}, dir)
    const code = await main(['recruit', '--study', 'two', '--key', 'many-key'], named.io)
    expect(named.err()).toBe('')
    expect(code).toBe(0)
  })

  it('reads back an existing run without checking the target', async () => {
    const first = await recruit(['--json', '--key', 'existing-key'])
    const second = await recruit(['--json', '--key', 'existing-key'], {}, { fetch: (async () => { throw new Error('down') }) as typeof fetch })
    expect(second.code).toBe(0)
    expect(second.json().run).toBe(first.json().run)
  })
})

describe('recruit and the screener snapshot', () => {
  it('refuses, naming the snapshot, until it is current; then makes the run, with no picture of the page', async () => {
    const dir = await mkdtemp(join(fixtures, '.tmp-recruit-look-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await writeFile(join(dir, 'look.ui.test.ts'), `import { study, task } from 'ui-tests'\nstudy('look', { users: { did: 'read documentation', within: '3 months' }, purpose: 'find the docs', firstLook: { page: '/landing' } }, () => { task('Read', { path: ['/', '/docs'], minutes: 2 }, () => {}) })\n`)
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { server: { url: '${serverUrl}' }, target: { url: '${targetUrl}' } }\n`)
    const missing = session({}, {}, dir)
    expect(await main(['recruit', '--json'], missing.io)).toBe(1)
    expect(missing.err()).toContain('look.ui.test.ts.screener.snap: the screener snapshot of "look" is missing')
    await draftSnapshots(dir)
    // The study changes: the snapshot no longer matches it.
    await writeFile(join(dir, 'look.ui.test.ts'), (await readFile(join(dir, 'look.ui.test.ts'), 'utf8')).replace("within: '3 months'", "within: '1 month'"))
    const stale = session({}, {}, dir)
    expect(await main(['recruit', '--json'], stale.io)).toBe(1)
    expect(stale.err()).toContain('is out of date (the screens changed)')
    await draftSnapshots(dir)
    const s = session({}, {}, dir)
    expect(await main(['recruit', '--json'], s.io)).toBe(0)
    const made = await store()
    const run = (await made.listRuns()).find(r => r.compiled.name === 'look')
    expect(run!.compiled).toMatchObject({ draft: false, impression: { on: true, page: '/landing', says: 'A page for tests.', source: 'meta description' } })
    const attempts = await made.listAttempts(run!.run)
    expect(attempts.length).toBe(run!.compiled.sample.n)
  })

  it('needs no snapshot for an agent run', async () => {
    const dir = await mkdtemp(join(fixtures, '.tmp-recruit-agent-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await writeFile(join(dir, 'agent.ui.test.ts'), `import { study, task } from 'ui-tests'\nstudy('agent', { users: 'Agents', actors: ['agent'], target: { cli: 'npx ui-tests' } }, () => { task('Run', { minutes: 2 }, () => {}) })\n`)
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { server: { url: '${serverUrl}' }, target: { url: '${targetUrl}' }, model: { provider: 'scripted', name: 'fixture' } }\n`)
    const s = session({}, {}, dir)
    await main(['recruit', '--json', '--actor', 'agent'], s.io)
    expect(s.err()).not.toContain('screener snapshot')
  })
})
