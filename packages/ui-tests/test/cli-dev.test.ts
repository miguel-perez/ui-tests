import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { main, type CliDeps, type Io } from '../src/cli/main.ts'
import { loadConfig } from '../src/config.ts'
import { loadStudies, withProduct } from '../src/cli/lint.ts'
import { createRun } from '../src/runner/create-run.ts'
import { createCollector } from '../src/server/collector.ts'
import { openStore } from '../src/store/open.ts'
import { runSetup, checkReachable } from '../src/runner/setup.ts'
import { freePort, stubServer } from './server-stub.ts'
import { draftSnapshots } from './snapshots.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
let target: Server
let targetUrl: string
/** Where rehearsal starts its own ui-tests server: nothing listens there until a rehearsal does. */
let serverUrl: string
let work: string
let data: string
const cleanup: (() => Promise<unknown> | unknown)[] = []

beforeAll(async () => {
  target = createServer((_req, res) => res.end('ok'))
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  work = await mkdtemp(join(fixtures, '.tmp-cli-dev-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-dev-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  serverUrl = `http://127.0.0.1:${await freePort()}`
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' }, server: { url: '${serverUrl}' } }\n`)
  await draftSnapshots(work)
})
afterAll(async () => {
  target.closeAllConnections()
  await new Promise(resolve => target.close(resolve))
  await rm(work, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

function session(cwd = work, deps: CliDeps = {}, env: Record<string, string> = {}) {
  const controller = new AbortController()
  let out = ''
  let err = ''
  const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd, env: { UI_TESTS_DATA_DIR: data, ...env }, deps: { signal: controller.signal, pollMs: 20, ...deps } }
  cleanup.push(() => controller.abort())
  return { io, controller, out: () => out, err: () => err }
}
async function until(read: () => string, pattern: RegExp, ms = 5000) {
  const start = Date.now()
  while (!pattern.test(read())) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for ${pattern}; saw:\n${read()}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}
const call = (handler: (r: Request) => Promise<Response>, token: string, body: unknown) =>
  handler(new Request('http://player.test/api/ui-tests/', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('ui-tests dev mode', () => {
  it('prints a player URL, records a rehearsal run, verifies it and serves the trace', async () => {
    const s = session(work, { screenshot: async () => new Uint8Array([1, 2, 3]) })
    const done = main(['--no-open'], s.io)
    await until(s.out, /"player"/)
    expect(s.out()).toContain('Study: dev fixture')
    const printed = JSON.parse(/\{"player".*\}/.exec(s.out())![0]).player as string
    // The player is on the ui-tests server rehearsal started, not on the app.
    expect(printed).toMatch(new RegExp(`^${serverUrl}/ui-tests/r_\\w+/\\?t=[0-9a-f]{64}$`))
    expect(s.err()).toContain(`Started the ui-tests server on ${serverUrl}`)
    const player = new URL(printed)
    const token = player.searchParams.get('t')!
    const [, , runId] = player.pathname.split('/')
    expect(runId).toMatch(/^r_/)
    // The server answers there while the rehearsal runs, with the player of this run.
    expect((await fetch(`${serverUrl}/healthz`)).status).toBe(200)
    expect((await fetch(printed)).headers.get('content-type')).toContain('text/html')

    const store = await openStore(s.io.env)
    cleanup.push(() => store.close())
    const collector = createCollector({ store: async () => store })
    for (const body of [
      { action: 'consent' }, { action: 'begin' },
      { action: 'end', reason: 'done', snapshot: { url: `${targetUrl}/docs/getting-started/`, dom: '<html><body>Docs</body></html>' } },
      { action: 'answers', ease: 6, uxlite: { useful: 5, easy: 5 }, comment: 'fine' },
    ]) expect((await call(collector, token, body)).status).toBe(200)

    await until(s.out, /Trace: http:\/\/127\.0\.0\.1:\d+\/runs\/r_\w+\//)
    expect(s.out()).toContain('Outcome: correct')
    expect(s.out()).toContain('Rehearsal: 0 of 5 planned attempts recorded.')
    const run = (await store.getRun(runId))!
    expect(run).toMatchObject({ rehearsal: true, key: expect.stringMatching(/^rehearsal:/), reachability: { url: targetUrl, reachable: true }, target: targetUrl, appUrl: targetUrl })
    expect(run.states).toMatchObject({ collection: 'complete', verification: 'complete' })
    const [attempt] = await store.listAttempts(runId)
    expect(attempt).toMatchObject({ rehearsal: true, status: 'finished', verification: { status: 'correct' } })
    expect(attempt.setupValues).toEqual({ start: '/' })

    const traceUrl = /Trace: (\S+)/.exec(s.out())![1]
    const json = await (await fetch(`${traceUrl.replace(/\/$/, '')}.json`)).json()
    expect(json.sentence).toBe('Rehearsal: 0 of 5 planned attempts recorded.')
    expect(json.lint).toEqual([])

    const status = session()
    expect(await main(['status', runId], status.io)).toBe(0)
    expect(status.out()).toContain('verification: complete')
    const asJson = session()
    expect(await main(['status', runId, '--json'], asJson.io)).toBe(0)
    expect(JSON.parse(asJson.out())).toMatchObject({ run: runId, states: { verification: 'complete' } })

    s.controller.abort()
    expect(await done).toBe(0)
    // Closed with the trace.
    await expect(fetch(`${serverUrl}/healthz`)).rejects.toThrow()
  })

  it('reuses a ui-tests server that is already running, and leaves it running', async () => {
    // A server on the same store: it answers the player page of the run rehearsal makes.
    const running = await stubServer((req, res) => {
      if (req.url === '/healthz') res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true,"name":"ui-tests"}')
      else if (/^\/ui-tests\/r_\w+\/$/.test(req.url ?? '')) res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html>')
      else res.writeHead(404).end('Not found')
    })
    cleanup.push(() => running.close())
    const dir = await mkdtemp(join(fixtures, '.tmp-cli-dev-reuse-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(dir, 'dev.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' }, server: { url: '${running.url}' } }\n`)
    await draftSnapshots(dir)
    const s = session(dir)
    const done = main(['--no-open'], s.io)
    await until(s.out, /"player"/)
    expect(JSON.parse(/\{"player".*\}/.exec(s.out())![0]).player).toMatch(new RegExp(`^${running.url}/ui-tests/r_\\w+/\\?t=`))
    expect(s.err()).not.toContain('Started')
    s.controller.abort()
    expect(await done).toBe(0)
    expect((await fetch(`${running.url}/healthz`)).status).toBe(200)
  })

  it('exits 2 when a running ui-tests server does not know the run, since it reads another store', async () => {
    // Answers its health check as ui-tests does, and 404 for the run: it was started on another store.
    const elsewhere = await stubServer()
    cleanup.push(() => elsewhere.close())
    const dir = await mkdtemp(join(fixtures, '.tmp-cli-dev-store-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(dir, 'dev.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' }, server: { url: '${elsewhere.url}' } }\n`)
    await draftSnapshots(dir)
    const s = session(dir)
    expect(await main(['--no-open'], s.io)).toBe(2)
    expect(s.err()).toBe(`ui-tests server at ${elsewhere.url} does not read this project's store: stop it, or point UI_TESTS_DATABASE_URL at the same store\n`)
    expect(s.out()).not.toContain('"player"')
  })

  it('exits 2 when the ui-tests server is neither running nor its to start, before any run exists', async () => {
    const other = await stubServer((_req, res) => res.end('ok'))
    cleanup.push(() => other.close())
    const dir = await mkdtemp(join(fixtures, '.tmp-cli-dev-other-'))
    const empty = await mkdtemp(join(tmpdir(), 'ui-tests-empty-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }), () => rm(empty, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(dir, 'dev.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' }, server: { url: '${other.url}' } }\n`)
    await draftSnapshots(dir)
    const s = session(dir, {}, { UI_TESTS_DATA_DIR: empty })
    expect(await main(['--no-open'], s.io)).toBe(2)
    expect(s.err()).toBe(`ui-tests server not reachable: ${other.url}\n`)
    const store = await openStore(s.io.env)
    expect(await store.listRuns()).toEqual([])
    await store.close()
  })

  it('takes a screenshot of the end page through the injected screenshotter', async () => {
    const shots: string[] = []
    const dir = await mkdtemp(join(tmpdir(), 'ui-tests-shot-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }))
    const s = session(work, { screenshot: async url => { shots.push(url); return new Uint8Array([9]) } }, { UI_TESTS_DATA_DIR: dir })
    const done = main(['--no-open'], s.io)
    await until(s.out, /"player"/)
    const player = new URL(JSON.parse(/\{"player".*\}/.exec(s.out())![0]).player)
    const store = await openStore(s.io.env)
    cleanup.push(() => store.close())
    const collector = createCollector({ store: async () => store })
    const token = player.searchParams.get('t')!
    for (const body of [
      { action: 'consent' }, { action: 'begin' },
      { action: 'end', reason: 'done', snapshot: { url: `${targetUrl}/elsewhere/`, dom: '<html></html>' } },
      { action: 'answers', ease: 2, difficulty: 'lost', uxlite: { useful: 3, easy: 3 }, comment: 'no' },
    ]) await call(collector, token, body)
    await until(s.out, /Trace: /)
    expect(shots).toEqual([`${targetUrl}/elsewhere/`])
    expect(s.out()).toContain('Outcome: incorrect')
    s.controller.abort()
    await done
  })

  it('exits 2 with "target not reachable" before any run exists', async () => {
    const closed = createServer()
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve))
    const url = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`
    await new Promise(resolve => closed.close(resolve))
    const dir = await mkdtemp(join(fixtures, '.tmp-cli-dev-down-'))
    const empty = await mkdtemp(join(tmpdir(), 'ui-tests-empty-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }), () => rm(empty, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(dir, 'dev.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { target: { url: '${url}' } }\n`)
    await draftSnapshots(dir)
    const s = session(dir, {}, { UI_TESTS_DATA_DIR: empty })
    expect(await main([], s.io)).toBe(2)
    expect(s.err()).toContain(`target not reachable: ${url}`)
    const store = await openStore(s.io.env)
    expect(await store.listRuns()).toEqual([])
    await store.close()
  })

  it('exits 1 on lint errors before any run is made', async () => {
    const dir = await mkdtemp(join(fixtures, '.tmp-cli-dev-lint-'))
    const empty = await mkdtemp(join(tmpdir(), 'ui-tests-empty-'))
    cleanup.push(() => rm(dir, { recursive: true, force: true }), () => rm(empty, { recursive: true, force: true }))
    await copyFile(join(fixtures, 'cli-lint/interface/a.ui.test.ts'), join(dir, 'a.ui.test.ts'))
    await writeFile(join(dir, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' } }\n`)
    await draftSnapshots(dir)
    const s = session(dir, {}, { UI_TESTS_DATA_DIR: empty })
    expect(await main([], s.io)).toBe(1)
    expect(s.out()).toContain('interface-terms')
    const store = await openStore(s.io.env)
    expect(await store.listRuns()).toEqual([])
    await store.close()
  })

  it('exits 2 with file and line when a study throws', async () => {
    const s = session(join(fixtures, 'cli-lint/throws'))
    expect(await main([], s.io)).toBe(2)
    expect(s.err()).toContain('a.ui.test.ts:4')
  })

  it('picks only studies that admit the actor and refuses an unknown study or task', async () => {
    const agent = session()
    expect(await main(['--actor', 'agent', '--study', 'dev fixture'], agent.io)).toBe(2)
    expect(agent.err()).toContain('No study admits the agent actor')
    const unknown = session()
    expect(await main(['--study', 'nope'], unknown.io)).toBe(2)
    expect(unknown.err()).toContain('No study named "nope"')
    const task = session()
    expect(await main(['--task', 'nope'], task.io)).toBe(2)
    expect(task.err()).toContain('No task named "nope"')
  })
})

describe('verify, status and trace', () => {
  it('verifies a run from the stored snapshots and lists each attempt', async () => {
    const store = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => store.close())
    const config = withProduct((await loadConfig(work)).config)
    const [loaded] = await loadStudies(work, [], config)
    const { run } = await createRun({ store, compiled: loaded.compiled, hooksBundle: loaded.code, target: targetUrl, key: 'verify-test', actor: 'human', rehearsal: false })
    const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
    await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', startedAt: new Date().toISOString() })
    await store.putSnapshot(attempt.id, 'end', { url: `${targetUrl}/docs/getting-started/`, dom: '<html></html>' })
    const v = session()
    expect(await main(['verify', run.run], v.io)).toBe(0)
    expect(v.out()).toContain('Verified 1 attempt.')
    expect(v.out()).toContain(`${attempt.id}: correct`)
    expect((await store.getRun(run.run))!.states.verification).toBe('complete')
    expect((await store.getAttempt(attempt.id))!.verification?.status).toBe('correct')
    expect(await main(['verify', 'r_missing'], session().io)).toBe(2)
    expect(await main(['verify'], session().io)).toBe(2)
  })

  it('serves a run on 127.0.0.1 with `trace` and refuses an unknown run', async () => {
    const store = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => store.close())
    const [run] = await store.listRuns()
    const t = session()
    const done = main(['trace', run.run, '--no-open'], t.io)
    await until(t.out, /Trace: http:\/\/127\.0\.0\.1:\d+\//)
    const page = await fetch(/Trace: (\S+)/.exec(t.out())![1])
    expect(page.status).toBe(200)
    t.controller.abort()
    expect(await done).toBe(0)
    expect(await main(['trace', 'r_missing'], session().io)).toBe(2)
    expect(await main(['status', 'r_missing'], session().io)).toBe(2)
  })
})

describe('runner helpers', () => {
  it('reports reachability by answer, not status', async () => {
    expect(await checkReachable(targetUrl)).toBe(true)
    expect(await checkReachable('http://127.0.0.1:1')).toBe(false)
    expect(await checkReachable('http://x.test', async () => { throw new Error('down') })).toBe(false)
    // A cold dev server answers its first request slowly: a timeout earns one longer try; a refusal does not.
    let calls = 0
    const slowFirst = (async (_url: string, init?: RequestInit) => { if (calls++ === 0) { await new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))); } return new Response('ok') }) as unknown as typeof fetch
    expect(await checkReachable('http://x.test', slowFirst, [20, 2000])).toBe(true)
    expect(calls).toBe(2)
  })
  it('returns no values for a study without setup', async () => {
    expect(await runSetup({ name: 's', options: { users: 'x' }, tasks: [], file: 'f', line: 1, legacy: [] }, targetUrl)).toEqual({})
  })
})
