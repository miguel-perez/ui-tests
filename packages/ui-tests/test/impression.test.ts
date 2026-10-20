import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { codeImpression, codeImpressionWith } from '../src/derive/code-impression.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { FIRST_LOOK_SKIPPED, attachFirstLook, stubScreenshotter } from '../src/runner/screenshot.ts'
import { createCollector } from '../src/server/collector.ts'
import { participantView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { RunRow } from '../src/store/types.ts'
import { buildTrace } from '../src/trace/build.ts'
import { entryScreen, messageFor, nextScreen } from '../src/player/flow.ts'
import { view } from './player-fixtures.ts'
import { newRun } from './store-conformance.ts'

const purpose = 'see whether people can use what you built'

describe('codeImpression', () => {
  it('names the purpose when the answer shares two content words', async () => {
    expect(await codeImpression('to see if people can use what I built', purpose)).toBe('named the purpose')
  })
  it('names it on 40% of the purpose even with one shared word', async () => {
    // Purpose content words: invoice, send. One shared is 50%, under 2 words.
    expect(await codeImpression('a place for invoices', 'send invoice')).toBe('named the purpose')
    // One of five is 20%: not enough.
    expect(await codeImpression('a place for invoices', 'send an invoice to a client quickly')).toBe('did not name it')
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
  const v = (click: boolean, asked = false) => view({ impression: { page: '/', flashMs: 500, question: 'What was that page for?', asked, click } })
  it('goes fixation, flash, question, then the real page for the click, then the card', () => {
    expect(nextScreen(v(true), { kind: 'impression', phase: 'fixation' }, {})).toEqual({ kind: 'impression', phase: 'flash' })
    expect(nextScreen(v(true), { kind: 'impression', phase: 'flash' }, {})).toEqual({ kind: 'impression', phase: 'question' })
    expect(nextScreen(v(true), { kind: 'impression', phase: 'question' }, {})).toEqual({ kind: 'impression', phase: 'click' })
    expect(nextScreen(v(true), { kind: 'impression', phase: 'click' }, {})).toEqual({ kind: 'card' })
  })
  it('ends with the question when the page is not on the target', () => {
    expect(nextScreen(v(false), { kind: 'impression', phase: 'question' }, {})).toEqual({ kind: 'card' })
  })
  it('resumes at the click when the question was answered and the click was not', () => {
    expect(entryScreen({ ...v(true, true), status: 'consented' })).toEqual({ kind: 'impression', phase: 'click' })
  })
  it('sends the answer after the question and nothing from the other phases', () => {
    expect(messageFor(v(true), { kind: 'impression', phase: 'question' }, { impression: 'a tool' })).toEqual({ action: 'answers', impression: 'a tool' })
    for (const phase of ['fixation', 'flash', 'click'] as const) expect(messageFor(v(true), { kind: 'impression', phase }, {})).toBeUndefined()
  })
})

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
let run: RunRow
let collect: (request: Request) => Promise<Response>
let path: string[]
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
  path = compiled.goals[0]!.path ?? []
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
  const click = { target: 'a.cta', url: 'http://site.test/docs/getting-started/', at: 1 }
  async function consented() {
    const made = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    expect((await post(made.token, { action: 'consent' })).status).toBe(200)
    return made
  }
  const impressionOf = async (id: string) => (await store.getAttempt(id))!.answers.impression

  it('stores the coded answer, then the first click beside it with onPath, and shows both in the trace', async () => {
    const { attempt, token } = await consented()
    expect((await post(token, { action: 'answers', firstClick: click })).status).toBe(409)
    expect((await post(token, { action: 'answers', impression: 'to see if people can use what I built' })).status).toBe(200)
    expect((await post(token, { action: 'answers', firstClick: click })).status).toBe(200)
    const stored = await impressionOf(attempt.id)
    expect(stored).toMatchObject({ text: 'to see if people can use what I built', code: 'named the purpose', codedBy: 'rule', firstClick: { target: 'a.cta', url: click.url, at: 1 } })
    expect((stored as { firstClick: { onPath: unknown } }).firstClick.onPath).toBe(path.includes('/docs/getting-started') ? true : path.length ? false : null)
    expect((await buildTrace(store, run.run)).attempts[0]!.impression).toEqual(stored)
  })

  it('is onPath when the click led to a page on the path, not when it led elsewhere or stayed on the start, and null without a path', async () => {
    const { token, attempt } = await consented()
    await post(token, { action: 'answers', impression: 'x' })
    await post(token, { action: 'answers', firstClick: { target: 'a', url: 'http://site.test/elsewhere', at: 1 } })
    expect(((await impressionOf(attempt.id)) as { firstClick: { onPath: unknown } }).firstClick.onPath).toBe(path.length ? false : null)
  })

  it('keeps the click when the answer is sent again, and keeps the first of two clicks', async () => {
    const { attempt, token } = await consented()
    await post(token, { action: 'answers', impression: 'first words' })
    await post(token, { action: 'answers', firstClick: click })
    expect((await post(token, { action: 'answers', impression: 'other words' })).status).toBe(200)
    expect((await post(token, { action: 'answers', firstClick: { ...click, target: 'b' } })).status).toBe(200)
    expect(await impressionOf(attempt.id)).toMatchObject({ text: 'first words', firstClick: { target: 'a.cta' } })
  })

  it('records no click, with the reason, when the first-look page is not on the target', async () => {
    run = (await store.createRun(newRun('k2', { compiled: { ...run.compiled, impression: { ...run.compiled.impression, page: 'https://github.com/acme/app#readme' } }, hooksBundle: code }))).run
    const made = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    await post(made.token, { action: 'consent' })
    await post(made.token, { action: 'answers', impression: 'a readme' })
    expect(await impressionOf(made.attempt.id)).toMatchObject({ text: 'a readme', firstClick: null, firstClickReason: expect.stringContaining('not on the target') })
  })

  it('codes an empty answer as no answer', async () => {
    const { attempt, token } = await consented()
    await post(token, { action: 'answers', impression: '' })
    expect(await impressionOf(attempt.id)).toMatchObject({ text: '', code: 'no answer' })
  })

  it('leaves the view with the click still to take after the answer, and without the stage once the click is stored', async () => {
    const made = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    await attachFirstLook({ store, run, target: 'http://site.test', screenshotter: stubScreenshotter(png) })
    const { attempt, token } = made
    expect((await post(token, { action: 'consent' })).status).toBe(200)
    const shown = async () => participantView(run, (await store.getAttempt(attempt.id))!).impression
    expect(await shown()).toMatchObject({ asked: false, click: true })
    await post(token, { action: 'answers', impression: 'x' })
    expect(await shown()).toMatchObject({ asked: true, click: true })
    await post(token, { action: 'answers', firstClick: click })
    expect(await shown()).toBeUndefined()
  })
})

describe('when the picture cannot be taken', () => {
  it('says so on each attempt and in the trace, so never asked is not no answer', async () => {
    await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    await attachFirstLook({ store, run, target: 'http://site.test', screenshotter: { capture: async () => { throw new Error('no browser') } } })
    const [traced] = (await buildTrace(store, run.run)).attempts
    expect(traced!.firstLookSkipped).toBe('no browser')
    expect(traced!.impression).toBeUndefined()
    // A later run of recruit that can take it clears the mark.
    await attachFirstLook({ store, run, target: 'http://site.test', screenshotter: stubScreenshotter(png) })
    const [again] = (await buildTrace(store, run.run)).attempts
    expect(again!.firstLookSkipped).toBeUndefined()
    expect(again!.attempt.answers[FIRST_LOOK_SKIPPED]).toBeUndefined()
  })
})

describe('the page of the picture', () => {
  it('is firstLook.page, else the primary task start, as the participant view says', async () => {
    const goals = run.compiled.goals.map((g, i) => i === 0 ? { ...g, start: '/start-here', primary: true } : { ...g, primary: false })
    const bare = (await store.createRun(newRun('k3', { compiled: { ...run.compiled, goals, impression: { ...run.compiled.impression, page: undefined } }, hooksBundle: code }))).run
    await store.createAttempt({ runId: bare.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    const seen: string[] = []
    await attachFirstLook({ store, run: bare, target: 'http://site.test', screenshotter: stubScreenshotter(png, seen) })
    expect(seen).toEqual(['http://site.test/start-here'])
  })
})
