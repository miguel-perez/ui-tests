import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { signPath } from '../src/report/sign.ts'
import { createParticipant } from '../src/runner/invites.ts'
import { createHandler, type ServerOptions } from '../src/server/handler.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { CompiledStudy } from '../src/schema/compiled.ts'
import type { RunRow } from '../src/store/types.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const SECRET = 'share-secret'
const server = 'http://127.0.0.1:4300'
let compiled: CompiledStudy
let store: SqliteStore
let run: RunRow

beforeAll(async () => {
  const { code } = await bundleStudyFile(file)
  compiled = compileStudy((await loadBundle(code, file))[0]!, {})
})
beforeEach(async () => {
  store = new SqliteStore(':memory:')
  run = (await store.createRun(newRun('k', { compiled, target: 'http://app.test', deadline: '2099-01-01T00:00:00.000Z' }))).run
})

const handlerWith = (options: Partial<ServerOptions> = {}) => createHandler({ store: async () => store, shareSecret: SECRET, ...options })
const get = (path: string, options?: Partial<ServerOptions>) => handlerWith(options)(new Request(`${server}${path}`))

describe('ui-tests serve', () => {
  it('answers its health check', async () => {
    const response = await get('/healthz')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, name: 'ui-tests' })
  })

  it('serves the loader to any page, never with credentials, and its assets for ever', async () => {
    const loader = await get('/ui-tests.js')
    expect(loader.status).toBe(200)
    expect(loader.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(loader.headers.get('cache-control')).toBe('no-cache')
    expect(loader.headers.get('access-control-allow-origin')).toBe('*')
    expect(loader.headers.has('access-control-allow-credentials')).toBe(false)
    const body = await loader.text()
    const asset = /from '\.(\/ui-tests\/assets\/[^']+)'/.exec(body)?.[1]
    expect(asset).toMatch(/^\/ui-tests\/assets\/ui-tests-[A-Z0-9]+\.js$/)
    const imported = await get(asset!)
    expect(imported.status).toBe(200)
    expect(imported.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(imported.headers.get('access-control-allow-origin')).toBe('*')
    expect(imported.headers.has('access-control-allow-credentials')).toBe(false)
    expect((await get('/ui-tests/assets/nope.js')).status).toBe(404)
  }, 60_000)

  it('serves the player for a run, framed by nobody and naming no referrer', async () => {
    const page = await get(`/ui-tests/${run.run}/`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(page.headers.get('referrer-policy')).toBe('no-referrer')
    expect(page.headers.get('x-frame-options')).toBe('DENY')
    expect(page.headers.get('cache-control')).toBe('no-store')
    const html = await page.text()
    expect(html).toContain(`data-run="${run.run}"`)
    expect(html).toMatch(/<script type="module" src="\/ui-tests\/assets\/player-[A-Z0-9]+\.js"><\/script>/)
    expect(html.toLowerCase()).not.toContain('<title>ui-tests')
    const bare = await get(`/ui-tests/${run.run}`)
    expect(bare.status).toBe(308)
    expect(bare.headers.get('location')).toBe(`/ui-tests/${run.run}/`)
    expect((await get('/ui-tests/r_nope/')).status).toBe(404)
  }, 60_000)

  it('mounts the collector', async () => {
    expect((await get('/api/ui-tests/')).status).toBe(401)
    const preflight = await handlerWith()(new Request(`${server}/api/ui-tests/exchange?run=${run.run}`, { method: 'OPTIONS', headers: { Origin: 'http://app.test' } }))
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://app.test')
    const exchange = await handlerWith()(new Request(`${server}/api/ui-tests/exchange?run=${run.run}`, { method: 'POST', headers: { Origin: 'http://app.test' }, body: JSON.stringify({ code: 'nope' }) }))
    expect(exchange.status).toBeGreaterThanOrEqual(400)
    expect(exchange.status).toBeLessThan(500)
  })

  it('serves the shared report only to its own signature, and never for an agent run', async () => {
    const report = await get(`/r/${run.run}?sig=${signPath(`/r/${run.run}`, SECRET)}`)
    expect(report.status).toBe(200)
    expect(report.headers.get('referrer-policy')).toBe('no-referrer')
    expect(report.headers.get('x-frame-options')).toBe('DENY')
    const html = await report.text()
    expect(html).toContain('<title>Report · verify fixture</title>')
    expect(html.toLowerCase()).not.toContain('ui-tests')
    expect((await get(`/r/${run.run}/?sig=${signPath(`/r/${run.run}`, SECRET)}`)).status).toBe(200)
    expect((await get(`/r/${run.run}?sig=${signPath(`/r/${run.run}`, 'other')}`)).status).toBe(404)
    expect((await get(`/r/${run.run}`)).status).toBe(404)
    expect((await get(`/r/${run.run}?sig=${signPath(`/r/${run.run}`, SECRET)}`, { shareSecret: undefined })).status).toBe(404)
    expect((await get(`/r/${run.run}/p1?sig=${signPath(`/r/${run.run}/p1`, SECRET)}`)).status).toBe(404)
    const agent = (await store.createRun(newRun('agent', { compiled, actor: 'agent' }))).run
    expect((await get(`/r/${agent.run}?sig=${signPath(`/r/${agent.run}`, SECRET)}`)).status).toBe(404)
  })

  it('serves a person\'s page with the replay script and a signed video link', async () => {
    const { attempt } = await createParticipant(store, { run, participant: 'invite-1' })
    const blob = await store.putBlob(attempt.id, 'video', new Uint8Array([1, 2, 3]), 'video/webm')
    await store.updateAttempt(attempt.id, {
      status: 'finished', reason: 'done', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(20_000).toISOString(),
      answers: { ...attempt.answers, video: { chunks: [{ segment: 1000, seq: 0, blob, size: 3 }], pauses: {} } },
    })
    const page = await get(`/r/${run.run}/p1/?sig=${signPath(`/r/${run.run}/p1`, SECRET)}`)
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain(`/rv/${run.run}/p1/?sig=${signPath(`/rv/${run.run}/p1`, SECRET)}&amp;s=1000`)
    const video = await get(`/rv/${run.run}/p1?sig=${signPath(`/rv/${run.run}/p1`, SECRET)}&s=1000`)
    expect(video.status).toBe(200)
    expect(new Uint8Array(await video.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect((await get(`/rv/${run.run}/p1?sig=${signPath(`/rv/${run.run}/p1`, 'other')}`)).status).toBe(404)
    expect((await get(`/rv/${run.run}/p1?sig=${signPath(`/rv/${run.run}/p1`, SECRET)}`, { shareSecret: undefined })).status).toBe(404)
    await store.updateAttempt(attempt.id, { purposes: [] })
    expect((await get(`/rv/${run.run}/p1?sig=${signPath(`/rv/${run.run}/p1`, SECRET)}`)).status).toBe(404)
  })

  it('answers 404 to anything else', async () => {
    for (const path of ['/', '/ui-tests', '/api/other', '/ui-tests/a/b', '/runs/x/']) expect((await get(path)).status, path).toBe(404)
  })

  it('honours the public address behind a proxy', async () => {
    const handle = handlerWith({ publicUrl: 'https://tests.example.com' })
    const { token } = await createParticipant(store, { run, participant: 'invite-1' })
    const endpoint = 'http://10.0.0.2:4300/api/ui-tests/'
    const consent = await handle(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'consent' }) }))
    expect(consent.status).toBe(200)
    const cookie = consent.headers.getSetCookie().find((c) => c.startsWith('ui-tests-run='))!
    expect(cookie).toMatch(/; Secure$/)
    const begin = (origin: string) => handle(new Request(endpoint, { method: 'POST', headers: { Cookie: cookie.split(';')[0]!, Origin: origin }, body: JSON.stringify({ action: 'begin' }) }))
    expect((await begin('http://10.0.0.2:4300')).status).toBe(403)
    expect((await begin('https://tests.example.com')).status).toBe(200)
  })
})
