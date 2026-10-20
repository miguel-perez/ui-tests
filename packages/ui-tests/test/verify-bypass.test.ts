import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { request } from 'playwright-core'
import { verifyRun, withBypass } from '../src/verify.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'bypass.ui.test.ts')
const SECRET = 'bypass-secret'
let code: string
const servers: Server[] = []

beforeAll(async () => { code = (await bundleStudyFile(file)).code })
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise(r => s.close(r)))) })

/** A server that records the headers it was sent; `protect` answers 401 (the login page) unless the bypass header is right. */
async function serve(protect: boolean): Promise<{ url: string; seen: IncomingHttpHeaders[] }> {
  const seen: IncomingHttpHeaders[] = []
  const server = createServer((req, res) => {
    seen.push(req.headers)
    const ok = !protect || req.headers['x-vercel-protection-bypass'] === SECRET
    res.writeHead(ok ? 200 : 401, { 'Content-Type': 'text/plain' }).end(ok ? '[]' : 'Log in to Vercel')
  })
  servers.push(server)
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, seen }
}

async function verdict(bypass?: string) {
  const target = await serve(true)
  const elsewhere = await serve(false)
  const studies = await loadBundle(code, file)
  const store = new SqliteStore(':memory:')
  const { run } = await store.createRun(newRun('k', { compiled: compileStudy(studies[0]!, {}), hooksBundle: code, target: target.url }))
  const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false, setupValues: { elsewhere: `${elsewhere.url}/ping` } })
  await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', startedAt: new Date().toISOString() })
  await verifyRun(store, run.run, bypass ? { bypass } : {})
  const result = (await store.getAttempt(attempt.id))!.verification
  await store.close()
  return { result, target, elsewhere }
}

describe('outcome hooks against a protected preview', () => {
  it('send the bypass header to the target, so the outcome reads the app and not the login page', async () => {
    const { result, target } = await verdict(SECRET)
    expect(result?.status).toBe('correct')
    expect(target.seen.every(h => h['x-vercel-protection-bypass'] === SECRET)).toBe(true)
  })

  it('never send it to another origin', async () => {
    const { elsewhere } = await verdict(SECRET)
    expect(elsewhere.seen).toHaveLength(1)
    expect(elsewhere.seen[0]!['x-vercel-protection-bypass']).toBeUndefined()
  })

  it('without the secret, the protected target answers its login page and the outcome fails', async () => {
    const { result } = await verdict()
    expect(result?.status).toBe('incorrect')
  })

  it('never follows a redirect to another origin with it, and follows a same-origin redirect with it', async () => {
    const elsewhere = await serve(false)
    // A target that redirects to its own /next and to the other origin.
    const seen: IncomingHttpHeaders[] = []
    const redirecting = createServer((req, res) => {
      seen.push(req.headers)
      if (req.url === '/away') return void res.writeHead(302, { Location: `${elsewhere.url}/ping` }).end()
      if (req.url === '/home') return void res.writeHead(302, { Location: '/next' }).end()
      res.writeHead(200).end('ok')
    })
    servers.push(redirecting)
    await new Promise<void>(r => redirecting.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(redirecting.address() as AddressInfo).port}`
    const context = withBypass(await request.newContext({ baseURL: base }), base, SECRET)
    expect((await context.get('/away')).status()).toBe(200)
    expect(elsewhere.seen).toHaveLength(1)
    expect(elsewhere.seen[0]!['x-vercel-protection-bypass']).toBeUndefined()
    seen.length = 0
    expect((await context.get('/home')).status()).toBe(200)
    expect(seen.map(h => h['x-vercel-protection-bypass'])).toEqual([SECRET, SECRET])
    await context.dispose()
  })

  describe('follows redirects by the rules of fetch', () => {
    interface Seen { method?: string; url?: string; body: string; headers: IncomingHttpHeaders }
    async function hops(): Promise<{ base: string; seen: Seen[]; other: Seen[]; otherBase: string }> {
      const seen: Seen[] = []
      const other: Seen[] = []
      const record = (list: Seen[]) => (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, then: () => void) => {
        const chunks: Buffer[] = []
        req.on('data', c => chunks.push(c as Buffer))
        req.on('end', () => { list.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString(), headers: req.headers }); then() })
        void res
      }
      const elsewhere = createServer((req, res) => record(other)(req, res, () => void res.writeHead(200).end('ok')))
      servers.push(elsewhere)
      await new Promise<void>(r => elsewhere.listen(0, '127.0.0.1', r))
      const otherBase = `http://127.0.0.1:${(elsewhere.address() as AddressInfo).port}`
      const main = createServer((req, res) => record(seen)(req, res, () => {
        const url = req.url ?? ''
        const status = Number(/^\/r(\d+)/.exec(url)?.[1] ?? 0)
        if (url.includes('/out')) return void res.writeHead(status, { Location: `${otherBase}/ping` }).end()
        if (url.endsWith('/chain')) return void res.writeHead(302, { Location: '/chain2' }).end()
        if (url.endsWith('/chain2')) return void res.writeHead(302, { Location: '/done' }).end()
        res.writeHead(status || 200, status ? { Location: '/done' } : {}).end('ok')
      }))
      servers.push(main)
      await new Promise<void>(r => main.listen(0, '127.0.0.1', r))
      return { base: `http://127.0.0.1:${(main.address() as AddressInfo).port}`, seen, other, otherBase }
    }
    const open = async (base: string) => withBypass(await request.newContext({ baseURL: base }), base, SECRET)

    it('turns a POST into a GET without its body after 302, and keeps both after 307', async () => {
      const { base, seen } = await hops()
      const context = await open(base)
      await context.post('/r302', { data: 'payload' })
      expect(seen.map(h => [h.method, h.body])).toEqual([['POST', 'payload'], ['GET', '']])
      seen.length = 0
      await context.post('/r307', { data: 'payload' })
      expect(seen.map(h => [h.method, h.body])).toEqual([['POST', 'payload'], ['POST', 'payload']])
      seen.length = 0
      await context.put('/r302', { data: 'payload' })
      expect(seen.map(h => h.method)).toEqual(['PUT', 'PUT'])
      seen.length = 0
      await context.put('/r303', { data: 'payload' })
      expect(seen.map(h => h.method)).toEqual(['PUT', 'GET'])
      await context.dispose()
    })

    it('drops Authorization, Cookie and params when it leaves the origin, and sends no bypass header there', async () => {
      const { base, other } = await hops()
      const context = await open(base)
      await context.get('/r302/out', { headers: { Authorization: 'Bearer x', Cookie: 'a=b', 'X-Keep': '1' }, params: { q: '1' } })
      expect(other).toHaveLength(1)
      expect(other[0]!.url).toBe('/ping')
      expect(other[0]!.headers.authorization).toBeUndefined()
      expect(other[0]!.headers.cookie).toBeUndefined()
      expect(other[0]!.headers['x-keep']).toBe('1')
      expect(other[0]!.headers['x-vercel-protection-bypass']).toBeUndefined()
      await context.dispose()
    })

    it('respects maxRedirects: 0 as the caller\'s response, and a limit as an error', async () => {
      const { base } = await hops()
      const context = await open(base)
      expect((await context.get('/chain', { maxRedirects: 0 })).status()).toBe(302)
      await expect(context.get('/chain', { maxRedirects: 1 })).rejects.toThrow('Max redirect count exceeded')
      expect((await context.get('/chain', { maxRedirects: 2 })).status()).toBe(200)
      await context.dispose()
    })

    it('counts the redirects of a cross-origin hop against the same maxRedirects budget', async () => {
      const far = createServer((req, res) => {
        const url = req.url ?? ''
        if (url === '/a') return void res.writeHead(302, { Location: '/b' }).end()
        if (url === '/b') return void res.writeHead(302, { Location: '/c' }).end()
        res.writeHead(200).end('ok')
      })
      servers.push(far)
      await new Promise<void>(r => far.listen(0, '127.0.0.1', r))
      const farBase = `http://127.0.0.1:${(far.address() as AddressInfo).port}`
      const near = createServer((_req, res) => void res.writeHead(302, { Location: `${farBase}/a` }).end())
      servers.push(near)
      await new Promise<void>(r => near.listen(0, '127.0.0.1', r))
      const nearBase = `http://127.0.0.1:${(near.address() as AddressInfo).port}`
      const context = withBypass(await request.newContext({ baseURL: nearBase }), nearBase, SECRET)
      await expect(context.get('/', { maxRedirects: 2 })).rejects.toThrow('Max redirect count exceeded')
      expect((await context.get('/', { maxRedirects: 3 })).status()).toBe(200)
      await context.dispose()
    })
  })
})
