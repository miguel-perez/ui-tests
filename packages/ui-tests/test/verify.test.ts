import { join } from 'node:path'
import type { APIRequestContext } from 'playwright-core'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { snapshotPage } from '../src/snapshot-page.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { AttemptRow, RunRow, Snapshot } from '../src/store/types.ts'
import { MissingEvidence } from '../src/expect.ts'
import { runHook, verifyAttempt, verifyRun } from '../src/verify.ts'
import { AssertionFailure } from '../src/expect.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const target = 'http://target.test'
const minute = 60_000
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
let run: RunRow

const fakeRequest = (baseURL: string) => Promise.resolve({ baseURL, dispose: async () => {} } as unknown as APIRequestContext)
const page = (url: string, dom = '<html><body><p id="here">hi</p></body></html>', extra: Partial<Snapshot> = {}): Snapshot => ({ url, dom, ...extra })

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  studies = await loadBundle(code, file)
})
beforeEach(async () => {
  store = new SqliteStore(':memory:')
  run = (await store.createRun(newRun('k', { compiled: compileStudy(studies[0], {}), hooksBundle: code, target }))).run
})

async function attempt(goalIndex: number, patch: Partial<AttemptRow> = {}, end?: Snapshot): Promise<AttemptRow> {
  const { attempt: made } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex, rehearsal: false, setupValues: { code: 'abc' } })
  await store.updateAttempt(made.id, { status: 'finished', reason: 'done', startedAt: new Date(0).toISOString(), ...patch })
  if (end) await store.putSnapshot(made.id, 'end', end)
  return (await store.getAttempt(made.id))!
}
const verify = async (made: AttemptRow) => verifyAttempt({ run, attempt: made, task: studies[0].tasks[made.goalIndex], store, request: await fakeRequest(target) })

describe('verifyAttempt', () => {
  it('is correct when the end URL satisfies the outcome', async () => {
    expect(await verify(await attempt(0, {}, page('http://target.test/docs/getting-started/')))).toMatchObject({ status: 'correct', steps: [] })
  })
  it('is incorrect with a diff when the end URL is wrong', async () => {
    const verification = await verify(await attempt(0, {}, page('http://target.test/')))
    expect(verification.status).toBe('incorrect')
    expect(verification.diff).toEqual({ expected: '/docs/getting-started', actual: 'http://target.test/' })
  })
  it('is unknown when the snapshot is missing', async () => {
    expect(await verify(await attempt(0))).toMatchObject({ status: 'unknown', reason: 'Missing end-state snapshot' })
  })
  it.each(['gave up', 'timeout'] as const)('is incorrect with the terminal reason when the attempt ended by %s', async reason => {
    expect(await verify(await attempt(0, { reason }, page('http://target.test/docs/getting-started')))).toMatchObject({ status: 'incorrect', reason: `Terminal reason: ${reason}` })
  })
  it('gives the outcome a request based on the run target', async () => {
    expect((await verify(await attempt(1, {}, page('http://target.test/')))).status).toBe('correct')
  })
  it('gives the outcome the setup values', async () => {
    expect((await verify(await attempt(2, {}, page('http://target.test/')))).status).toBe('correct')
  })
  it('is unknown, not incorrect, when an element is missing from a truncated snapshot', async () => {
    const verification = await verify(await attempt(3, {}, page('http://target.test/', '<p>cut</p>', { truncated: true })))
    expect(verification.status).toBe('unknown')
  })
  it('is incorrect when the element is missing from a whole snapshot', async () => {
    expect((await verify(await attempt(3, {}, page('http://target.test/', '<p>whole</p>')))).status).toBe('incorrect')
  })
  it('makes a failed step check fail the attempt', async () => {
    const made = await attempt(4, {}, page('http://target.test/done'))
    await store.putSnapshot(made.id, 'step-0', page('http://target.test/elsewhere'))
    const verification = await verify(made)
    expect(verification).toMatchObject({ status: 'incorrect', reason: 'A step check failed' })
    expect(verification.steps).toMatchObject([{ name: 'Open the menu', status: 'incorrect' }])
  })
  it('passes when outcome and steps hold', async () => {
    const made = await attempt(4, {}, page('http://target.test/done'))
    await store.putSnapshot(made.id, 'step-0', page('http://target.test/menu'))
    expect((await verify(made)).status).toBe('correct')
  })
  it('compares the answer and reports a mismatch with a diff', async () => {
    const wrong = await verify(await attempt(5, { answers: { 'Which plan was shown?': 'Solo' } }))
    expect(wrong).toMatchObject({ status: 'incorrect', diff: { expected: 'Team', actual: 'Solo' }, answer: { status: 'incorrect' } })
    expect((await verify(await attempt(5, { answers: { 'Which plan was shown?': 'Team' } }))).status).toBe('correct')
  })
  it('is unknown with no outcome and no answer', async () => {
    expect(await verify(await attempt(6))).toMatchObject({ status: 'unknown', reason: 'Issues only: no outcome' })
  })
})

describe('runHook', () => {
  it('maps a thrown assertion to incorrect with its diff', async () => {
    expect(await runHook(async () => { throw new AssertionFailure('a', 'b', 'toBe') }, {})).toMatchObject({ status: 'incorrect', diff: { expected: 'b', actual: 'a' } })
  })
  it('maps missing evidence and other throws to unknown', async () => {
    expect(await runHook(async () => { throw new MissingEvidence('nothing') }, {})).toEqual({ status: 'unknown', reason: 'nothing' })
    expect(await runHook(async () => { throw new Error('boom') }, {})).toEqual({ status: 'unknown', reason: 'boom' })
  })
})

describe('snapshotPage', () => {
  it('reads the url, text, nodes and state', () => {
    const snap = snapshotPage(page('http://x/', '<p id="here">hi</p>', { state: { a: 1 } }))
    expect(snap.url()).toBe('http://x/')
    expect(snap.textContent('#here')).toBe('hi')
    expect(snap.query('#nope')).toBeNull()
    expect(snap.state()).toEqual({ a: 1 })
  })
  it('throws MissingEvidence for a miss on a truncated snapshot and for no snapshot', () => {
    const cut = snapshotPage(page('http://x/', '<p>cut</p>', { truncated: true }))
    expect(() => cut.query('#missing')).toThrow(MissingEvidence)
    expect(() => cut.textContent('#missing')).toThrow(MissingEvidence)
    expect(() => snapshotPage().url()).toThrow(MissingEvidence)
  })
})

describe('verifyRun', () => {
  it('verifies finished attempts once, storing the verification, with a request on the run target', async () => {
    const made = await attempt(1, {}, page('http://target.test/'))
    const bases: string[] = []
    const requestFactory = async (base: string) => { bases.push(base); return fakeRequest(base) }
    expect(await verifyRun(store, run.run, { requestFactory })).toEqual({ verified: 1, disconnected: 0 })
    expect(bases).toEqual([target])
    expect((await store.getAttempt(made.id))?.verification?.status).toBe('correct')
    expect(await verifyRun(store, run.run, { requestFactory })).toEqual({ verified: 0, disconnected: 0 })
  })
  it('does not verify withdrawn or disconnected attempts', async () => {
    const withdrew = await attempt(0, { reason: 'withdrew' }, page('http://target.test/docs/getting-started'))
    const dropped = await attempt(0, { reason: 'disconnected' }, page('http://target.test/docs/getting-started'))
    expect(await verifyRun(store, run.run, { requestFactory: fakeRequest })).toEqual({ verified: 0, disconnected: 0 })
    expect((await store.getAttempt(withdrew.id))?.verification).toBeUndefined()
    expect((await store.getAttempt(dropped.id))?.verification).toBeUndefined()
  })
  it('marks an active attempt silent past its timeout plus 60 s as disconnected, unverified', async () => {
    const timeout = run.compiled.goals[0].timeout.seconds * 1000
    const silent = await attempt(0, { status: 'active', reason: undefined })
    await store.appendEvents(silent.id, [{ type: 'click', at: 1000, url: '/', target: 'a' }])
    const alive = await attempt(0, { status: 'active', reason: undefined })
    await store.appendEvents(alive.id, [{ type: 'click', at: timeout + 1000 + minute, url: '/', target: 'a' }])
    const now = timeout + 2 * minute
    expect(await verifyRun(store, run.run, { now, requestFactory: fakeRequest })).toEqual({ verified: 0, disconnected: 1 })
    const gone = await store.getAttempt(silent.id)
    expect(gone).toMatchObject({ status: 'finished', reason: 'disconnected' })
    expect(gone?.verification).toBeUndefined()
    expect((await store.getAttempt(alive.id))?.status).toBe('active')
  })
})
