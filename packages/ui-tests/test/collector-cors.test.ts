import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { createCollector } from '../src/server/collector.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { CompiledStudy } from '../src/schema/compiled.ts'
import type { RunRow } from '../src/store/types.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const server = 'http://ui-tests.test'
const endpoint = `${server}/api/ui-tests`
const app = 'http://app.test'
let compiled: CompiledStudy
let store: SqliteStore
let run: RunRow
let collect: (request: Request) => Promise<Response>

beforeAll(async () => {
  const { code } = await bundleStudyFile(file)
  compiled = compileStudy((await loadBundle(code, file))[0]!, {})
})
beforeEach(async () => {
  store = new SqliteStore(':memory:')
  const handler = createCollector({ store: async () => store, now: () => Date.parse('2026-10-19T10:00:00.000Z'), publicUrl: server })
  // No answer ever allows credentials.
  collect = async (request) => {
    const response = await handler(request)
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
    return response
  }
  run = (await store.createRun(newRun('k', { compiled, target: app, deadline: '2099-01-01T00:00:00.000Z' }))).run
})

type Init = { auth?: string; cookie?: string; origin?: string; path?: string }
const post = (body: unknown, init: Init = {}) =>
  collect(new Request(`${endpoint}${init.path ?? ''}`, {
    method: 'POST',
    headers: {
      ...(init.auth && { Authorization: `Bearer ${init.auth}` }),
      ...(init.cookie && { Cookie: init.cookie }),
      ...(init.origin && { Origin: init.origin }),
    },
    body: JSON.stringify(body),
  }))
const preflight = (origin: string, query = `?run=${run.run}`, extra: Record<string, string> = {}) =>
  collect(new Request(`${endpoint}${query}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', ...extra } }))

/** An active attempt, its participant token and a code handed off to the app. */
async function handedOff() {
  const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false, setupValues: { start: '/' } })
  await post({ action: 'consent' }, { auth: token })
  await post({ action: 'begin' }, { auth: token })
  const { url } = await (await post({ action: 'handoff' }, { auth: token })).json()
  return { attempt, token, code: url.split('.').at(-1) as string }
}
const exchange = (code: string, origin = app) => post({ code }, { path: `/exchange?run=${run.run}`, origin })

describe('CORS', () => {
  it('answers a preflight only for the run\'s own origins', async () => {
    const allowed = await preflight(app)
    expect(allowed.status).toBe(204)
    expect(Object.fromEntries(allowed.headers)).toMatchObject({
      'access-control-allow-origin': app,
      'access-control-allow-methods': 'GET, POST',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '600',
      vary: 'Origin',
    })
    expect(allowed.headers.has('access-control-allow-private-network')).toBe(false)
    const local = await preflight(app, `?run=${run.run}`, { 'Access-Control-Request-Private-Network': 'true' })
    expect(local.headers.get('access-control-allow-private-network')).toBe('true')

    const evil = await preflight('http://evil.test')
    expect(evil.status).toBe(403)
    expect(evil.headers.has('access-control-allow-origin')).toBe(false)
    const unnamed = await preflight(app, '')
    expect(unnamed.status).toBe(403)
    expect(unnamed.headers.has('access-control-allow-origin')).toBe(false)
    expect((await preflight(app, '?run=r_00000000000000000000000000')).status).toBe(403)
  })

  it('refuses a cross-origin request carried by the cookie or the participant token', async () => {
    const { token, code } = await handedOff()
    const path = `?run=${run.run}`
    const events = { action: 'events', events: [] }
    const byCookie = await post(events, { cookie: `ui-tests-run=${token}`, origin: app, path })
    expect(byCookie.status).toBe(403)
    expect((await post(events, { auth: token, origin: app, path })).status).toBe(403)
    const { key } = await (await exchange(code)).json()
    const byKey = await post(events, { auth: key, origin: app, path })
    expect(byKey.status).toBe(200)
    expect(byKey.headers.get('access-control-allow-origin')).toBe(app)
    expect(byKey.headers.get('vary')).toBe('Origin')
    // The key is refused from another origin, and without naming its run.
    expect((await post(events, { auth: key, origin: 'http://evil.test', path })).status).toBe(403)
    expect((await post(events, { auth: key, origin: app })).status).toBe(403)
  })

  it('answers a refusal of an allowed origin readably', async () => {
    const unknown = await post({ action: 'events', events: [] }, { auth: '0'.repeat(64), origin: app, path: `?run=${run.run}` })
    expect(unknown.status).toBe(401)
    expect(unknown.headers.get('access-control-allow-origin')).toBe(app)
  })

  it('refuses an exchange from another origin', async () => {
    const { code } = await handedOff()
    const evil = await exchange(code, 'http://evil.test')
    expect(evil.status).toBe(403)
    expect(evil.headers.has('access-control-allow-origin')).toBe(false)
    const ok = await exchange(code)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('access-control-allow-origin')).toBe(app)
  })

  it('keeps the player\'s same-origin path', async () => {
    const { token } = await store.createAttempt({ runId: run.run, participant: 'p_2', goalIndex: 0, rehearsal: false })
    const consented = await post({ action: 'consent' }, { cookie: `ui-tests-run=${token}`, origin: server })
    expect(consented.status).toBe(200)
    expect(consented.headers.has('access-control-allow-origin')).toBe(false)
    expect((await post({ action: 'consent' }, { cookie: `ui-tests-run=${token}`, origin: 'http://evil.test' })).status).toBe(403)
  })
})
