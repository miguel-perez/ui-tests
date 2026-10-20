import { EventEmitter } from 'node:events'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { main, type CliDeps, type Io } from '../src/cli/main.ts'
import { createCollector } from '../src/server/collector.ts'
import { openStore } from '../src/store/open.ts'
import type { RunStore } from '../src/store/types.ts'
import { cloudflaredTunnel, parseTunnelUrl } from '../src/tunnel/cloudflared.ts'
import { isSlot } from '../src/runner/invites.ts'
import { fakeTunnel } from '../src/tunnel/fake.ts'
import type { TunnelRecord } from '../src/tunnel/types.ts'
import { stubServer } from './server-stub.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
const hour = 3_600_000
let target: Server
let targetUrl: string
let server: Awaited<ReturnType<typeof stubServer>>
let work: string
let data: string
let collectorStore: RunStore
const cleanup: (() => Promise<unknown> | unknown)[] = []

beforeAll(async () => {
  data = await mkdtemp(join(tmpdir(), 'ui-tests-tunnel-'))
  collectorStore = await openStore({ UI_TESTS_DATA_DIR: data })
  const collect = createCollector({ store: async () => collectorStore })
  // A stand-in for the host app: a public landing, the collector, and a player route that shows the study only to a token that opens it.
  target = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', targetUrl)
    if (url.pathname.startsWith('/api/ui-tests')) {
      const answer = await collect(new Request(url, { method: req.method, headers: req.headers as Record<string, string> }))
      res.writeHead(answer.status).end(await answer.text())
    } else if (url.pathname.startsWith('/ui-tests/')) {
      const token = url.searchParams.get('t')
      const answer = token ? await collect(new Request(`${targetUrl}/api/ui-tests/`, { headers: { Authorization: `Bearer ${token}` } })) : undefined
      res.end(answer?.status === 200 ? `study: ${answer.status}` : 'no study')
    } else res.end('landing')
  })
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  server = await stubServer()
  work = await mkdtemp(join(fixtures, '.tmp-tunnel-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${targetUrl}' } }\n`)
})
afterAll(async () => {
  await server.close()
  target.closeAllConnections()
  await new Promise(resolve => target.close(resolve))
  await collectorStore.close()
  await rm(work, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

/** Starts `recruit --tunnel` and leaves it running; `stop` aborts it the way Ctrl-C would. */
function start(argv: string[] = [], deps: CliDeps = {}) {
  let out = ''
  let err = ''
  const abort = new AbortController()
  const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, UI_TESTS_TUNNEL: 'fake' }, deps: { pollMs: 5, signal: abort.signal, ...deps } }
  const done = main(['recruit', '--tunnel', '--json', ...argv], io)
  cleanup.push(async () => { abort.abort(); await done })
  const ready = async (): Promise<any> => {
    for (let i = 0; i < 400; i++) {
      if (out.trim().endsWith('}')) return JSON.parse(out)
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`recruit printed nothing: ${err}`)
  }
  return { ready, done, stop: () => abort.abort(), err: () => err }
}
async function store(): Promise<RunStore> {
  const s = await openStore({ UI_TESTS_DATA_DIR: data })
  cleanup.push(() => s.close())
  return s
}
const tunnelsOf = async (run: string) => ((await (await store()).getRun(run))?.tunnels ?? []) as TunnelRecord[]
const text = async (url: string) => (await fetch(url)).text()

describe('recruit --tunnel with the fake tunnel', () => {
  it('serves the public landing, refuses the collector without a token and shows no study without one', async () => {
    const session = start(['--key', 'k-serve'])
    const handle = await session.ready()
    const tunnel = new URL(handle.tunnel)
    expect(tunnel.hostname).toBe('127.0.0.1')
    expect(handle.tunnel).not.toBe(targetUrl)
    expect(await text(handle.tunnel)).toBe('landing')
    expect((await fetch(`${handle.tunnel}/api/ui-tests/`)).status).toBe(401)
    expect(await text(`${handle.tunnel}/ui-tests/${handle.run}/`)).toBe('no study')
    // The links are under the tunnel, and a token opens the study through it.
    expect(handle.invites).toHaveLength(5)
    for (const link of handle.invites) expect(link.startsWith(`${handle.tunnel}/ui-tests/${handle.run}/?t=`)).toBe(true)
    expect(await text(handle.invites[0])).toBe('study: 200')
    session.stop()
    expect(await session.done).toBe(0)
  })

  it('records the URL on the run and stamps closedAt when the command ends', async () => {
    const session = start(['--key', 'k-record'])
    const handle = await session.ready()
    const open = await tunnelsOf(handle.run)
    expect(open).toEqual([{ url: handle.tunnel, openedAt: expect.any(String) }])
    session.stop()
    await session.done
    const closed = await tunnelsOf(handle.run)
    expect(closed).toHaveLength(1)
    expect(closed[0].closedAt).toEqual(expect.any(String))
    await expect(fetch(handle.tunnel)).rejects.toThrow()
  })

  it('shows the tunnel URLs in the trace', async () => {
    const session = start(['--key', 'k-trace'])
    const handle = await session.ready()
    const { buildTrace } = await import('../src/trace/build.ts')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { TraceView } = await import('../src/trace/view.tsx')
    const { createElement } = await import('react')
    const html = renderToStaticMarkup(createElement(TraceView, { trace: await buildTrace(await store(), handle.run) }))
    expect(html).toContain('Tunnels')
    expect(html).toContain(handle.tunnel)
    session.stop()
    await session.done
  })

  it('reopens on the same key: same run, a second tunnel URL, new links for the same slots', async () => {
    const first = start(['--key', 'k-resume'])
    const a = await first.ready()
    const slots = (await (await store()).listAttempts(a.run)).map(x => x.participant)
    first.stop()
    await first.done

    const second = start(['--key', 'k-resume'])
    const b = await second.ready()
    expect(b.run).toBe(a.run)
    expect(b.tunnel).not.toBe(a.tunnel)
    expect(await tunnelsOf(a.run)).toMatchObject([{ url: a.tunnel, closedAt: expect.any(String) }, { url: b.tunnel }])
    expect(b.invites).toHaveLength(5)
    for (const link of b.invites) expect(link.startsWith(b.tunnel)).toBe(true)
    expect(await text(b.invites[0])).toBe('study: 200')
    // The old slots are retired: their tokens open nothing, even through the new tunnel, and they are not slots.
    const oldToken = new URL(a.invites[0]).searchParams.get('t')!
    expect((await fetch(`${b.tunnel}/api/ui-tests/`, { headers: { Authorization: `Bearer ${oldToken}` } })).status).toBe(401)
    expect(await text(a.invites[0].replace(a.tunnel, b.tunnel))).toBe('no study')
    const all = await (await store()).listAttempts(a.run)
    expect(all).toHaveLength(10)
    const live = all.filter(isSlot)
    expect(live.map(x => x.participant)).toEqual(slots)
    expect(all.filter(x => !isSlot(x)).every(x => x.reason === undefined && x.flags.includes('retired'))).toBe(true)
    second.stop()
    await second.done
  })

  it('closes the tunnel at the run deadline on the clock it is given', async () => {
    let clock = Date.now()
    const session = start(['--key', 'k-deadline'], { now: () => new Date(clock) })
    const handle = await session.ready()
    expect(await text(handle.tunnel)).toBe('landing')
    clock += 49 * hour
    expect(await session.done).toBe(0)
    await expect(fetch(handle.tunnel)).rejects.toThrow()
    expect((await tunnelsOf(handle.run))[0].closedAt).toBe(new Date(clock).toISOString())
  })

  it('exits 2 with a reason when the tunnel cannot open', async () => {
    let err = ''
    const code = await main(['recruit', '--tunnel', '--json', '--key', 'k-fail'], {
      stdout: { write: () => true }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data },
      deps: { tunnel: { open: async () => { throw new Error('cloudflared is not installed') } } },
    })
    expect(code).toBe(2)
    expect(err).toContain('tunnel: cloudflared is not installed')
    expect((await (await store()).listRuns()).find(r => r.key === 'k-fail')).toBeUndefined()
  })

  it('exits 2 before any run exists when the tunnel opens but does not answer, and closes it', async () => {
    let err = ''
    let closed = false
    const code = await main(['recruit', '--tunnel', '--json', '--key', 'k-dead'], {
      stdout: { write: () => true }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data },
      deps: { pollMs: 1, tunnel: { open: async () => ({ url: 'http://127.0.0.1:1', close: async () => { closed = true } }) } },
    })
    expect(code).toBe(2)
    expect(err).toContain('did not answer')
    expect(closed).toBe(true)
    expect((await (await store()).listRuns()).find(r => r.key === 'k-dead')).toBeUndefined()
  })

  it('opens no tunnel and reissues nothing when the run is past its deadline', async () => {
    let clock = Date.now()
    const first = start(['--key', 'k-late'], { now: () => new Date(clock) })
    const a = await first.ready()
    first.stop()
    await first.done
    clock += 49 * hour
    let err = ''
    let out = ''
    const code = await main(['recruit', '--tunnel', '--json', '--key', 'k-late'], {
      stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, UI_TESTS_TUNNEL: 'fake' },
      deps: { pollMs: 1, now: () => new Date(clock) },
    })
    expect(code).toBe(0)
    expect(err).toContain('past its deadline')
    expect(JSON.parse(out).tunnel).toBeUndefined()
    expect(await tunnelsOf(a.run)).toHaveLength(1)
    expect((await (await store()).listAttempts(a.run)).filter(x => !isSlot(x))).toHaveLength(0)
  })
})

describe('fakeTunnel', () => {
  it('forwards to the local build and closes twice without error', async () => {
    const opened = await fakeTunnel().open(targetUrl)
    expect(await text(opened.url)).toBe('landing')
    await opened.close()
    await opened.close()
  })
})

const sample = `2026-10-19T10:00:00Z INF Thank you for trying Cloudflare Tunnel.
2026-10-19T10:00:01Z INF Requesting new quick Tunnel on trycloudflare.com...
2026-10-19T10:00:02Z INF +--------------------------------------------------------------------------------------------+
2026-10-19T10:00:02Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-10-19T10:00:02Z INF |  https://quiet-river-fox-42.trycloudflare.com                                              |
2026-10-19T10:00:02Z INF +--------------------------------------------------------------------------------------------+
`

describe('cloudflaredTunnel', () => {
  it('parses the trycloudflare URL out of a recorded stderr sample', () => {
    expect(parseTunnelUrl(sample)).toBe('https://quiet-river-fox-42.trycloudflare.com')
    expect(parseTunnelUrl('INF Requesting new quick Tunnel on trycloudflare.com...')).toBeUndefined()
  })

  function child() {
    const proc = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), killed: false, exitCode: null as number | null, kill() { proc.killed = true; return true } })
    return proc
  }

  it('spawns `cloudflared tunnel --url <local>`, resolves with the URL from stderr and kills the process on close', async () => {
    const proc = child()
    let called: unknown[] = []
    const tunnel = cloudflaredTunnel('cloudflared', (bin, args) => { called = [bin, args]; return proc as never })
    const opening = tunnel.open('http://localhost:3000')
    proc.stderr.write(sample.slice(0, 120))
    proc.stderr.write(sample.slice(120))
    const opened = await opening
    expect(called).toEqual(['cloudflared', ['tunnel', '--url', 'http://localhost:3000']])
    expect(opened.url).toBe('https://quiet-river-fox-42.trycloudflare.com')
    expect(proc.killed).toBe(false)
    await opened.close()
    expect(proc.killed).toBe(true)
  })

  it('says to install cloudflared when the binary is missing', async () => {
    const proc = child()
    const opening = cloudflaredTunnel('cloudflared', () => proc as never).open('http://localhost:3000')
    proc.emit('error', Object.assign(new Error('spawn cloudflared ENOENT'), { code: 'ENOENT' }))
    await expect(opening).rejects.toThrow(/cloudflared is not installed/)
  })

  it('does not take cloudflared\'s own API host for a tunnel when the start fails', async () => {
    const failed = `2026-10-19T10:00:01Z INF Requesting new quick Tunnel on trycloudflare.com...
2026-10-19T10:00:02Z ERR failed to request quick Tunnel: Post "https://api.trycloudflare.com/tunnel": dial tcp: lookup api.trycloudflare.com: no such host
`
    expect(parseTunnelUrl(failed)).toBeUndefined()
    const proc = child()
    const opening = cloudflaredTunnel('cloudflared', () => proc as never).open('http://localhost:3000')
    proc.stderr.write(failed)
    proc.emit('exit', 1)
    await expect(opening).rejects.toThrow(/exited with code 1/)
    expect(proc.killed).toBe(true)
  })

  it('fails and kills the process when it exits before printing a URL', async () => {
    const proc = child()
    const opening = cloudflaredTunnel('cloudflared', () => proc as never).open('http://localhost:3000')
    proc.emit('exit', 1)
    await expect(opening).rejects.toThrow(/exited with code 1/)
  })
})
