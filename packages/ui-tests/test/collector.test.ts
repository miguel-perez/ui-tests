import { join } from 'node:path'
import { vi, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

describe('deadline', () => {
  it('refuses consent and begin after the run deadline, and lets an attempt already under way carry on', async () => {
    const late = await start()
    const under = await active()
    clock = Date.parse(run.deadline) + 1
    expect((await post(late.token, { action: 'consent' })).status).toBe(409)
    expect((await post(under.token, { action: 'events', events: [] })).status).toBe(200)
    const fresh = await start()
    expect((await post(fresh.token, { action: 'begin' })).status).toBe(409)
  })
})

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
    expect(view).toMatchObject({ run: run.run, status: 'created', hasVerification: true, record: 'events', rehearsal: false, brand: { name: run.compiled.brand.name } })
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

describe('answers before consent', () => {
  it('accepts a screener alone and refuses anything else until consent', async () => {
    const { token, attempt } = await start()
    expect((await post(token, { action: 'answers', screener: { role: 'Designer' } })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))?.answers.screener).toEqual({ role: 'Designer' })
    expect((await post(token, { action: 'answers', screener: { role: 'x' }, ease: 5 })).status).toBe(409)
    expect((await post(token, { action: 'answers', ease: 5 })).status).toBe(409)
    expect((await store.getAttempt(attempt.id))?.status).toBe('created')
  })
})

describe('actions', () => {
  it('consent sets the HttpOnly run cookie and nothing else', async () => {
    const { token } = await start()
    const response = await post(token, { action: 'consent' })
    expect(response.headers.getSetCookie()).toEqual([`ui-tests-run=${token}; Path=/api/ui-tests/; HttpOnly; SameSite=Lax; Max-Age=7200`])
    expect((await response.json()).status).toBe('consented')
    expect((await store.getAttempt((await store.authorize(token))!.attempt.id))?.purposes).toEqual(run.compiled.consent.purposes)
  })

  it('marks the cookie Secure on https', async () => {
    const { token } = await start()
    const response = await collect(new Request('https://app.test/api/ui-tests', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'consent' }) }))
    expect(response.headers.getSetCookie()).toEqual([expect.stringMatching(/^ui-tests-run=[^;]+; .*; Secure$/)])
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
    expect((await post(token, { action: 'answers', uxlite: { useful: 5, easy: 4 }, comment: 'fine' })).status).toBe(200)
    expect(await store.getAttempt(attempt.id)).toMatchObject({ status: 'finished', answers: { useful: 5, easy: 4, anything: 'fine', 'goal6.confidence': 5 } })
  })

  it('takes the two study items on five points, not seven', async () => {
    const { token } = await active(6)
    await post(token, { action: 'end', reason: 'done', snapshot: snap() })
    await post(token, { action: 'answers', ease: 6, confidence: 5 })
    expect((await post(token, { action: 'answers', uxlite: { useful: 6 } })).status).toBe(400)
    expect((await post(token, { action: 'answers', uxlite: { useful: 5 } })).status).toBe(200)
  })

  it('keeps a spoken answer as a voice blob, with the words when it has them, and finishes when that was the last answer', async () => {
    const { attempt, token } = await active(6)
    await post(token, { action: 'end', reason: 'done', snapshot: snap() })
    await post(token, { action: 'answers', ease: 6, confidence: 5 })
    await post(token, { action: 'answers', uxlite: { useful: 5, easy: 4 } })
    const audio = Buffer.from([1, 2, 3, 4]).toString('base64')
    expect((await post(token, { action: 'voice', question: 'goal6.ease', audio, contentType: 'audio/webm' })).status).toBe(400)
    expect((await post(token, { action: 'voice', question: 'anything', audio, contentType: 'text/plain' })).status).toBe(400)
    expect((await post(token, { action: 'voice', question: 'anything', audio: '', contentType: 'audio/webm' })).status).toBe(400)
    const spoken = await post(token, { action: 'voice', question: 'anything', audio, contentType: 'audio/webm;codecs=opus', transcript: ' fine ' })
    expect(spoken.status).toBe(200)
    const stored = await store.getAttempt(attempt.id)
    expect(stored).toMatchObject({ status: 'finished', answers: { anything: 'fine' } })
    const blob = await store.getBlob(stored!.answers['anything.voice'] as string)
    expect(blob).toMatchObject({ contentType: 'audio/webm;codecs=opus' })
    expect([...blob!.bytes]).toEqual([1, 2, 3, 4])
  })

  it('asks a transcriber for the words when the browser sent none, and keeps the audio when there are none', async () => {
    const heard = createCollector({ store: async () => store, now: () => clock, transcriber: { transcribe: async (bytes) => (bytes.length === 4 ? 'it was slow' : undefined) } })
    const say = (token: string, bytes: number[]) => heard(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'voice', question: 'goal0.difficulty', audio: Buffer.from(bytes).toString('base64'), contentType: 'audio/webm' }) }))
    for (const [bytes, words] of [[[1, 2, 3, 4], 'it was slow'], [[9], '']] as const) {
      const { attempt, token } = await active(0)
      await post(token, { action: 'end', reason: 'done', snapshot: snap() })
      await post(token, { action: 'answers', ease: 2 })
      expect((await say(token, [...bytes])).status).toBe(200)
      expect((await store.getAttempt(attempt.id))?.answers['goal0.difficulty']).toBe(words)
    }
  })

  it('keeps typed words when the voice has none, replaces the earlier blob, and names a failing transcriber once', async () => {
    const errors: unknown[][] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args) })
    try {
      const broken = createCollector({ store: async () => store, now: () => clock, transcriber: { transcribe: async () => { throw new Error('no model') } } })
      const { attempt, token } = await active(6)
      await post(token, { action: 'end', reason: 'done', snapshot: snap() })
      await post(token, { action: 'answers', ease: 6, confidence: 5 })
      await post(token, { action: 'answers', uxlite: { useful: 5, easy: 4 } })
      expect(await store.getAttempt(attempt.id)).toMatchObject({ answers: { uxliteVersion: 'uxlite-2024' } })
      const say = (bytes: number[], typed?: string) => broken(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'voice', question: 'anything', audio: Buffer.from(bytes).toString('base64'), contentType: 'audio/webm', ...(typed && { typed }) }) }))
      expect((await say([1], 'typed first')).status).toBe(200)
      const first = (await store.getAttempt(attempt.id))!.answers['anything.voice'] as string
      expect((await store.getAttempt(attempt.id))!.answers.anything).toBe('typed first')
      await store.updateAttempt(attempt.id, { status: 'questions' }, 'finished')
      expect((await say([2])).status).toBe(200)
      const after = (await store.getAttempt(attempt.id))!
      expect(after.answers.anything).toBe('typed first')
      expect(await store.getBlob(first)).toBeUndefined()
      expect(await store.getBlob(after.answers['anything.voice'] as string)).toBeDefined()
      expect(errors).toHaveLength(1)
      expect(String(errors[0]![0])).toContain('no model')
    } finally { spy.mockRestore() }
  })

  it('refuses a spoken answer while the task is still on', async () => {
    const { token } = await active(0)
    expect((await post(token, { action: 'voice', question: 'anything', audio: 'AQID', contentType: 'audio/webm' })).status).toBe(409)
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

describe('fix round 1', () => {
  it('withdraws after finishing: the reason becomes withdrew and everything recorded is deleted', async () => {
    const { attempt, token } = await active(0)
    await post(token, { action: 'events', events: [{ type: 'click', at: clock, url: '/' }] })
    await post(token, { action: 'step', index: 0, snapshot: snap('<p>s</p>') })
    await post(token, { action: 'end', reason: 'done', snapshot: snap() })
    await post(token, { action: 'answers', ease: 6 })
    expect((await store.getAttempt(attempt.id))?.status).toBe('finished')
    const view = await (await post(token, { action: 'withdraw' })).json()
    expect(view.status).toBe('finished')
    expect(await store.getAttempt(attempt.id)).toMatchObject({ status: 'finished', reason: 'withdrew' })
    expect(await store.listEvents(attempt.id)).toEqual([])
    expect(await store.getSnapshot(attempt.id, 'end')).toBeUndefined()
    expect(await store.getSnapshot(attempt.id, 'step-0')).toBeUndefined()
    expect((await post(token, { action: 'withdraw' })).status).toBe(200)
  })

  it('leaves the attempt withdrawn whichever of withdraw and end wins the race', async () => {
    for (let i = 0; i < 5; i++) {
      const { attempt, token } = await active()
      const [end, withdraw] = await Promise.all([
        post(token, { action: 'end', reason: 'done', snapshot: snap('<p>x</p>') }),
        post(token, { action: 'withdraw' }),
      ])
      expect(withdraw.status).toBe(200)
      expect([200, 409]).toContain(end.status)
      expect(await store.getAttempt(attempt.id)).toMatchObject({ status: 'finished', reason: 'withdrew' })
      expect(await store.getSnapshot(attempt.id, 'end')).toBeUndefined()
    }
  })

  it('refuses answers once the attempt is finished or withdrawn', async () => {
    const { attempt, token } = await active(5)
    await post(token, { action: 'end', reason: 'done', snapshot: snap() })
    await post(token, { action: 'answers', answer: 'Team', ease: 6 })
    expect((await post(token, { action: 'answers', answer: 'Solo' })).status).toBe(409)
    expect((await store.getAttempt(attempt.id))?.answers['Which plan was shown?']).toBe('Team')
    const other = await active(0)
    await post(other.token, { action: 'withdraw' })
    expect((await post(other.token, { action: 'answers', ease: 2 })).status).toBe(409)
  })

  it('stops reading a chunked body without Content-Length at the limit', async () => {
    const { token } = await active()
    let pulled = 0
    const chunk = new TextEncoder().encode('x'.repeat(1_000_000))
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulled++ >= 50) return controller.close()
        controller.enqueue(chunk)
      },
    })
    const request = new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body, duplex: 'half' } as RequestInit)
    expect(request.headers.get('content-length')).toBeNull()
    expect((await collect(request)).status).toBe(413)
    expect(pulled).toBeLessThan(20)
  })

  it('lets an explicit ?t= win over a stale cookie on GET', async () => {
    const a = await start()
    const b = await store.createAttempt({ runId: run.run, participant: 'p_2', goalIndex: 1, rehearsal: false })
    const response = await collect(new Request(`${endpoint}?t=${b.token}`, { headers: { Cookie: `ui-tests-run=${a.token}` } }))
    expect((await response.json()).attempt).toBe(b.attempt.id)
    const bearer = await collect(new Request(endpoint, { headers: { Authorization: `Bearer ${b.token}`, Cookie: `ui-tests-run=${a.token}` } }))
    expect((await bearer.json()).attempt).toBe(b.attempt.id)
  })

  it('never writes the CLI secret into a cookie, and ignores other Authorization schemes', async () => {
    const { attempt, token } = await start()
    const response = await post('cli-secret', { action: 'consent' }, { query: `?attempt=${attempt.id}` })
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(JSON.stringify([...response.headers])).not.toContain('cli-secret')
    const other = await start()
    const basic = await collect(new Request(endpoint, { method: 'POST', headers: { Authorization: 'Basic abc', Cookie: `ui-tests-run=${other.token}`, Origin: origin }, body: JSON.stringify({ action: 'consent' }) }))
    expect(basic.status).toBe(200)
    expect(basic.headers.getSetCookie()[0]).toContain(`ui-tests-run=${other.token};`)
    expect(token).toBeTruthy()
  })

  it('passes the author\'s own words through unchanged', async () => {
    const compiled = structuredClone(run.compiled)
    compiled.author = 'ui-tests team'
    compiled.goals[0]!.name = 'Install ui-tests'
    compiled.goals[0]!.scenario = { text: 'Add ui-tests to your repo.', pinned: true }
    const made = (await store.createRun(newRun('k4', { compiled }))).run
    const a = (await store.createAttempt({ runId: made.run, participant: 'p', goalIndex: 0, rehearsal: false })).attempt
    const view = participantView(made, a)
    expect(view).toMatchObject({ author: 'ui-tests team', goal: { name: 'Install ui-tests', scenario: 'Add ui-tests to your repo.' } })
  })

  it('compares Origin with the forwarded origin behind a proxy', async () => {
    const { token } = await start()
    const forwarded = (origin: string) => collect(new Request('http://internal:3000/api/ui-tests', {
      method: 'POST',
      headers: { Cookie: `ui-tests-run=${token}`, Origin: origin, 'X-Forwarded-Host': 'public.test', 'X-Forwarded-Proto': 'https' },
      body: JSON.stringify({ action: 'consent' }),
    }))
    expect((await forwarded('http://internal:3000')).status).toBe(403)
    const ok = await forwarded('https://public.test')
    expect(ok.status).toBe(200)
    expect(ok.headers.getSetCookie().every((c) => c.endsWith('; Secure'))).toBe(true)
  })
})

describe('event replay', () => {
  const frame = (at: number, data: unknown = { type: 3, timestamp: at }) => ({ type: 'rrweb', at, url: '/', seq: at, data })

  it('stores replay events sent as a replay batch, once each, and keeps them out of the plain events', async () => {
    const { attempt, token } = await active()
    const batch = { action: 'replay', events: [frame(1), frame(2)] }
    expect((await post(token, batch)).status).toBe(200)
    expect((await post(token, batch)).status).toBe(200)
    expect((await store.listEvents(attempt.id)).map((e) => e.type)).toEqual(['rrweb', 'rrweb'])
    expect((await post(token, { action: 'events', events: [frame(3)] })).status).toBe(400)
    expect((await post(token, { action: 'replay', events: [{ type: 'click', at: 1, url: '/' }] })).status).toBe(400)
  })

  it('takes a replay batch past the 2,100,000 bytes of an events body, up to its own 5,000,000, and answers 413 beyond', async () => {
    const { attempt, token } = await active()
    const full = frame(5, { type: 2, timestamp: 5, node: 'x'.repeat(3_000_000) })
    expect((await post(token, { action: 'replay', events: [full] })).status).toBe(200)
    expect(await store.listEvents(attempt.id)).toHaveLength(1)
    expect((await post(token, { action: 'replay', events: [frame(6, { node: 'x'.repeat(5_100_000) })] })).status).toBe(413)
    // The 100-event batch limit holds for replay batches too.
    expect((await post(token, { action: 'replay', events: Array.from({ length: 101 }, (_, i) => frame(100 + i)) })).status).toBe(400)
  })

  it('notes on the attempt that the replay stopped early, and the trace says so', async () => {
    const { attempt, token } = await active()
    expect((await post(token, { action: 'replay', events: [], truncated: true })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))?.answers['replay-truncated']).toBe(true)
  })

  it('refuses a replay batch when the attempt is not active', async () => {
    const made = await start()
    expect((await post(made.token, { action: 'replay', events: [frame(1)] })).status).toBe(409)
  })

  it('deletes the replay on withdrawal, and refuses more afterwards', async () => {
    const { attempt, token } = await active()
    await post(token, { action: 'replay', events: [frame(1), frame(2)] })
    expect(await store.listEvents(attempt.id)).toHaveLength(2)
    expect((await post(token, { action: 'withdraw' })).status).toBe(200)
    expect(await store.listEvents(attempt.id)).toEqual([])
    expect((await post(token, { action: 'replay', events: [frame(3)] })).status).toBe(409)
  })
})
