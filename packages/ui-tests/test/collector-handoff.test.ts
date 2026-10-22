import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { createParticipant } from '../src/runner/invites.ts'

import { createCollector } from '../src/server/collector.ts'
import { handoffUrl } from '../src/server/handoff.ts'
import type { BarView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { CompiledStudy } from '../src/schema/compiled.ts'
import type { AttemptRow, RunRow } from '../src/store/types.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const server = 'http://ui-tests.test'
const endpoint = `${server}/api/ui-tests`
const app = 'http://app.test'
const barKeys: (keyof BarView)[] = ['run', 'attempt', 'status', 'goal', 'record', 'brand', 'tour', 'rehearsal']
let compiled: CompiledStudy
let store: SqliteStore
let run: RunRow
let clock: number
let collect: (request: Request) => Promise<Response>

beforeAll(async () => {
  const { code } = await bundleStudyFile(file)
  const full = compileStudy((await loadBundle(code, file))[0]!, {})
  // Two goals, and a first look on the app's own site, toured with the bar there.
  compiled = { ...full, goals: full.goals.slice(0, 2), impression: { ...full.impression, on: true, page: '/landing' } }
})
beforeEach(async () => {
  clock = Date.parse('2026-10-19T10:00:00.000Z')
  store = new SqliteStore(':memory:')
  const handler = createCollector({ store: async () => store, now: () => clock, publicUrl: server })
  // No answer ever allows credentials.
  collect = async (request) => {
    const response = await handler(request)
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
    return response
  }
  run = (await store.createRun(newRun('k', { compiled, target: app, deadline: '2099-01-01T00:00:00.000Z' }))).run
})

const post = (auth: string | undefined, body: unknown, path = '', origin?: string) =>
  collect(new Request(`${endpoint}${path}`, {
    method: 'POST',
    headers: { ...(auth && { Authorization: `Bearer ${auth}` }), ...(origin && { Origin: origin }) },
    body: JSON.stringify(body),
  }))
const get = (auth: string) => collect(new Request(`${endpoint}?run=${run.run}`, { headers: { Authorization: `Bearer ${auth}`, Origin: app } }))
const exchange = (code: string) => post(undefined, { code }, `/exchange?run=${run.run}`, app)
const snap = { url: `${app}/done`, dom: '<html></html>' }

async function person(): Promise<{ attempt: AttemptRow; token: string }> {
  return createParticipant(store, { run, participant: 'invite-1', setupValues: { start: '/board', code: 'abc' } })
}
/** Hands the attempt off and exchanges the code; returns the key. */
async function keyFor(token: string): Promise<string> {
  const { url } = await (await post(token, { action: 'handoff' })).json()
  const response = await exchange(url.split('.').at(-1))
  expect(response.status).toBe(200)
  return (await response.json()).key
}
const withKey = (key: string, body: unknown) => post(key, body, `?run=${run.run}`, app)

describe('handoff', () => {
  it('hands off an active attempt to the app with a one-time code in the fragment', async () => {
    const { attempt, token } = await person()
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    const handed = await post(token, { action: 'handoff' })
    expect(handed.status).toBe(200)
    const { url } = await handed.json()
    expect(url).toMatch(/^http:\/\/app\.test\/board#ui-tests=r_[0-9A-Z]{26}\.[0-9a-f]{64}$/)
    expect(url).toContain(`#ui-tests=${run.run}.`)
    const code = url.split('.').at(-1)
    // Without an Origin it is not a page's request: refused, and the code is not spent.
    expect((await post(undefined, { code }, `/exchange?run=${run.run}`)).status).toBe(403)
    const first = await exchange(code)
    expect(first.status).toBe(200)
    const body = await first.json()
    expect(body).toEqual({ key: expect.stringMatching(/^[0-9a-f]{64}$/), run: run.run, attempt: attempt.id, expiresAt: clock + 7_200_000 })
    expect((await exchange(code)).status).toBe(401)
  })

  it('refuses a code after 60 seconds', async () => {
    const { token } = await person()
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    const { url } = await (await post(token, { action: 'handoff' })).json()
    clock += 60_000
    expect((await exchange(url.split('.').at(-1))).status).toBe(401)
  })

  it('refuses a code for another run', async () => {
    const { token } = await person()
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    const { url } = await (await post(token, { action: 'handoff' })).json()
    const other = (await store.createRun(newRun('k2', { compiled, target: app }))).run
    expect((await post(undefined, { code: url.split('.').at(-1) }, `/exchange?run=${other.run}`, app)).status).toBe(401)
  })

  it('keeps the app\'s own fragment', () => {
    expect(handoffUrl('/#/board', 'http://app.test', 'r_X', 'c')).toBe('http://app.test/#/board&ui-tests=r_X.c')
    expect(handoffUrl('https://elsewhere.test/a', 'http://app.test', 'r_X', 'c')).toBe('https://elsewhere.test/a#ui-tests=r_X.c')
  })

  it('refuses a handoff before consent', async () => {
    const { token } = await person()
    const refused = await post(token, { action: 'handoff' })
    expect(refused.status).toBe(409)
    expect(await refused.text()).toBe('Nothing to hand off')
  })

  it('hands off a consented attempt to the first-look page only while it is still to be toured', async () => {
    const { token } = await person()
    await post(token, { action: 'consent' })
    const tour = await post(token, { action: 'handoff' })
    expect(tour.status).toBe(200)
    // The tour is of the first look's page, not the task's start.
    expect(new URL((await tour.json()).url).pathname).toBe('/landing')
    expect((await post(token, { action: 'answers', looked: true })).status).toBe(200)
    expect((await post(token, { action: 'handoff' })).status).toBe(409)
  })

  it('takes the answer only after the look, and codes nothing without a model', async () => {
    const { attempt, token } = await person()
    await post(token, { action: 'consent' })
    expect((await post(token, { action: 'answers', impression: 'a project board' })).status).toBe(409)
    await post(token, { action: 'answers', looked: true })
    expect((await post(token, { action: 'answers', impression: 'a project board' })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))!.answers.impression).toEqual({ looked: true, text: 'a project board', parts: null, uncoded: 'no model is configured' })
  })
})

describe('attempt key', () => {
  it('does only what the bar does', async () => {
    const { attempt, token } = await person()
    await post(token, { action: 'consent' })
    const key = await keyFor(token)

    const looking = await get(key)
    expect(looking.status).toBe(200)
    expect((await looking.json()).tour).toBe(true)
    expect((await withKey(key, { action: 'answers', looked: true })).status).toBe(200)
    expect((await get(key).then(r => r.json())).tour).toBe(false)
    expect((await withKey(key, { action: 'answers', ease: 5 })).status).toBe(403)
    expect((await withKey(key, { action: 'answers', looked: true, comment: 'x' })).status).toBe(403)
    expect((await withKey(key, { action: 'answers', impression: 'a board' })).status).toBe(403)
    expect((await post(token, { action: 'begin' })).status).toBe(200)
    expect((await withKey(key, { action: 'events', events: [{ type: 'click', at: 1, url: `${app}/board` }] })).status).toBe(200)
    expect((await withKey(key, { action: 'step', index: 0 })).status).toBe(200)
    expect((await withKey(key, { action: 'more-time' })).status).toBe(200)
    expect((await withKey(key, { action: 'end', reason: 'done', snapshot: snap })).status).toBe(200)
    for (const action of ['withdraw', 'consent', 'begin', 'handoff']) {
      const refused = await withKey(key, { action })
      expect(refused.status).toBe(403)
      expect(await refused.text()).toBe('Not allowed with an attempt key')
    }
    expect((await withKey(key, { action: 'voice', question: 'anything', audio: 'AAAA', contentType: 'audio/webm' })).status).toBe(403)

    const view = await (await get(key)).json()
    expect(Object.keys(view).sort()).toEqual([...barKeys].sort())
    const keys = (value: unknown): string[] => typeof value === 'object' && value !== null ? Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)]) : []
    for (const hidden of ['consent', 'questions', 'screener', 'answer', 'start']) expect(keys(view)).not.toContain(hidden)
    // The task text the bar shows again on request, as the person read it on the player.
    expect(Object.keys(view.goal).sort()).toEqual(['name', 'scenario', 'steps', 'timeoutSeconds'])
    expect(view.goal.scenario).toEqual(expect.any(String))
    expect(view).toMatchObject({ run: run.run, attempt: attempt.id, status: 'questions', tour: false })
  })

  it('answers a POST with the bar view, not the participant view', async () => {
    const { token } = await person()
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    const key = await keyFor(token)
    const reply = await (await withKey(key, { action: 'events', events: [] })).json()
    expect(Object.keys(reply).sort()).toEqual([...barKeys].sort())
  })

  it('is bound to its attempt', async () => {
    const { attempt, token } = await person()
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    const key = await keyFor(token)
    await post(token, { action: 'end', reason: 'done', snapshot: snap })
    const next = await (await post(token, { action: 'answers', ease: 6 })).json()
    expect(next.attempt).not.toBe(attempt.id)
    expect((await (await get(key)).json()).attempt).toBe(attempt.id)
    const refused = await withKey(key, { action: 'events', events: [] })
    expect(refused.status).toBe(409)
    expect(await refused.text()).toBe('Attempt is not active')
  })

  it('is revoked by withdrawal', async () => {
    const { token } = await person()
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    const key = await keyFor(token)
    expect((await post(token, { action: 'withdraw' })).status).toBe(200)
    expect((await get(key)).status).toBe(401)
  })

  it('lets any reader ask for the bar view', async () => {
    const { token } = await person()
    const view = await (await collect(new Request(`${endpoint}?t=${token}&view=bar`))).json()
    expect(Object.keys(view).sort()).toEqual([...barKeys].sort())
  })
})
