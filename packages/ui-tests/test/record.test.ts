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
      screener: { 'screener.today': 'a private spreadsheet' }, firstLookShot: 'blob_1', 'goal0.difficulty.voice': 'blob_2',
      screenerResult: { matches: true, outside: [], fit: { recency: 3, solving: 1, importance: 2, total: 6 } },
      impression: { text: 'a tool for invites', code: 'named the purpose', codedBy: 'rule', firstClick: { target: 'a#docs', url: 'http://t.test/docs/getting-started', onPath: true, at: 900 } },
    },
  })
  await store.appendEvents(first.id, [{ type: 'url', at: 0, url: 'http://t.test/', seq: 1 }, { type: 'url', at: 500, url: 'http://t.test/docs/getting-started', seq: 2 }])

  const second = (await store.createAttempt({ runId, participant: 'p_2', goalIndex: 5, rehearsal: false })).attempt
  await store.updateAttempt(second.id, {
    status: 'finished', reason: 'done', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(40_000).toISOString(),
    verification: { status: 'incorrect', reason: 'The answer differs from the expected one', diff: { expected: 'Team', actual: 'Solo' }, steps: [], answer: { status: 'incorrect', diff: { expected: 'Team', actual: 'Solo' } } },
    answers: { 'Which plan was shown?': 'Solo', firstLookSkipped: 'the page could not be pictured' },
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

  it('tells a first look never asked from one without an answer', async () => {
    const record = await buildRecord(store, runId)
    expect(record.attempts[1]).toMatchObject({ firstLook: 'never asked' })
    expect(record.attempts[1]!.answers).toHaveProperty('firstLookSkipped')
    expect(record.impression).toMatchObject({ named: 1, didNot: 0, noAnswer: 0, neverAsked: 1, denominator: 1, firstClickOnPath: { onPath: 1, offPath: 0, of: 1 } })
    expect(record.impression.limits).toContain('not a measure')
  })

  it('names effectiveness, efficiency, satisfaction and fit', async () => {
    const record = await buildRecord(store, runId)
    expect(record.measures.byGoal['0']).toMatchObject({
      effectiveness: { reached: 1, n: 1, unknown: 0 },
      efficiency: { medianAllMs: 20_000, medianVerifiedMs: 20_000, deviations: 0 },
      satisfaction: { ease: [6], confidence: [5] },
    })
    expect(record.measures.byGoal['5']).toMatchObject({ effectiveness: { reached: 0, n: 1 }, efficiency: { medianAllMs: 40_000 } })
    expect(record.measures.byGoal['5']!.efficiency.medianVerifiedMs).toBeUndefined()
    expect(record.measures.satisfaction.uxLite).toEqual({ n: 1, scores: [87.5], mean: 87.5, useful: { scores: [100], mean: 100 }, easy: { scores: [75], mean: 75 } })
    expect(record.measures.fit).toEqual({ scores: [6], summary: { n: 1, mean: 6, outOf: 7 } })
    expect(record.fit).toMatchObject({ screened: 1, matched: 1 })
    expect(record.recruitment.link).toMatchObject({ invited: 3, screened: 1, started: 2, finished: 2, paid: 0 })
    expect(record.money).toEqual({ estimate: 0, reserved: 0, paid: 0, truedUp: 0, currency: 'USD' })
    expect(record.revisions).toEqual([{ number: 1, undone: false, revision: { at: '2026-10-19T10:00:00.000Z', by: 'ana', kind: 'scenario', goalIndex: 0, text: 'Reworded the scenario' } }])
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
