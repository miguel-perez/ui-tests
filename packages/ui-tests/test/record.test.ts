import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { main, type Io } from '../src/cli/main.ts'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { clauseEvidence } from '../src/record/clauses.ts'
import { buildRecord } from '../src/record/build.ts'
import { RUN_RECORD_SCHEMA_ID, runRecordJsonSchema, runRecordSchema } from '../src/record/schema.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { newRun } from './store-conformance.ts'

const fixture = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const schemaFile = join(import.meta.dirname, '..', 'schemas', 'run-record.v1.json')
const HOOKS = 'SECRET_HOOKS_BUNDLE_MARKER'
let data: string
let store: SqliteStore
let runId: string
let compiled: ReturnType<typeof compileStudy>

beforeAll(async () => {
  data = await mkdtemp(join(tmpdir(), 'ui-tests-record-'))
  const bundle = await bundleStudyFile(fixture)
  const studies = await loadBundle(bundle.code, fixture)
  compiled = compileStudy(studies[0], {})
  store = new SqliteStore(join(data, 'dev.sqlite'))
  const { run } = await store.createRun(newRun('record', { compiled, hooksBundle: HOOKS }))
  runId = run.run
  const consented = compiled.consent.purposes.slice(0, 1)

  const first = (await store.createAttempt({ runId, participant: 'p_1', goalIndex: 0, rehearsal: false, environment: { Browser: 'Safari', 'Assistive technology': 'Screen reader' } })).attempt
  await store.updateAttempt(first.id, {
    status: 'finished', reason: 'done', purposes: consented, startedAt: new Date(0).toISOString(), endedAt: new Date(20_000).toISOString(),
    verification: { status: 'correct', steps: [] },
    answers: {
      'goal0.ease': 6, 'goal0.confidence': 5, useful: 5, easy: 4,
      screener: { 'screener.recency': 'In the past week' }, 'goal0.difficulty.voice': 'blob_2',
      screenerResult: { group: 'everyone', criteria: { recency: { value: 'In the past week', met: true } }, order: { 'screener.recency': ['In the past week'] } },
      impression: { looked: true, text: 'a tool for invites', parts: { what: true, who: false, action: true, purpose: false }, codedBy: 'model' },
    },
  })
  await store.appendEvents(first.id, [{ type: 'url', at: 0, url: 'http://t.test/', seq: 1 }, { type: 'click', at: 400, url: 'http://t.test/', target: 'a#docs', seq: 3 }, { type: 'url', at: 500, url: 'http://t.test/docs/getting-started', seq: 2 }])

  const second = (await store.createAttempt({ runId, participant: 'p_2', goalIndex: 5, rehearsal: false })).attempt
  await store.updateAttempt(second.id, {
    status: 'finished', reason: 'done', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(40_000).toISOString(),
    verification: { status: 'incorrect', reason: 'The answer differs from the expected one', diff: { expected: 'Team', actual: 'Solo' }, steps: [], answer: { status: 'incorrect', diff: { expected: 'Team', actual: 'Solo' } } },
    answers: { 'Which plan was shown?': 'Solo', impression: { looked: true, text: '   ', parts: null, uncoded: 'no answer' } },
  })
  // An invite slot nobody has opened.
  await store.createAttempt({ runId, participant: 'p_3', goalIndex: 1, rehearsal: false })
  await store.addRevision(runId, { at: '2026-10-19T10:00:00.000Z', by: 'ana', kind: 'scenario', goalIndex: 0, text: 'Reworded the scenario' })
})

afterAll(async () => {
  await store.close()
  await rm(data, { recursive: true, force: true })
})

const validator = async () => new Ajv2020().compile(JSON.parse(await readFile(schemaFile, 'utf8')))

describe('run record', () => {
  it('validates against the zod schema and the committed JSON Schema', async () => {
    const record = await buildRecord(store, runId)
    expect(runRecordSchema.safeParse(record).success).toBe(true)
    const validate = await validator()
    expect(validate(JSON.parse(JSON.stringify(record))), JSON.stringify(validate.errors)).toBe(true)
    expect(record.schema).toBe(RUN_RECORD_SCHEMA_ID)
    expect(record.handle).toMatchObject({ run: runId, actor: 'human', result: 'pending' })
  })

  it('requires actor and schema in both', async () => {
    const record = JSON.parse(JSON.stringify(await buildRecord(store, runId)))
    const validate = await validator()
    for (const key of ['actor', 'schema']) {
      const { [key]: _gone, ...rest } = record
      expect(runRecordSchema.safeParse(rest).success).toBe(false)
      expect(validate(rest)).toBe(false)
    }
  })

  it('keeps the committed schema in step with the zod schema', async () => {
    const committed = JSON.parse(await readFile(schemaFile, 'utf8'))
    expect(committed).toEqual(JSON.parse(JSON.stringify(runRecordJsonSchema())))
    expect(committed.$id).toBe(RUN_RECORD_SCHEMA_ID)
    const { $id, additionalProperties, ...rest } = committed
    const { additionalProperties: _closed, ...zod } = z.toJSONSchema(runRecordSchema) as Record<string, unknown>
    expect(rest).toEqual(zod)
    expect(additionalProperties).toBeUndefined()
  })

  it('lets a later additive top-level field through a v1 validator, but not one nested inside', async () => {
    const record = JSON.parse(JSON.stringify(await buildRecord(store, runId)))
    const validate = await validator()
    expect(validate({ ...record, futureField: 1 })).toBe(true)
    expect(validate({ ...record, handle: { ...record.handle, futureField: 1 } })).toBe(false)
  })

  it('takes the currency it is given, USD otherwise', async () => {
    expect((await buildRecord(store, runId, { currency: 'EUR' })).money.currency).toBe('EUR')
  })

  it('carries no identity, hashes, hooks, credentials or expected answers', async () => {
    const text = JSON.stringify(await buildRecord(store, runId))
    expect(text).not.toContain(HOOKS)
    expect(text).not.toContain('hooksBundle')
    expect(text).not.toContain('a private spreadsheet')
    expect(text).not.toMatch(/"(email|name_?hash|deviceHash|ipHash|ip|token|secret|hash)"/i)
    expect(text).not.toContain('blob_1')
    expect(text).not.toContain('blob_2')
    expect(text).not.toMatch(/"expected":\s*"Team"/)
    expect(text).not.toContain('"target":"http://')
  })

  it('carries each attempt with the purposes the person agreed to and the ones they did not', async () => {
    const record = await buildRecord(store, runId)
    const [a, b] = record.attempts
    expect(compiled.consent.purposes.length).toBeGreaterThan(1)
    expect(a).toMatchObject({ participant: 'p_1', source: 'link', purposes: compiled.consent.purposes.slice(0, 1), restrictions: [], purposesDeclined: compiled.consent.purposes.slice(1), reason: 'done', path: ['/', '/docs/getting-started'], firstLook: 'asked', environment: { Browser: 'Safari' } })
    expect(b).toMatchObject({ purposes: compiled.consent.purposes, restrictions: [], purposesDeclined: [] })
    expect(record.attempts[2]).toMatchObject({ purposes: [], restrictions: [], purposesDeclined: [] })
    expect(a!.answers).toHaveProperty('impression')
    expect(a!.answers).not.toHaveProperty('screener')
    expect(b!.verification!.answer!.diff).toEqual({ actual: 'Solo' })
    expect(b!.verification!.diff).toEqual({ actual: 'Solo' })
  })

  it('counts a first look with no answer apart from the coded ones, and never in the issues', async () => {
    const record = await buildRecord(store, runId)
    expect(record.attempts[1]).toMatchObject({ firstLook: 'asked' })
    expect(record.impression).toMatchObject({ answered: 1, coded: 1, noAnswer: 1, uncoded: [] })
    expect(record.impression.limits).toContain('never counted in the issues')
    expect(record.issues.every(issue => !JSON.stringify(issue).includes('a tool for invites'))).toBe(true)
  })

  it('names effectiveness, efficiency and satisfaction, the group and the first click of a task', async () => {
    const record = await buildRecord(store, runId)
    expect(record.measures.byGoal['0']).toMatchObject({
      effectiveness: { reached: 1, n: 1, unknown: 0 },
      efficiency: { medianAllMs: 20_000, medianVerifiedMs: 20_000, deviations: 0 },
      satisfaction: { ease: [6], confidence: [5] },
    })
    expect(record.measures.byGoal['5']).toMatchObject({ effectiveness: { reached: 0, n: 1 }, efficiency: { medianAllMs: 40_000 } })
    expect(record.measures.byGoal['5']!.efficiency.medianVerifiedMs).toBeUndefined()
    expect(record.measures.satisfaction.uxLite).toEqual({ n: 1, scores: [87.5], mean: 87.5, useful: { scores: [100], mean: 100 }, easy: { scores: [75], mean: 75 } })
    expect(record.measures.byGoal['0']!.firstClick).toEqual({ onPath: 1, offPath: 0, of: 1 })
    expect(record.screened).toEqual({ n: 1, noGroup: 0, outside: [] })
    expect(record.groups).toEqual([{ name: 'everyone', quota: compiled.sample.n, n: 2, filled: compiled.sample.n <= 2, sentence: 'Two people give a 56% chance of seeing any problem that hits at least one person in three.', issues: record.issues.map(i => i.id) }])
    expect(record.attempts[0]).toMatchObject({ group: 'everyone', firstLook: 'asked' })
    expect(record.impression).toMatchObject({ answered: 1, coded: 1, parts: { what: 1, who: 0, action: 1, purpose: 0 }, noAnswer: 1, uncoded: [] })
    expect(record.recruitment.link).toMatchObject({ invited: 3, screened: 1, started: 2, finished: 2, paid: 0 })
    expect(record.money).toEqual({ estimate: 0, reserved: 0, paid: 0, truedUp: 0, currency: 'USD' })
    expect(record.revisions).toEqual([{ at: '2026-10-19T10:00:00.000Z', author: 'ana', note: '1. Task 1 wording: “Reworded the scenario”' }])
    expect(record.revisionLog).toEqual([{ number: 1, undone: false, revision: { at: '2026-10-19T10:00:00.000Z', by: 'ana', kind: 'scenario', goalIndex: 0, text: 'Reworded the scenario' } }])
    expect(record.quality).toMatchObject({ attempts: 3, counted: 2, rehearsal: 0 })
    expect(record.issues.length).toBeGreaterThan(0)
  })

  it('keeps the result pending until n attempts are counted (ruling P3)', async () => {
    const record = await buildRecord(store, runId)
    expect(record.handle.result).toBe('pending')
    expect(record.sentence).toBe('Five people give an 87% chance of seeing any problem that hits at least one person in three.')
  })

  it('lists the five clauses and never says compliant', async () => {
    const record = await buildRecord(store, runId)
    expect(record.evidence.map(c => c.clause)).toEqual(['5.3', '5.4', '7.2', '7.3', '7.5.4'])
    for (const clause of record.evidence) expect(clause.shows.length).toBeGreaterThan(10)
    const by = Object.fromEntries(record.evidence.map(c => [c.clause, c.shows]))
    // The unopened invite slot is not a person who took part.
    expect(by['7.5.4']).toContain('2 attempts by people who began')
    expect(by['7.2']).toContain('for 1 of 2 attempts')
    // 7.3 names only the goals that have a criterion.
    expect(by['7.3']).toContain('Reach docs')
    expect(by['7.3']).not.toContain('Look around')
    expect(record.evidenceStatement).toContain('not a certificate')
    expect(JSON.stringify(record).toLowerCase()).not.toContain('compliant')
    const { evidence: _e, evidenceStatement: _s, ...rest } = record
    expect(clauseEvidence(rest)).toEqual(record.evidence)
  })

  it('report <run> --json writes the record to stdout only', async () => {
    let out = ''
    let err = ''
    const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: data, env: { UI_TESTS_DATA_DIR: data } }
    expect(await main(['report', runId, '--json'], io)).toBe(0)
    expect(err).toBe('')
    const printed = JSON.parse(out)
    expect(printed.handle.run).toBe(runId)
    expect(runRecordSchema.safeParse(printed).success).toBe(true)
    out = ''
    expect(await main(['report', 'r_missing', '--json'], io)).toBe(2)
    expect(out).toBe('')
  })
})

describe('a withdrawn person', () => {
  it('keeps their verdict and none of their typed answer: neither in the answers nor in the verdict\'s diff', async () => {
    const own = new SqliteStore(':memory:')
    try {
      const { run } = await own.createRun(newRun('withdrawn', { compiled, hooksBundle: HOOKS }))
      const { attempt } = await own.createAttempt({ runId: run.run, participant: 'p_w', goalIndex: 5, rehearsal: false })
      await own.updateAttempt(attempt.id, {
        status: 'finished', reason: 'withdrew', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(40_000).toISOString(),
        verification: { status: 'incorrect', reason: 'The answer differs from the expected one', diff: { expected: 'Team', actual: 'typed-by-the-person' }, steps: [], answer: { status: 'incorrect', diff: { expected: 'Team', actual: 'typed-by-the-person' } } },
        answers: { 'Which plan was shown?': 'typed-by-the-person' },
      })
      const record = await buildRecord(own, run.run)
      expect(JSON.stringify(record)).not.toContain('typed-by-the-person')
      expect(record.attempts[0]!.verification).toMatchObject({ status: 'incorrect', answer: { status: 'incorrect' } })
      expect(record.attempts[0]!.answers).toEqual({})
    } finally { await own.close() }
  })
})
