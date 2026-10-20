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
})
