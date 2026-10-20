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
import { buildTrace } from '../src/trace/build.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
let target: Server
let targetUrl: string
let work: string
let data: string
const cleanup: (() => Promise<unknown> | unknown)[] = []

beforeAll(async () => {
  target = createServer((_req, res) => res.end('ok'))
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  work = await mkdtemp(join(fixtures, '.tmp-perimeter-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-perimeter-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  // A webhook is configured on purpose: local only must not call it.
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
})
afterAll(async () => {
  target.closeAllConnections()
  await new Promise(resolve => target.close(resolve))
  await rm(work, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { vi.restoreAllMocks(); while (cleanup.length) await cleanup.pop()!() })

async function recruit(argv: string[], deps: CliDeps = {}, env: Record<string, string> = {}) {
  let out = ''
  let err = ''
  const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, ...env }, deps: { pollMs: 1, screenshotter: stubScreenshotter(new Uint8Array([0])), ...deps } }
  const code = await main(['recruit', ...argv], io)
  return { code, out, err, json: () => JSON.parse(out) }
}

describe('recruit --host', () => {
  it('puts the invite links on the internal hostname and records the run as inside the perimeter', async () => {
    const { code, json } = await recruit(['--json', '--host', '10.0.0.5', '--key', 'perimeter-1'])
    expect(code).toBe(0)
    const port = new URL(targetUrl).port
    expect(json().invites).toHaveLength(5)
    for (const link of json().invites) expect(link).toMatch(new RegExp(`^http://10\\.0\\.0\\.5:${port}/ui-tests/r_\\w+/\\?t=\\S+$`))
    const s = await openStore({ UI_TESTS_DATA_DIR: data })
    cleanup.push(() => s.close())
    const run = (await s.listRuns()).find(r => r.key === 'perimeter-1')!
    expect(run.reachability).toMatchObject({ url: targetUrl, reachable: true, mode: 'perimeter' })
    expect(run.target).toBe(targetUrl)
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
    expect((await recruit(['--host', 'wiki', '--tunnel'])).code).toBe(2)
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
    expect((await s.listRuns()).find(r => r.key === 'local-1')!.reachability).toMatchObject({ mode: 'local' })
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

  it('refuses a tunnel, and a target that is not on this machine', async () => {
    const net = failingNetwork()
    const tunnelled = await recruit(['--local', '--tunnel'], net.deps)
    expect(tunnelled.code).toBe(2)
    expect(tunnelled.err).toContain('--local and --tunnel cannot be combined')
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: 'http://10.0.0.5:3100' } }\n`)
    try {
      const away = await recruit(['--local', '--key', 'away'], net.deps)
      expect(away.code).toBe(2)
      expect(away.err).toContain('--local needs a target on this machine')
    } finally {
      await writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' }, webhook: { url: 'https://hooks.example.com/ui-tests', secret: 's' } }\n`)
    }
    expect(net.fetchSpy).not.toHaveBeenCalled()
  })
})
