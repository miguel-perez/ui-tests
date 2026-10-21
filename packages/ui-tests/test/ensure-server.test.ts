import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ensureServer, ServerUnreachable, takesForwardedHost } from '../src/cli/ensure-server.ts'
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

  it('starts one with no public address for a front door, so the door\'s address is its own', async () => {
    const url = `http://127.0.0.1:${await freePort()}`
    const server = await ensureServer({ url, store, io: io(), publicUrl: false })
    cleanup.push(() => server.close())
    expect(server.started).toBe(true)
    expect(vi.mocked(startServer).mock.calls[0]![0]).not.toHaveProperty('publicUrl')
    expect(await takesForwardedHost(url)).toBe(true)
  })

  it('tells a server that takes the forwarded address from one pinned to its own', async () => {
    const port = await freePort()
    const pinned = await startServer({ store: async () => store, port, host: '127.0.0.1', publicUrl: `http://127.0.0.1:${port}` })
    cleanup.push(() => pinned.close())
    expect(await takesForwardedHost(pinned.url)).toBe(false)
    // Another service, or nothing at all, does not take it either.
    const other = await stubServer((_req, res) => res.end('ok'))
    cleanup.push(() => other.close())
    expect(await takesForwardedHost(other.url)).toBe(false)
    expect(await takesForwardedHost(`http://127.0.0.1:${await freePort()}`)).toBe(false)
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
