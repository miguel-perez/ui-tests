import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { createCollector } from '../src/server/collector.ts'
import { participantView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { AttemptRow, RunRow } from '../src/store/types.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const origin = 'http://app.test'
const endpoint = `${origin}/api/ui-tests`
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
let run: RunRow
let clock: number
let collect: (request: Request) => Promise<Response>

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  studies = await loadBundle(code, file)
})
beforeEach(async () => {
  clock = Date.parse('2026-10-19T10:00:00.000Z')
  store = new SqliteStore(':memory:')
  collect = createCollector({ store: async () => store, cliSecret: 'cli-secret', now: () => clock })
  run = (await store.createRun(newRun('k', { compiled: compileStudy(studies[0], {}), hooksBundle: code }))).run
})

async function start(goalIndex = 0, extra: { rehearsal?: boolean } = {}): Promise<{ attempt: AttemptRow; token: string }> {
  return store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex, rehearsal: false, setupValues: { start: '/', code: 'abc' }, ...extra })
}
const post = (token: string | undefined, body: unknown, init: { cookie?: string; origin?: string; query?: string } = {}) =>
  collect(new Request(`${endpoint}${init.query ?? ''}`, {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(init.cookie && { Cookie: init.cookie }),
      ...(init.origin && { Origin: init.origin }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
const get = (token?: string, query = '') => collect(new Request(`${endpoint}${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }))
const snap = (dom = '<html></html>') => ({ url: `${origin}/done`, dom })
async function active(goalIndex = 0) {
  const made = await start(goalIndex)
  expect((await post(made.token, { action: 'consent' })).status).toBe(200)
  expect((await post(made.token, { action: 'begin' })).status).toBe(200)
  return made
}

describe('view', () => {
  it('answers 401 without a token and with a token that is not this run\'s', async () => {
    const { token } = await start()
    expect((await get()).status).toBe(401)
    expect((await get('0'.repeat(64))).status).toBe(401)
    const other = (await store.createRun(newRun('k2', { compiled: run.compiled }))).run
    expect((await get(token, `?run=${other.run}`)).status).toBe(401)
    expect((await get(token, `?run=${run.run}`)).status).toBe(200)
  })

  it('accepts the token as ?t= on GET only', async () => {
    const { token } = await start()
    expect((await collect(new Request(`${endpoint}?t=${token}`))).status).toBe(200)
    expect((await collect(new Request(`${endpoint}?t=${token}`, { method: 'POST', body: JSON.stringify({ action: 'consent' }) }))).status).toBe(401)
  })

  it('carries what the player needs and nothing from the hooks, path, expected answer or purpose', async () => {
    const { token } = await start()
    const text = await (await get(token)).text()
    expect(text).not.toContain('/docs/getting-started')
    for (const key of ['"path"', '"expected"', '"purpose"', '"hookText"', '"hooksBundle"', '"derivations"', '"label"']) expect(text).not.toContain(key)
    const view = JSON.parse(text)
    expect(view).toMatchObject({ run: run.run, status: 'created', hasVerification: true, record: 'events', rehearsal: false, brand: { poweredBy: false } })
    expect(view.goal).toMatchObject({ name: 'Reach docs', start: '/', steps: [], timeoutSeconds: run.compiled.goals[0]!.timeout.seconds })
    expect(view.consent).toMatchObject({ purposes: run.compiled.consent.purposes, payout: run.compiled.consent.payout })
    expect(view).not.toHaveProperty('answer')
  })

  it('gives the question and choices of an answer goal, never the expected answer key', async () => {
    const { token } = await start(5)
    const view = await (await get(token)).json()
    expect(view.hasVerification).toBe(true)
    expect(view.answer.question).toBe('Which plan was shown?')
    expect(view.answer.choices).toEqual(expect.arrayContaining(['Team', 'Solo', 'Org']))
    expect(JSON.stringify(view)).not.toContain('expected')
  })

  it('fills the scenario with the attempt\'s setup values', async () => {
    const compiled = structuredClone(run.compiled)
    compiled.goals[0]!.scenario = { text: 'Use code {code} to sign in.', pinned: true }
    compiled.goals[1]!.scenario = { text: 'unused', pinned: false }
    const other = (await store.createRun(newRun('k3', { compiled }))).run
    const a = (await store.createAttempt({ runId: other.run, participant: 'p', goalIndex: 0, rehearsal: false, setupValues: { start: '/', code: 'zz9' } })).attempt
    expect(participantView(other, a).goal.scenario).toBe('Use code zz9 to sign in.')
    const b = (await store.createAttempt({ runId: other.run, participant: 'p', goalIndex: 1, rehearsal: false, setupValues: { start: '/', code: 'zz9' } })).attempt
    expect(participantView(other, b).goal.scenario).toContain('Use these details: code zz9')
  })

  it('shows the last goal the study questions', async () => {
    const last = run.compiled.goals.length - 1
    const view = await (await get((await start(last)).token)).json()
    expect(view.questions.map((q: { id: string }) => q.id)).toEqual(expect.arrayContaining(['useful', 'easy', 'anything']))
  })
})

describe('actions', () => {
  it('consent sets the HttpOnly run cookie and the readable active cookie', async () => {
    const { token } = await start()
    const response = await post(token, { action: 'consent' })
    const cookies = response.headers.getSetCookie()
    expect(cookies).toContain(`ui-tests-run=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200`)
    expect(cookies).toContain('ui-tests-active=1; Path=/; SameSite=Lax; Max-Age=7200')
    expect((await response.json()).status).toBe('consented')
    expect((await store.getAttempt((await store.authorize(token))!.attempt.id))?.purposes).toEqual(run.compiled.consent.purposes)
  })

  it('marks the cookies Secure on https', async () => {
    const { token } = await start()
    const response = await collect(new Request('https://app.test/api/ui-tests', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'consent' }) }))
    expect(response.headers.getSetCookie().every((c) => c.endsWith('; Secure'))).toBe(true)
  })

  it('refuses begin before consent', async () => {
    const { token } = await start()
    expect((await post(token, { action: 'begin' })).status).toBe(409)
  })

  it('records events as epoch milliseconds, at most 100 per batch', async () => {
    const { attempt, token } = await active()
    const events = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'click', at: clock + i, url: '/', target: 'button' }))
    expect((await post(token, { action: 'events', events: events(101) })).status).toBe(400)
    expect((await post(token, { action: 'events', events: events(100) })).status).toBe(200)
    expect((await post(token, { action: 'events', events: [{ type: 'url', at: '2026-10-19T10:00:01.000Z', url: '/docs' }] })).status).toBe(200)
    const stored = await store.listEvents(attempt.id)
    expect(stored).toHaveLength(101)
    expect(stored.at(-1)!.at).toBe(Date.parse('2026-10-19T10:00:01.000Z'))
  })

  it('refuses events before the attempt is active', async () => {
    const { token } = await start()
    expect((await post(token, { action: 'events', events: [] })).status).toBe(409)
  })

  it('stores a step snapshot and a step event', async () => {
    const { attempt, token } = await active(4)
    expect((await post(token, { action: 'step', index: 0, snapshot: snap('<p>menu</p>') })).status).toBe(200)
    expect((await store.getSnapshot(attempt.id, 'step-0'))?.dom).toBe('<p>menu</p>')
    expect(await store.listEvents(attempt.id)).toMatchObject([{ type: 'step', step: 0 }])
  })

  it('refuses a cross-origin write that rides on the cookie, and allows Bearer writes from anywhere', async () => {
    const { token } = await start()
    const cookie = `ui-tests-run=${token}`
    expect((await post(undefined, { action: 'consent' }, { cookie, origin: 'http://evil.test' })).status).toBe(403)
    expect((await post(undefined, { action: 'consent' }, { cookie })).status).toBe(403)
    expect((await post(undefined, { action: 'consent' }, { cookie, origin })).status).toBe(200)
    expect((await post(token, { action: 'begin' }, { origin: 'http://cli.test' })).status).toBe(200)
  })

  it('lets the CLI secret act on a named attempt', async () => {
    const { attempt } = await start()
    expect((await post('wrong', { action: 'consent' }, { query: `?attempt=${attempt.id}` })).status).toBe(401)
    expect((await post('cli-secret', { action: 'consent' })).status).toBe(401)
    expect((await post('cli-secret', { action: 'consent' }, { query: `?attempt=${attempt.id}` })).status).toBe(200)
  })

  it('answers 400 for a body that is not JSON or not an action', async () => {
    const { token } = await start()
    expect((await post(token, 'nope')).status).toBe(400)
    expect((await post(token, { action: 'dance' })).status).toBe(400)
  })
})

describe('end', () => {
  it('stores the first end only: a second is 409 and changes nothing (Review Focus 3)', async () => {
    const { attempt, token } = await active()
    clock += 5000
    const first = await post(token, { action: 'end', reason: 'done', snapshot: snap('<p>first</p>') })
    expect(first.status).toBe(200)
    const stored = await store.getAttempt(attempt.id)
    clock += 5000
    const second = await post(token, { action: 'end', reason: 'gave up', snapshot: snap('<p>second</p>') })
    expect(second.status).toBe(409)
    const after = await store.getAttempt(attempt.id)
    expect(after).toMatchObject({ status: 'questions', reason: 'done', endedAt: stored!.endedAt })
    expect((await store.getSnapshot(attempt.id, 'end'))?.dom).toBe('<p>first</p>')
  })

  it('keeps one end when two race', async () => {
    const { attempt, token } = await active()
    const results = await Promise.all([
      post(token, { action: 'end', reason: 'done', snapshot: snap('<p>a</p>') }),
      post(token, { action: 'end', reason: 'gave up', snapshot: snap('<p>b</p>') }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const winner = (await store.getAttempt(attempt.id))!.reason === 'done' ? '<p>a</p>' : '<p>b</p>'
    expect((await store.getSnapshot(attempt.id, 'end'))?.dom).toBe(winner)
  })

  it('stores timeout for an end after the time limit', async () => {
    const { attempt, token } = await active()
    clock += run.compiled.goals[0]!.timeout.seconds * 1000
    expect((await post(token, { action: 'end', reason: 'done', snapshot: snap() })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))?.reason).toBe('timeout')
  })

  it('grants more time once, and the end honours it', async () => {
    const { attempt, token } = await active()
    const seconds = run.compiled.goals[0]!.timeout.seconds
    const view = await (await post(token, { action: 'more-time' })).json()
    expect(view.goal.timeoutSeconds).toBeGreaterThan(seconds)
    expect((await post(token, { action: 'more-time' })).status).toBe(409)
    clock += seconds * 1000
    expect((await post(token, { action: 'end', reason: 'done', snapshot: snap() })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))?.reason).toBe('done')
  })

  it('accepts a 2,000,000-character snapshot that JSON-escaping nearly doubles (Review Focus 5)', async () => {
    const { attempt, token } = await active()
    const dom = '"'.repeat(2_000_000)
    const body = JSON.stringify({ action: 'end', reason: 'done', snapshot: { url: `${origin}/`, dom } })
    expect(Buffer.byteLength(body)).toBeGreaterThan(2_100_000)
    expect((await post(token, body)).status).toBe(200)
    expect((await store.getSnapshot(attempt.id, 'end'))?.dom).toHaveLength(2_000_000)
  })

  it('answers 413 to a 2.2 MB events body and to an end over its own limit', async () => {
    const { token } = await active()
    const big = JSON.stringify({ action: 'events', events: [{ type: 'rrweb', at: clock, url: '/', data: 'x'.repeat(2_200_000) }] })
    expect(Buffer.byteLength(big)).toBeGreaterThan(2_100_000)
    expect((await post(token, big)).status).toBe(413)
    expect((await post(token, JSON.stringify({ action: 'end', reason: 'done', snapshot: snap('x'.repeat(5_000_000)) }))).status).toBe(413)
  })

  it('refuses a snapshot over 2,000,000 characters', async () => {
    const { token } = await active()
    expect((await post(token, { action: 'end', reason: 'done', snapshot: snap('x'.repeat(2_000_001)) })).status).toBe(400)
  })
})

describe('answers and withdrawal', () => {
  it('stores answers where the verifier and signals read them and finishes when every question is answered', async () => {
    const { attempt, token } = await active(5)
    await post(token, { action: 'end', reason: 'done', snapshot: snap() })
    expect((await post(token, { action: 'answers', answer: 'Team' })).status).toBe(200)
    expect(await store.getAttempt(attempt.id)).toMatchObject({ status: 'questions', answers: { 'Which plan was shown?': 'Team' } })
    expect((await post(token, { action: 'answers', ease: 6 })).status).toBe(200)
    expect(await store.getAttempt(attempt.id)).toMatchObject({ status: 'finished', answers: { 'Which plan was shown?': 'Team', 'goal5.ease': 6 } })
  })

  it('finishes the last goal only after the study questions', async () => {
    const { attempt, token } = await active(6)
    await post(token, { action: 'end', reason: 'done', snapshot: snap() })
    await post(token, { action: 'answers', ease: 6, confidence: 5 })
    expect((await store.getAttempt(attempt.id))?.status).toBe('questions')
    expect((await post(token, { action: 'answers', uxlite: { useful: 5, easy: 6 }, comment: 'fine' })).status).toBe(200)
    expect(await store.getAttempt(attempt.id)).toMatchObject({ status: 'finished', answers: { useful: 5, easy: 6, anything: 'fine', 'goal6.confidence': 5 } })
  })

  it('asks what made it difficult only at 4 or below', async () => {
    const { attempt, token } = await active(0)
    await post(token, { action: 'end', reason: 'done', snapshot: snap() })
    await post(token, { action: 'answers', ease: 3 })
    expect((await store.getAttempt(attempt.id))?.status).toBe('questions')
    await post(token, { action: 'answers', difficulty: 'the menu hid it' })
    expect((await store.getAttempt(attempt.id))?.status).toBe('finished')
  })

  it('refuses an answer to a task that has none, an unknown rating and answers before consent', async () => {
    const { token } = await start(0)
    expect((await post(token, { action: 'answers', ease: 5 })).status).toBe(409)
    await post(token, { action: 'consent' })
    expect((await post(token, { action: 'answers', answer: 'x' })).status).toBe(400)
    expect((await post(token, { action: 'answers', uxlite: { bogus: 3 } })).status).toBe(400)
    expect((await post(token, { action: 'answers', ease: 9 })).status).toBe(400)
  })

  it('withdraws, deletes recordings and refuses later events', async () => {
    const { attempt, token } = await active()
    const id = await store.putBlob(attempt.id, 'video', new Uint8Array([1, 2]), 'video/webm')
    const view = await (await post(token, { action: 'withdraw' })).json()
    expect(view.status).toBe('finished')
    expect(await store.getAttempt(attempt.id)).toMatchObject({ reason: 'withdrew' })
    expect(await store.getBlob(id)).toBeUndefined()
    expect((await post(token, { action: 'events', events: [] })).status).toBe(409)
  })
})
