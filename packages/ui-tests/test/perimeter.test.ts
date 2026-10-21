import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { main, type CliDeps, type Io } from '../src/cli/main.ts'
import { stubScreenshotter } from '../src/runner/screenshot.ts'
import { openStore } from '../src/store/open.ts'
import type { GitHubClient } from '../src/github/types.ts'
import type { Tunnel } from '../src/tunnel/types.ts'
import { reporterFor } from '../src/cli/outward.ts'
import { buildTrace } from '../src/trace/build.ts'
import { answersAsServer } from '../src/cli/ensure-server.ts'
import { startServer } from '../src/server/http.ts'
import { freePort } from './server-stub.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
let target: Server
let targetUrl: string
/** The ui-tests server the links are on, already running on this machine as `ui-tests serve` runs it: no public address pinned. */
let server: Awaited<ReturnType<typeof startServer>>
let work: string
let data: string
const cleanup: (() => Promise<unknown> | unknown)[] = []

beforeAll(async () => {
  target = createServer((_req, res) => res.end('ok'))
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  work = await mkdtemp(join(fixtures, '.tmp-perimeter-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-perimeter-'))
  const serverStore = await openStore({ UI_TESTS_DATA_DIR: data })
  const started = await startServer({ store: async () => serverStore, port: await freePort(), host: '127.0.0.1' })
  server = { ...started, close: async () => { await started.close(); await serverStore.close() } }
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  // A webhook is configured on purpose: local only must not call it.
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
})
afterAll(async () => {
  await server.close()
  target.closeAllConnections()
  await new Promise(resolve => target.close(resolve))
  await rm(work, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { vi.restoreAllMocks(); while (cleanup.length) await cleanup.pop()!() })

async function recruit(argv: string[], deps: CliDeps = {}, env: Record<string, string> = {}) {
  let out = ''
  let err = ''
  // --host holds its front door open until the deadline or Ctrl-C; unless a test says otherwise, it is stopped at once.
  const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, ...env }, deps: { pollMs: 1, screenshotter: stubScreenshotter(new Uint8Array([0])), ...(argv.includes('--host') && { signal: AbortSignal.abort() }), ...deps } }
  const code = await main(['recruit', ...argv], io)
  return { code, out, err, json: () => JSON.parse(out) }
}

describe('recruit --host', () => {
  it('puts the invite links and the app on the front door under the internal hostname, and records the run as inside the perimeter', async () => {
    const { code, json, err } = await recruit(['--json', '--host', '10.0.0.5', '--key', 'perimeter-1'])
    expect(code).toBe(0)
    // The links are on the front door's port under that name, and the app is reached through the same door.
    expect(json().invites).toHaveLength(5)
    const port = new URL(json().invites[0]).port
    expect(port).not.toBe(new URL(server.url).port)
    expect(port).not.toBe(new URL(targetUrl).port)
    for (const link of json().invites) expect(link).toMatch(new RegExp(`^http://10\\.0\\.0\\.5:${port}/ui-tests/r_\\w+/\\?t=\\S+$`))
    expect(err).toContain(`Inside the perimeter: links are on http://10.0.0.5:${port}. Keep this command running while people take part.`)
    const s = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => s.close())
    const run = (await s.listRuns()).find(r => r.key === 'perimeter-1')!
    expect(run.reachability).toMatchObject({ url: targetUrl, reachable: true, mode: 'perimeter' })
    expect(run.target).toBe(targetUrl)
    expect(run.appUrl).toBe(`http://10.0.0.5:${port}`)
  })

  it('takes only the name from a --host given with a port or a scheme', async () => {
    for (const [given, key] of [['10.0.0.5:8080', 'perimeter-port'], ['https://10.0.0.5:8443/x', 'perimeter-url']] as const) {
      const { code, json, err } = await recruit(['--json', '--host', given, '--key', key])
      expect(code, err).toBe(0)
      const port = new URL(json().invites[0]).port
      expect(port).not.toBe('8080')
      for (const link of json().invites) expect(link.startsWith(`http://10.0.0.5:${port}/ui-tests/`)).toBe(true)
      expect(err).toContain(`--host ${given}: links are on the front door's own port, so only the name 10.0.0.5 is used.`)
    }
  })

  it('holds the front door open, serving the app and the server, until stopped', async () => {
    const stop = new AbortController()
    const running = recruit(['--json', '--host', '10.0.0.5', '--key', 'perimeter-hold'], { signal: stop.signal })
    const s = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => s.close())
    let run: Awaited<ReturnType<typeof s.listRuns>>[number] | undefined
    for (let i = 0; i < 400 && !run?.appUrl?.startsWith('http://10.0.0.5:'); i++) {
      run = (await s.listRuns()).find(r => r.key === 'perimeter-hold')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    // The door listens on every interface; on this machine it answers at loopback on the same port.
    const door = `http://127.0.0.1:${new URL(run!.appUrl!).port}`
    let page = ''
    for (let i = 0; i < 400 && !page; i++) page = await fetch(door).then(r => r.text(), () => '')
    expect(page).toBe('ok')
    expect((await fetch(`${door}/api/ui-tests/`)).status).toBe(401)
    stop.abort()
    const { code, err } = await running
    expect(code).toBe(0)
    expect(err).toContain('The front door stays open for the participants. Press Ctrl-C to close it.')
    await expect(fetch(door)).rejects.toThrow()
  })

  it('refuses a running server whose address is pinned, since it would refuse the door\'s', async () => {
    const pinnedStore = await openStore({ UI_TESTS_DATA_DIR: data })
    const port = await freePort()
    const pinned = await startServer({ store: async () => pinnedStore, port, host: '127.0.0.1', publicUrl: `http://127.0.0.1:${port}` })
    cleanup.push(async () => { await pinned.close(); await pinnedStore.close() })
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: 'http://127.0.0.1:${port}' }, target: { url: '${targetUrl}' } }\n`)
    try {
      const refused = await recruit(['--json', '--host', '10.0.0.5', '--key', 'perimeter-pinned'])
      expect(refused.code).toBe(2)
      expect(refused.err).toContain(`The ui-tests server on http://127.0.0.1:${port} does not take the front door's address as its own. Run it without UI_TESTS_PUBLIC_URL`)
    } finally {
      await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
    }
  })

  it('shows how the run was reached in the trace', async () => {
    const { code, json } = await recruit(['--json', '--host', 'staging.corp.internal', '--key', 'perimeter-2'])
    expect(code).toBe(0)
    const s = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => s.close())
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { TraceView } = await import('../src/trace/view.tsx')
    const html = renderToStaticMarkup(createElement(TraceView, { trace: await buildTrace(s, json().run) }))
    expect(html).toContain('Reached by: <strong>perimeter</strong>')
  })

  it('refuses --host with --tunnel or --local', async () => {
    const tunnelled = await recruit(['--host', 'wiki', '--tunnel'])
    expect(tunnelled.code).toBe(2)
    expect(tunnelled.err).toContain('--host and --tunnel cannot be combined')
    const both = await recruit(['--host', 'wiki', '--local'])
    expect(both.code).toBe(2)
    expect(both.err).toContain('--local and --host cannot be combined')
  })
})

describe('recruit --local', () => {
  /** Every way out of the process that recruit has: the injected clients, and the global fetch beneath them. */
  function failingNetwork() {
    const fetchSpy = vi.fn(async () => { throw new Error('network call: fetch') })
    vi.stubGlobal('fetch', fetchSpy)
    const tunnelOpen = vi.fn(async () => { throw new Error('network call: tunnel') })
    const tunnel: Tunnel = { open: tunnelOpen }
    const calls = { createCheck: vi.fn(), updateCheck: vi.fn(), upsertComment: vi.fn(), pullRequestsForCommit: vi.fn() }
    const github: GitHubClient = calls as unknown as GitHubClient
    cleanup.push(() => vi.unstubAllGlobals())
    return { fetchSpy, tunnelOpen, calls, deps: { fetch: fetchSpy as unknown as typeof fetch, tunnel, github } satisfies CliDeps }
  }

  it('makes no network call, and says so', async () => {
    const net = failingNetwork()
    const { code, out, err, json } = await recruit(['--json', '--local', '--wait', '--key', 'local-1'], { ...net.deps, signal: AbortSignal.abort() }, { GITHUB_TOKEN: 'ghp_test', UI_TESTS_TUNNEL: 'fake' })
    expect(err).toContain('Local only: no tunnel, model, GitHub or webhook call is made.')
    expect(code).toBe(3)
    expect(json().invites).toHaveLength(5)
    expect(out).not.toContain('Tunnel')
    expect(net.fetchSpy).not.toHaveBeenCalled()
    expect(net.tunnelOpen).not.toHaveBeenCalled()
    for (const call of Object.values(net.calls)) expect(call).not.toHaveBeenCalled()
    const s = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => s.close())
    expect((await s.listRuns()).find(r => r.key === 'local-1')!.reachability).toMatchObject({ mode: 'local', localOnly: true })
  })

  it('does not tell the webhook or GitHub when a run finishes', async () => {
    const net = failingNetwork()
    const first = await recruit(['--json', '--local', '--key', 'local-2'], net.deps)
    expect(first.code).toBe(0)
    const s = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => s.close())
    // The deadline passes with no attempts: the run settles inconclusive and its result hook would fire anywhere else.
    const later = () => new Date(Date.now() + 72 * 3_600_000)
    const waited = await recruit(['--json', '--local', '--wait', '--key', 'local-2'], { ...net.deps, now: later })
    expect(waited.code).toBe(3)
    expect(net.fetchSpy).not.toHaveBeenCalled()
    for (const call of Object.values(net.calls)) expect(call).not.toHaveBeenCalled()
  })

  it('starts the ui-tests server when none answers on this machine, and keeps it up for the links until stopped', async () => {
    const net = failingNetwork()
    const url = `http://127.0.0.1:${await freePort()}`
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${url}' }, target: { url: '${targetUrl}' } }\n`)
    try {
      const stop = new AbortController()
      const running = recruit(['--json', '--local', '--key', 'local-start'], { ...net.deps, signal: stop.signal })
      // While the command holds, the links open the player on the server it started.
      // (asked over a socket, as the check itself does: the global fetch is the failing one here).
      let up = false
      for (let i = 0; i < 200 && !up; i++) {
        up = await answersAsServer(url)
        if (!up) await new Promise(resolve => setTimeout(resolve, 50))
      }
      expect(up).toBe(true)
      stop.abort()
      const { code, err, json } = await running
      expect(code).toBe(0)
      expect(err).toContain(`Started the ui-tests server on ${url}`)
      expect(err).toContain('The ui-tests server stays up for the participants. Press Ctrl-C to stop it.')
      for (const link of json().invites) expect(link.startsWith(`${url}/ui-tests/${json().run}/?t=`)).toBe(true)
      expect(net.fetchSpy).not.toHaveBeenCalled()
    } finally {
      await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
    }
  })

  it('refuses a ui-tests server that is not on this machine', async () => {
    const net = failingNetwork()
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: 'https://tests.example.com' }, target: { url: '${targetUrl}' } }\n`)
    try {
      const away = await recruit(['--local', '--key', 'away-server'], net.deps)
      expect(away.code).toBe(2)
      expect(away.err).toBe('--local needs the ui-tests server on this machine, not https://tests.example.com.\n')
    } finally {
      await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
    }
    expect(net.fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a tunnel, and a target that is not on this machine', async () => {
    const net = failingNetwork()
    const tunnelled = await recruit(['--local', '--tunnel'], net.deps)
    expect(tunnelled.code).toBe(2)
    expect(tunnelled.err).toContain('--local and --tunnel cannot be combined')
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: 'http://10.0.0.5:3100' } }\n`)
    try {
      const away = await recruit(['--local', '--key', 'away'], net.deps)
      expect(away.code).toBe(2)
      expect(away.err).toContain('--local needs a target on this machine')
    } finally {
      await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
    }
    expect(net.fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a remote store, and an https target, with a clear message', async () => {
    const net = failingNetwork()
    const remote = await recruit(['--local', '--key', 'remote'], net.deps, { UI_TESTS_DATABASE_URL: 'postgres://user:pw@db.example.com/ui' })
    expect(remote.code).toBe(2)
    expect(remote.err).toContain('--local keeps the store on this machine')
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: 'https://localhost:3100' } }\n`)
    try {
      const secure = await recruit(['--local', '--key', 'secure'], net.deps)
      expect(secure.code).toBe(2)
      expect(secure.err).toContain('--local supports http targets')
    } finally {
      await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
    }
    expect(net.fetchSpy).not.toHaveBeenCalled()
  })

  it('says nothing about the perimeter for a public hostname given to --host', async () => {
    const { code, err } = await recruit(['--json', '--host', 'tests.example.com', '--key', 'public-host'])
    expect(code).toBe(0)
    expect(err).not.toContain('Inside the perimeter')
  })
})

describe('the result hook of a local run', () => {
  async function settledRun(key: string, args: string[]) {
    const made = await recruit(['--json', '--key', key, ...args])
    expect(made.code).toBe(0)
    const s = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => s.close())
    const id = made.json().run as string
    const run = (await s.getRun(id))!
    // The hook fires once a run has a result; this one has settled with none found.
    await s.updateRun(id, { result: 'none-found' }, run.revision)
    return { s, id }
  }
  function spies() {
    const fetchSpy = vi.fn(async () => new Response('ok'))
    vi.stubGlobal('fetch', fetchSpy)
    cleanup.push(() => vi.unstubAllGlobals())
    const calls = { createCheck: vi.fn(), updateCheck: vi.fn(), upsertComment: vi.fn(), pullRequestsForCommit: vi.fn(async () => []) }
    return { fetchSpy, calls, github: calls as unknown as GitHubClient }
  }
  const io = (github: GitHubClient): Io => ({ stdout: { write: () => true }, stderr: { write: () => true }, cwd: work, env: { UI_TESTS_DATA_DIR: data }, deps: { github, webhookBackoffMs: 1 } })

  it('is not called by reporterFor, whoever settles the run: status, verify, check, a trace revision, an agent run', async () => {
    const { s, id } = await settledRun('hook-local', ['--local'])
    const net = spies()
    await reporterFor(io(net.github))((await s.getRun(id))!, s)
    expect(net.fetchSpy).not.toHaveBeenCalled()
    for (const call of Object.values(net.calls)) expect(call).not.toHaveBeenCalled()
  })

  it('is called for a run that is not local only (control: the spies would see it)', async () => {
    const { s, id } = await settledRun('hook-perimeter', ['--host', '10.0.0.5'])
    const net = spies()
    await reporterFor(io(net.github))((await s.getRun(id))!, s)
    expect(net.fetchSpy).toHaveBeenCalled()
  })

  it('stays quiet through status, verify and a revision of a local run', async () => {
    const { s, id } = await settledRun('hook-cli', ['--local'])
    const net = spies()
    const quiet = io(net.github)
    expect(await main(['status', id], quiet)).toBeGreaterThanOrEqual(0)
    expect(await main(['verify', id], quiet)).toBeGreaterThanOrEqual(0)
    const { recordRevision } = await import('../src/trace/revise.ts')
    await recordRevision(s, id, { kind: 'scenario', goalIndex: 0, text: 'Reworded' }, { by: 'me', onResult: reporterFor(quiet) })
    expect(net.fetchSpy).not.toHaveBeenCalled()
    for (const call of Object.values(net.calls)) expect(call).not.toHaveBeenCalled()
  })
})
