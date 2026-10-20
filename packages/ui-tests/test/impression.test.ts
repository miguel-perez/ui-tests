import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { codeImpression, codeImpressionWith } from '../src/derive/code-impression.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { attachFirstLook, stubScreenshotter } from '../src/runner/screenshot.ts'
import { createCollector } from '../src/server/collector.ts'
import { participantView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { RunRow } from '../src/store/types.ts'
import { buildTrace } from '../src/trace/build.ts'
import { FIRST_CLICK, messageFor, nextScreen } from '../src/player/flow.ts'
import { view } from './player-fixtures.ts'
import { newRun } from './store-conformance.ts'

const purpose = 'see whether people can use what you built'

describe('codeImpression', () => {
  it('names the purpose when the answer shares two content words', async () => {
    expect(await codeImpression('to see if people can use what I built', purpose)).toBe('named the purpose')
  })
  it('names it on 40% of the purpose even with one shared word', async () => {
    expect(await codeImpression('sharing plans', 'share the weekly plan with a team and review it')).toBe('named the purpose')
  })
  it('does not name it for an unrelated answer', async () => {
    expect(await codeImpression('a blog', purpose)).toBe('did not name it')
  })
  it('is no answer for empty or blank text', async () => {
    expect(await codeImpression('', purpose)).toBe('no answer')
    expect(await codeImpression('   \n', purpose)).toBe('no answer')
  })
  it('lets a model code it, and falls back to the rule when the model is unclear', async () => {
    expect(await codeImpressionWith('a blog', purpose, { complete: async () => '"named the purpose"' })).toEqual({ code: 'named the purpose', codedBy: 'model' })
    expect(await codeImpressionWith('a blog', purpose, { complete: async () => 'hmm' })).toEqual({ code: 'did not name it', codedBy: 'rule' })
    expect(await codeImpressionWith('a blog', purpose, { complete: async () => { throw new Error('down') } })).toEqual({ code: 'did not name it', codedBy: 'rule' })
  })
})

describe('the stage in the flow', () => {
  const v = view({ impression: { page: '/', flashMs: 500, question: 'What was that page for?' } })
  it('goes fixation, flash, question, click, card', () => {
    const phases = ['fixation', 'flash', 'question', 'click'] as const
    for (const [i, phase] of phases.entries()) {
      expect(nextScreen(v, { kind: 'impression', phase }, {})).toEqual(i + 1 < phases.length ? { kind: 'impression', phase: phases[i + 1] } : { kind: 'card' })
    }
  })
  it('sends the answer after the question and the click after the click', () => {
    expect(messageFor(v, { kind: 'impression', phase: 'question' }, { impression: 'a tool' })).toEqual({ action: 'answers', impression: 'a tool' })
    const click = { x: 0.2, y: 0.4, target: 'x' }
    expect(messageFor(v, { kind: 'impression', phase: 'click' }, { [FIRST_CLICK]: click })).toEqual({ action: 'answers', firstClick: click })
    expect(messageFor(v, { kind: 'impression', phase: 'flash' }, {})).toBeUndefined()
  })
})

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
let run: RunRow
let collect: (request: Request) => Promise<Response>
const endpoint = 'http://app.test/api/ui-tests'
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  studies = await loadBundle(code, file)
})
beforeEach(async () => {
  store = new SqliteStore(':memory:')
  collect = createCollector({ store: async () => store, cliSecret: 'cli-secret' })
  const compiled = compileStudy(studies[0], {})
  run = (await store.createRun(newRun('k', { compiled: { ...compiled, purpose, impression: { ...compiled.impression, on: true, page: '/landing' } }, hooksBundle: code }))).run
})
const post = (token: string, body: unknown) => collect(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))

describe('the picture', () => {
  it('is taken once from the first-look page and given to every unstarted attempt', async () => {
    const seen: string[] = []
    const a = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    const b = await store.createAttempt({ runId: run.run, participant: 'p2', goalIndex: 0, rehearsal: false })
    expect(await attachFirstLook({ store, run, target: 'http://site.test', screenshotter: stubScreenshotter(png, seen) })).toEqual({})
    expect(seen).toEqual(['http://site.test/landing'])
    for (const made of [a, b]) expect(participantView(run, (await store.getAttempt(made.attempt.id))!).impression).toMatchObject({ page: '/landing', flashMs: 500, question: 'What was that page for?' })
    // Asking again takes no second picture.
    await attachFirstLook({ store, run, target: 'http://site.test', screenshotter: stubScreenshotter(png, seen) })
    expect(seen).toHaveLength(1)
  })

  it('leaves the stage out of the view when none could be taken', async () => {
    const made = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    const result = await attachFirstLook({ store, run, target: 'http://site.test', screenshotter: { capture: async () => { throw new Error('no browser') } } })
    expect(result.error).toContain('no browser')
    expect(participantView(run, (await store.getAttempt(made.attempt.id))!).impression).toBeUndefined()
  })

  it('is served to its own attempt only, and 404 without one', async () => {
    const mine = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    const other = await store.createAttempt({ runId: run.run, participant: 'p2', goalIndex: 0, rehearsal: false })
    await attachFirstLook({ store, run, target: 'http://site.test', screenshotter: stubScreenshotter(png) })
    await store.updateAttempt(other.attempt.id, { answers: {} })
    const ok = await collect(new Request(`${endpoint}?shot=first-look`, { headers: { Authorization: `Bearer ${mine.token}` } }))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await ok.arrayBuffer())).toEqual(png)
    expect((await collect(new Request(`${endpoint}?shot=first-look`, { headers: { Authorization: `Bearer ${other.token}` } }))).status).toBe(404)
    expect((await collect(new Request(`${endpoint}?shot=first-look`))).status).toBe(401)
  })
})

describe('the answer and the click', () => {
  it('stores the coded answer, then the first click beside it, and shows both in the trace', async () => {
    const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    expect((await post(token, { action: 'consent' })).status).toBe(200)
    expect((await post(token, { action: 'answers', firstClick: { x: 0.1, y: 0.1, target: 't' } })).status).toBe(409)
    expect((await post(token, { action: 'answers', impression: 'to see if people can use what I built' })).status).toBe(200)
    expect((await post(token, { action: 'answers', firstClick: { x: 0.25, y: 0.5, target: '25% across, 50% down' } })).status).toBe(200)
    expect((await post(token, { action: 'answers', firstClick: { x: 2, y: 0, target: 't' } })).status).toBe(400)
    const expected = { text: 'to see if people can use what I built', code: 'named the purpose', codedBy: 'rule', firstClick: { x: 0.25, y: 0.5, target: '25% across, 50% down' } }
    expect((await store.getAttempt(attempt.id))!.answers.impression).toEqual(expected)
    expect((await buildTrace(store, run.run)).attempts[0]!.impression).toEqual(expected)
  })

  it('codes an empty answer as no answer', async () => {
    const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    await post(token, { action: 'consent' })
    await post(token, { action: 'answers', impression: '' })
    expect((await store.getAttempt(attempt.id))!.answers.impression).toMatchObject({ text: '', code: 'no answer' })
  })
})
