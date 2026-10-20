import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { createParticipant } from '../src/runner/invites.ts'
import { GOAL_ORDER, goalOrderFor } from '../src/runner/sequence.ts'
import { createCollector } from '../src/server/collector.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { RunRow, RunStore } from '../src/store/types.ts'
import type { CompiledStudy } from '../src/schema/compiled.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const endpoint = 'http://app.test/api/ui-tests'
let compiled: CompiledStudy
let store: SqliteStore
let collect: (request: Request) => Promise<Response>

beforeAll(async () => {
  const { code } = await bundleStudyFile(file)
  const full = compileStudy((await loadBundle(code, file))[0]!, {})
  // Two goals: "Reach docs" (primary) and "Use the request".
  compiled = { ...full, goals: full.goals.slice(0, 2) }
})
beforeEach(() => {
  store = new SqliteStore(':memory:')
  collect = createCollector({ store: async () => store })
})

const post = (token: string, body: unknown) => collect(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))
const view = async (token: string) => (await collect(new Request(`${endpoint}?t=${token}`))).json()
const snap = { url: 'http://app.test/done', dom: '<html></html>' }
const runOf = async (study: CompiledStudy, key = 'k'): Promise<RunRow> => (await store.createRun(newRun(key, { compiled: study, deadline: '2099-01-01T00:00:00.000Z' }))).run

describe('goal order', () => {
  it('is the declared order unless the study is independent', () => {
    expect(goalOrderFor({ goals: compiled.goals }, 'r:p')).toEqual([0, 1])
  })

  it('is shuffled per person when independent: the same person always gets the same order, and people differ', () => {
    const goals = Array.from({ length: 5 }, (_, i) => ({ ...compiled.goals[0]!, index: i }))
    const orders = Array.from({ length: 20 }, (_, i) => goalOrderFor({ goals, independent: true }, `r_1:invite-${i}`))
    for (const order of orders) expect([...order].sort()).toEqual([0, 1, 2, 3, 4])
    expect(goalOrderFor({ goals, independent: true }, 'r_1:invite-3')).toEqual(orders[3])
    expect(new Set(orders.map(o => o.join())).size).toBeGreaterThan(1)
  })
})

describe('a link participant attempts every goal', () => {
  it('stores the attempt and its goal order together: a failed second write leaves no one-goal slot', async () => {
    const run = await runOf(compiled)
    const failing = new Proxy(store, {
      get(target, property, receiver) {
        if (property !== 'transaction') return Reflect.get(target, property, receiver)
        return <T>(fn: (tx: RunStore) => Promise<T>) => target.transaction(tx => fn(new Proxy(tx, {
          get(inner, name, innerReceiver) {
            if (name === 'updateAttempt') return () => Promise.reject(new Error('second write failed'))
            const value = Reflect.get(inner, name, innerReceiver) as unknown
            return typeof value === 'function' ? value.bind(inner) : value
          },
        })))
      },
    })
    await expect(createParticipant(failing, { run, participant: 'invite-9' })).rejects.toThrow('second write failed')
    expect((await store.listAttempts(run.run)).filter(a => a.participant === 'invite-9')).toEqual([])
  })
  it('moves on to the next goal after the first goal\'s questions, asks the study questions once after the last, and keeps one token', async () => {
    const run = await runOf(compiled)
    const { attempt: first, token } = await createParticipant(store, { run, participant: 'invite-1', setupValues: { start: '/', code: 'abc' } })
    expect(first.goalIndex).toBe(0)
    expect(first.answers[GOAL_ORDER]).toEqual([0, 1])

    const opening = await view(token)
    expect(opening).toMatchObject({ sequence: { position: 0, of: 2 }, goal: { index: 0 } })
    // The study's own questions are not asked after the first goal.
    expect(opening.questions.map((q: { id: string }) => q.id)).not.toContain('useful')

    expect((await post(token, { action: 'consent' })).status).toBe(200)
    expect((await post(token, { action: 'begin' })).status).toBe(200)
    expect((await post(token, { action: 'end', reason: 'done', snapshot: snap })).status).toBe(200)
    const after = await (await post(token, { action: 'answers', ease: 6 })).json()
    // The reply is already the next goal's view: consented (they agreed once, to the whole study), no practice, and the study questions at its end.
    expect(after).toMatchObject({ status: 'consented', practice: false, sequence: { position: 1, of: 2 }, goal: { index: 1 } })
    expect(after.attempt).not.toBe(first.id)
    expect(after.questions.map((q: { id: string }) => q.id)).toEqual(expect.arrayContaining(['useful', 'easy', 'anything']))

    const attempts = await store.listAttempts(run.run)
    expect(attempts.map(a => [a.participant, a.goalIndex, a.status])).toEqual([['invite-1', 0, 'finished'], ['invite-1', 1, 'consented']])
    expect(attempts[1]!.purposes).toEqual(attempts[0]!.purposes)
    expect(attempts[1]!.purposes.length).toBeGreaterThan(0)
    expect(attempts[1]).toMatchObject({ setupValues: { code: 'abc' }, answers: { [GOAL_ORDER]: [0, 1] } })

    // The same token now stands for the second goal's attempt.
    expect((await view(token)).goal.index).toBe(1)
    expect((await post(token, { action: 'begin' })).status).toBe(200)
    expect((await post(token, { action: 'end', reason: 'done', snapshot: snap })).status).toBe(200)
    await post(token, { action: 'answers', ease: 7 })
    const done = await (await post(token, { action: 'answers', uxlite: { useful: 5, easy: 4 }, comment: 'fine' })).json()
    expect(done).toMatchObject({ status: 'finished', goal: { index: 1 } })
    expect((await store.listAttempts(run.run)).map(a => a.status)).toEqual(['finished', 'finished'])
  })

  it('a person already on a later goal may begin it after the deadline', async () => {
    const run = await runOf(compiled)
    const { token } = await createParticipant(store, { run, participant: 'invite-1' })
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    await post(token, { action: 'end', reason: 'done', snapshot: snap })
    await post(token, { action: 'answers', ease: 6 })
    await store.updateRun(run.run, { deadline: '2000-01-01T00:00:00.000Z' }, run.revision)
    expect((await post(token, { action: 'begin' })).status).toBe(200)
  })

  it('withdrawing on a later goal withdraws the person from every goal and deletes every recording', async () => {
    const run = await runOf(compiled)
    const { attempt: first, token } = await createParticipant(store, { run, participant: 'invite-1' })
    await post(token, { action: 'consent' })
    await post(token, { action: 'begin' })
    await post(token, { action: 'events', events: [{ type: 'click', at: Date.now(), url: 'http://app.test/' }] })
    await post(token, { action: 'end', reason: 'done', snapshot: snap })
    await post(token, { action: 'answers', ease: 6 })
    await post(token, { action: 'begin' })
    expect((await post(token, { action: 'withdraw' })).status).toBe(200)
    const attempts = await store.listAttempts(run.run)
    expect(attempts.map(a => a.reason)).toEqual(['withdrew', 'withdrew'])
    expect(await store.listEvents(first.id)).toEqual([])
    expect(await store.getSnapshot(first.id, 'end')).toBeUndefined()
  })

  it('an independent study starts each person on the first goal of their own order', async () => {
    const run = await runOf({ ...compiled, independent: true })
    const made = await Promise.all(Array.from({ length: 12 }, (_, i) => createParticipant(store, { run, participant: `invite-${i}` })))
    for (const { attempt } of made) expect(attempt.goalIndex).toBe((attempt.answers[GOAL_ORDER] as number[])[0])
    expect(new Set(made.map(m => m.attempt.goalIndex)).size).toBe(2)
  })
})
