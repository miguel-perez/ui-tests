import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { figuresOf, titleOf } from '../src/github/check.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { buildRecord } from '../src/record/build.ts'
import { refreshRun } from '../src/runner/progress.ts'
import { primaryGoalIndex } from '../src/runner/sequence.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { AttemptRow, RunRow, Verification } from '../src/store/types.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
let compiled: ReturnType<typeof compileStudy>
let store: SqliteStore
let run: RunRow
let primary: number
let other: number

beforeAll(async () => {
  const { code } = await bundleStudyFile(file)
  compiled = compileStudy((await loadBundle(code, file))[0]!, {})
  primary = primaryGoalIndex(compiled)
  other = primary === 0 ? 1 : 0
})
beforeEach(async () => {
  store = new SqliteStore(':memory:')
  run = (await store.createRun(newRun('k', { compiled, deadline: '2099-01-01T00:00:00.000Z' }))).run
})

const verdict = (status: Verification['status']): Verification => ({ status, steps: [], ...(status !== 'correct' && { reason: status }) })
let seq = 0
async function attempt(goalIndex: number, status: Verification['status'], patch: Partial<AttemptRow> = {}) {
  const { attempt } = await store.createAttempt({ runId: run.run, participant: `p${seq++}`, goalIndex, rehearsal: false })
  await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', startedAt: '2026-10-19T10:00:00.000Z', endedAt: '2026-10-19T10:01:00.000Z', verification: verdict(status), ...patch })
}

describe('the result sentence and the check title read the same figures', () => {
  it('4 reached and 1 could not be read: both say 5 of 5 completed; another goal and an unverified withdrawal count in neither', async () => {
    for (let i = 0; i < 4; i++) await attempt(primary, 'correct')
    await attempt(primary, 'unknown')
    // A person who withdrew before being verified is not in n, so not in the sentence either.
    await attempt(primary, 'incorrect', { reason: 'withdrew', verification: undefined })
    // Another goal's failure is reported beside the result, never in it.
    await attempt(other, 'incorrect')
    const settled = await refreshRun(store, run.run)
    expect(settled.result).toBe('inconclusive')
    const record = await buildRecord(store, run.run)
    expect(figuresOf(record)).toMatchObject({ attempted: 5, reached: 4 })
    expect(titleOf(record)).toBe('Inconclusive · only 5 of 5 attempts completed')
    expect(record.sentence).toMatch(/^Inconclusive: 5 of 5 attempts completed, 1 of them could not be verified, /)
  })

  it('problems found: the sentence counts only the primary goal\'s people, as the title does', async () => {
    for (let i = 0; i < 4; i++) await attempt(primary, 'correct')
    await attempt(primary, 'incorrect')
    await attempt(other, 'incorrect')
    await attempt(other, 'incorrect')
    const settled = await refreshRun(store, run.run)
    expect(settled.result).toBe('problems-found')
    const record = await buildRecord(store, run.run)
    expect(titleOf(record)).toMatch(/ · 4 of 5 people reached the goal$/)
    expect(record.sentence).toMatch(/^1 of 5 could not .*; 4 of 5 /)
  })

  it('n is the primary goal\'s: five finished attempts at another goal leave the run collecting', async () => {
    for (let i = 0; i < 5; i++) await attempt(other, 'correct')
    await attempt(primary, 'correct')
    const settled = await refreshRun(store, run.run)
    expect(settled.result).toBe('pending')
    expect(settled.states.collection).toBe('collecting')
  })
})
