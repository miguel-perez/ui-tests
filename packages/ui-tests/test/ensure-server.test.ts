import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ensureServer, ensureServerKnowsRun, LOCAL_NO_MODEL, ServerReadsAnotherStore, ServerUnreachable, startDoorServer } from '../src/cli/ensure-server.ts'
import { startServer } from '../src/server/http.ts'
import type { Io } from '../src/cli/main.ts'
import { openStore } from '../src/store/open.ts'
import type { RunStore } from '../src/store/types.ts'
import { freePort, stubServer } from './server-stub.ts'

let data: string
let store: RunStore
let printed = ''
const io = (): Io => ({ stdout: { write: t => (printed += t) }, stderr: { write: t => (printed += t) }, cwd: data, env: {} })
const cleanup: (() => Promise<unknown> | unknown)[] = []

// The real server, watched: a refused or reused address must never be listened on.
vi.mock('../src/server/http.ts', async original => {
  const real = await original<typeof import('../src/server/http.ts')>()
  return { ...real, startServer: vi.fn(real.startServer) }
})

beforeAll(async () => {
  data = await mkdtemp(join(tmpdir(), 'ui-tests-ensure-'))
  store = await openStore({ UI_TESTS_DATA_DIR: data })
})
afterAll(async () => {
  await store.close()
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { printed = ''; vi.mocked(startServer).mockClear(); while (cleanup.length) await cleanup.pop()!() })

describe('ensureServer', () => {
  it('reuses a running server', async () => {
    const running = await stubServer()
    cleanup.push(() => running.close())
    const listen = vi.spyOn(running.server, 'listen')
    const server = await ensureServer({ url: running.url, store, io: io() })
    expect(server).toMatchObject({ url: running.url, started: false })
    await server.close()
    expect(listen).not.toHaveBeenCalled()
    expect(startServer).not.toHaveBeenCalled()
    // Still the stub answering: closing a reused server leaves it alone.
    expect(await (await fetch(`${running.url}/healthz`)).json()).toEqual({ ok: true, name: 'ui-tests' })
    expect(printed).toBe('')
  })

  it('starts one on a free loopback port', async () => {
    const url = `http://127.0.0.1:${await freePort()}`
    const server = await ensureServer({ url: `${url}/`, store, io: io() })
    expect(server).toMatchObject({ url, started: true })
    expect(startServer).toHaveBeenCalledWith(expect.objectContaining({ host: '127.0.0.1', port: Number(new URL(url).port), publicUrl: url }))
    expect(printed).toBe(`Started the ui-tests server on ${url}\n`)
    expect(await (await fetch(`${url}/healthz`)).json()).toEqual({ ok: true, name: 'ui-tests' })
    await server.close()
    await expect(fetch(`${url}/healthz`)).rejects.toThrow()
    // The port is free again.
    const again = await ensureServer({ url, store, io: io() })
    expect(again.started).toBe(true)
    await again.close()
  })

  it('starts a local-only server with no model and no key, so the first look is never sent to a model', async () => {
    const url = `http://127.0.0.1:${await freePort()}`
    const withKey: Io = { ...io(), env: { ANTHROPIC_API_KEY: 'sk-test' } }
    const local = await ensureServer({ url, store, io: withKey, localOnly: true })
    cleanup.push(() => local.close())
    const options = vi.mocked(startServer).mock.calls.at(-1)![0]
    expect(options).toMatchObject({ noModel: LOCAL_NO_MODEL })
    expect(options).not.toHaveProperty('env')
    await local.close()
    cleanup.pop()
    const other = await ensureServer({ url, store, io: withKey })
    cleanup.push(() => other.close())
    expect(vi.mocked(startServer).mock.calls.at(-1)![0]).toMatchObject({ env: { ANTHROPIC_API_KEY: 'sk-test' } })
    expect(vi.mocked(startServer).mock.calls.at(-1)![0]).not.toHaveProperty('noModel')
  })

  it('starts a server of its own for a front door: loopback, any free port, no public address', async () => {
    const running = await stubServer()
    cleanup.push(() => running.close())
    const server = await startDoorServer({ store, io: io() })
    cleanup.push(() => server.close())
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(server.url).not.toBe(running.url)
    expect(startServer).toHaveBeenCalledWith(expect.objectContaining({ host: '127.0.0.1', port: 0 }))
    expect(vi.mocked(startServer).mock.calls[0]![0]).not.toHaveProperty('publicUrl')
    // It takes the address the door names as its own: a page there may trade a code (here, an empty body is read and refused as such).
    const asked = await fetch(`${server.url}/api/ui-tests/exchange`, { method: 'POST', headers: { Origin: 'https://abc.trycloudflare.com', 'X-Forwarded-Host': 'abc.trycloudflare.com', 'X-Forwarded-Proto': 'https' } })
    expect(asked.status).toBe(400)
  })

  it('refuses another service on the port', async () => {
    const other = await stubServer((_req, res) => res.end('ok'))
    cleanup.push(() => other.close())
    await expect(ensureServer({ url: other.url, store, io: io() })).rejects.toThrow(new ServerUnreachable(other.url))
    await expect(ensureServer({ url: other.url, store, io: io() })).rejects.toThrow(`ui-tests server not reachable: ${other.url}`)
    expect(printed).toBe('')
  })

  it('refuses a remote address it cannot reach', async () => {
    const fetcher = vi.fn(async () => { throw new Error('unreachable') }) as unknown as typeof fetch
    const url = 'http://10.255.255.1:4300'
    await expect(ensureServer({ url, store, io: io(), fetch: fetcher })).rejects.toThrow(`ui-tests server not reachable: ${url}`)
    expect(fetcher).toHaveBeenCalledWith(`${url}/healthz`, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(startServer).not.toHaveBeenCalled()
    expect(printed).toBe('')
  })
})

describe('ensureServerKnowsRun', () => {
  it('passes a reused server that answers for the run, and refuses one that reads another store', async () => {
    const asked: string[] = []
    const same = await stubServer((req, res) => { asked.push(req.url ?? ''); res.writeHead(req.url === '/ui-tests/r_A/' ? 200 : 404).end() })
    const other = await stubServer()
    cleanup.push(() => same.close(), () => other.close())
    await expect(ensureServerKnowsRun({ url: same.url, started: false }, 'r_A')).resolves.toBeUndefined()
    expect(asked).toEqual(['/ui-tests/r_A/'])
    const refused = ensureServerKnowsRun({ url: other.url, started: false }, 'r_A')
    await expect(refused).rejects.toBeInstanceOf(ServerReadsAnotherStore)
    await expect(refused).rejects.toThrow(`ui-tests server at ${other.url} does not read this project's store: stop it, or point UI_TESTS_DATABASE_URL at the same store`)
    // A server this command started reads its store: it is not asked.
    await expect(ensureServerKnowsRun({ url: other.url, started: true }, 'r_A')).resolves.toBeUndefined()
    await expect(ensureServerKnowsRun({ url: `http://127.0.0.1:${await freePort()}`, started: false }, 'r_A')).rejects.toBeInstanceOf(ServerUnreachable)
  })
})
