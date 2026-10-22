import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as api from '../src/index.ts'
import { compileStudy, compileWithSnapshot } from '../src/compile.ts'
import { codeTour } from '../src/derive/code-impression.ts'
import { draftSnapshot } from '../src/derive/draft.ts'
import { pageSays } from '../src/derive/impression.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { createCollector } from '../src/server/collector.ts'
import { barView, participantView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { RunRow } from '../src/store/types.ts'
import { buildTrace } from '../src/trace/build.ts'
import { buildRecord } from '../src/record/build.ts'
import { entryScreen, messageFor, nextScreen } from '../src/player/flow.ts'
import { view } from './player-fixtures.ts'
import { newRun } from './store-conformance.ts'
import { GOAL_ORDER } from '../src/runner/sequence.ts'

const says = 'Send invoices and get paid on time. Free for freelancers.'
const model = (reply: string, seen: string[] = []) => ({ complete: async (prompt: string) => { seen.push(prompt); return reply } })

describe('what the page says', () => {
  it('is the first heading, else the meta description, else og:description, with its source', () => {
    expect(pageSays('<html><head><meta name="description" content="Send invoices."><meta property="og:description" content="og"></head><body><h1>Invoices,\n made simple</h1></body></html>')).toEqual({ says: 'Invoices, made simple', source: 'h1' })
    expect(pageSays('<html><head><meta name="description" content=" Send invoices. "><meta property="og:description" content="og"></head><body><p>x</p></body></html>')).toEqual({ says: 'Send invoices.', source: 'meta description' })
    expect(pageSays('<html><head><meta property="og:description" content="Invoices for freelancers"></head><body></body></html>')).toEqual({ says: 'Invoices for freelancers', source: 'og:description' })
    expect(pageSays('<html><body><p>nothing</p></body></html>')).toBeUndefined()
  })

  it('is read from the start page into the snapshot by lint -u, never from the purpose, and named when it cannot be', async () => {
    const page = '<html><head><meta name="description" content="Send invoices and get paid on time."></head></html>'
    const asked: string[] = []
    const fetched = (async (url: string) => { asked.push(url); return new Response(page) }) as unknown as typeof fetch
    const needs = { says: '/', decoys: {} }
    const { entry, notDrafted } = await draftSnapshot({ needs, groups: [], product: 'Acme', did: 'sent an invoice', pageUrl: 'http://site.test/', fetch: fetched })
    expect(asked).toEqual(['http://site.test/'])
    expect(entry.says).toEqual({ from: '/', value: 'Send invoices and get paid on time.', source: 'meta description' })
    expect(notDrafted).toEqual([])
    const down = (async () => { throw new Error('refused') }) as unknown as typeof fetch
    const missing = await draftSnapshot({ needs, groups: [], product: 'Acme', did: 'sent an invoice', pageUrl: 'http://site.test/', fetch: down })
    expect(missing.entry.says).toEqual({ from: '/', value: null, source: 'not drafted' })
    expect(missing.notDrafted).toEqual([{ item: 'firstLook.says', reason: 'http://site.test/ could not be read: refused' }])
  })

  it('compiles from the snapshot, or as written in firstLook.says, and is null until either', () => {
    const { study, resetStudies, getStudies, task, outcome } = api
    resetStudies()
    study('s', { users: { did: 'sent an invoice' }, purpose: 'get paid for my work' }, () => { task('send', { path: ['/'] }, () => outcome(async () => {})) })
    const authored = getStudies()[0]!
    expect(compileStudy(authored, {}).impression).toMatchObject({ on: true, page: '/', says: null, source: null })
    expect(compileStudy(authored, {}, { decoys: {}, groups: [], screens: [], says: { from: '/', value: says, source: 'og:description' } }).impression).toMatchObject({ says, source: 'og:description' })
    // Drafted for another page, it no longer holds.
    expect(compileStudy(authored, {}, { decoys: {}, groups: [], screens: [], says: { from: '/old', value: says, source: 'h1' } }).impression.says).toBeNull()
    resetStudies()
    study('s', { users: { did: 'sent an invoice' }, purpose: 'get paid for my work', firstLook: { says: 'Invoices for freelancers' } }, () => { task('send', { path: ['/'] }, () => outcome(async () => {})) })
    const written = compileWithSnapshot(getStudies()[0]!, {})
    expect(written.compiled.impression).toMatchObject({ says: 'Invoices for freelancers', source: 'author' })
    expect(written.needs.says).toBeUndefined()
    // Never the purpose.
    expect(written.compiled.impression.says).not.toContain('paid')
  })
})

describe('coding the answer, part by part, against what the page says', () => {
  it('codes each part with the model, and gives it what the page says, not the purpose', async () => {
    const seen: string[] = []
    const coded = await codeTour('an invoicing tool by Acme, where you send invoices', says, model('{"what": true, "who": true, "action": true, "purpose": false}', seen))
    expect(coded).toEqual({ parts: { what: true, who: true, action: true, purpose: false }, codedBy: 'model' })
    expect(seen[0]).toContain(says)
    expect(seen[0]).toContain('<answer>')
  })

  it('leaves the answer uncoded, with why, without a model, on a reply that does not parse, or when the model fails; never by a rule', async () => {
    expect(await codeTour('an invoicing tool', says)).toEqual({ parts: null, uncoded: 'no model is configured' })
    expect(await codeTour('an invoicing tool', says, model('yes, mostly'))).toEqual({ parts: null, uncoded: 'the model reply was not the four parts' })
    expect(await codeTour('an invoicing tool', says, model('{"what": true}'))).toEqual({ parts: null, uncoded: 'the model reply was not the four parts' })
    expect(await codeTour('an invoicing tool', says, { complete: async () => { throw new Error('down') } })).toEqual({ parts: null, uncoded: 'the model did not answer: down' })
    expect(await codeTour('   ', says, model('{}'))).toEqual({ parts: null, uncoded: 'no answer' })
    expect(await codeTour('an invoicing tool', null, model('{}'))).toEqual({ parts: null, uncoded: 'the study has no firstLook.says to code against' })
  })
})

describe('the tour in the flow', () => {
  const v = (looked: boolean) => view({ status: 'consented', impression: { page: '/', prompt: 'What do you make of that page?', looked } })
  it('goes from the look on the live page to the prompt, then the card', () => {
    expect(nextScreen(v(false), { kind: 'impression', phase: 'look' }, {})).toEqual({ kind: 'impression', phase: 'question' })
    expect(nextScreen(v(true), { kind: 'impression', phase: 'question' }, {})).toEqual({ kind: 'card' })
  })
  it('resumes at the prompt once the page was looked at', () => {
    expect(entryScreen(v(true))).toEqual({ kind: 'impression', phase: 'question' })
    expect(entryScreen(v(false))).toEqual({ kind: 'impression', phase: 'look' })
  })
  it('sends the answer after the prompt and nothing from the look, which the bar ends', () => {
    expect(messageFor(v(true), { kind: 'impression', phase: 'question' }, { impression: 'a tool' })).toEqual({ action: 'answers', impression: 'a tool' })
    expect(messageFor(v(false), { kind: 'impression', phase: 'look' }, {})).toBeUndefined()
  })
})

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
let run: RunRow
let collect: (request: Request) => Promise<Response>
const endpoint = 'http://app.test/api/ui-tests'

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  studies = await loadBundle(code, file)
})
beforeEach(async () => {
  store = new SqliteStore(':memory:')
  collect = createCollector({ store: async () => store, cliSecret: 'cli-secret' })
  const compiled = compileStudy(studies[0]!, {})
  run = (await store.createRun(newRun('k', { compiled: { ...compiled, impression: { ...compiled.impression, on: true, page: '/landing', says } }, hooksBundle: code }))).run
})
const post = (token: string, body: unknown) => collect(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))

describe('the tour on the server', () => {
  async function consented(participant = 'p1') {
    const made = await store.createAttempt({ runId: run.run, participant, goalIndex: 0, rehearsal: false })
    expect((await post(made.token, { action: 'consent' })).status).toBe(200)
    return made
  }
  const impressionOf = async (id: string) => (await store.getAttempt(id))!.answers.impression

  it('shows the live start page, untimed, then the four-part prompt: no picture, no flash and no time limit in the view', async () => {
    const { attempt, token } = await consented()
    const shown = async () => participantView(run, (await store.getAttempt(attempt.id))!)
    expect((await shown()).impression).toEqual({ page: '/landing', prompt: "What do you make of that page? Say what it is, whose it is, what you can do there, and what it's for.", looked: false })
    expect(barView(run, (await store.getAttempt(attempt.id))!).tour).toBe(true)
    expect((await post(token, { action: 'answers', looked: true })).status).toBe(200)
    expect((await shown()).impression).toMatchObject({ looked: true })
    expect(barView(run, (await store.getAttempt(attempt.id))!).tour).toBe(false)
    await post(token, { action: 'answers', impression: 'an invoicing tool' })
    expect((await shown()).impression).toBeUndefined()
  })

  it('stores the answer uncoded without a model, lists it in the record, and lets the author code it', async () => {
    const { attempt, token } = await consented()
    await post(token, { action: 'answers', looked: true })
    await post(token, { action: 'answers', impression: 'an invoicing tool' })
    expect(await impressionOf(attempt.id)).toEqual({ looked: true, text: 'an invoicing tool', parts: null, uncoded: 'no model is configured' })
    expect((await buildTrace(store, run.run)).attempts[0]!.impression).toEqual({ text: 'an invoicing tool', parts: null, uncoded: 'no model is configured' })
    expect((await buildRecord(store, run.run)).impression.uncoded).toEqual([{ attempt: attempt.id, reason: 'no model is configured' }])
  })

  it('codes the answer per part with a model, against the study\'s says', async () => {
    const seen: string[] = []
    collect = createCollector({ store: async () => store, model: model('{"what": true, "who": false, "action": true, "purpose": true}', seen) })
    const { attempt, token } = await consented()
    await post(token, { action: 'answers', looked: true })
    await post(token, { action: 'answers', impression: 'a place to send invoices' })
    expect(await impressionOf(attempt.id)).toEqual({ looked: true, text: 'a place to send invoices', parts: { what: true, who: false, action: true, purpose: true }, codedBy: 'model' })
    expect(seen[0]).toContain(says)
    expect((await buildRecord(store, run.run)).impression).toMatchObject({ answered: 1, coded: 1, parts: { what: 1, who: 0, action: 1, purpose: 1 } })
  })

  it('codes with the model the run pins from the config, through the server\'s own key, and says which is missing', async () => {
    const pinned = (await store.createRun(newRun('pinned', { compiled: { ...run.compiled, model: { provider: 'anthropic', name: 'claude-sonnet-5-5' } }, hooksBundle: code }))).run
    collect = createCollector({ store: async () => store, env: {} })
    const made = await store.createAttempt({ runId: pinned.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    await post(made.token, { action: 'consent' })
    await post(made.token, { action: 'answers', looked: true })
    await post(made.token, { action: 'answers', impression: 'an invoicing tool' })
    expect(await impressionOf(made.attempt.id)).toMatchObject({ parts: null, uncoded: 'model is set in ui-tests.config.ts but ANTHROPIC_API_KEY is not in the environment' })
    // A server that promises no model call (a local-only run) keeps the answer uncoded, with that reason.
    collect = createCollector({ store: async () => store, noModel: 'a local-only run makes no model call' })
    const local = await store.createAttempt({ runId: pinned.run, participant: 'p2', goalIndex: 0, rehearsal: false })
    await post(local.token, { action: 'consent' })
    await post(local.token, { action: 'answers', looked: true })
    await post(local.token, { action: 'answers', impression: 'an invoicing tool' })
    expect(await impressionOf(local.attempt.id)).toMatchObject({ parts: null, uncoded: 'a local-only run makes no model call' })
  })

  it('takes a spoken answer to the prompt, codes its words, and keeps the audio', async () => {
    const { attempt, token } = await consented()
    await post(token, { action: 'answers', looked: true })
    expect((await post(token, { action: 'voice', question: 'impression', audio: 'AAAA', contentType: 'audio/webm', transcript: 'it is for invoices' })).status).toBe(200)
    const answers = (await store.getAttempt(attempt.id))!.answers
    expect(answers.impression).toMatchObject({ looked: true, text: 'it is for invoices', parts: null })
    expect(typeof answers['impression.voice']).toBe('string')
  })

  it('calls the model only while the first look is waiting for its answer, typed or spoken', async () => {
    const seen: string[] = []
    collect = createCollector({ store: async () => store, model: model('{"what": true, "who": true, "action": true, "purpose": true}', seen) })
    const { attempt, token } = await consented()
    expect((await post(token, { action: 'answers', impression: 'too soon' })).status).toBe(409)
    expect((await post(token, { action: 'voice', question: 'impression', audio: 'AAAA', contentType: 'audio/webm', transcript: 'too soon' })).status).toBe(409)
    expect(seen).toHaveLength(0)
    await post(token, { action: 'answers', looked: true })
    await post(token, { action: 'answers', impression: 'first words' })
    expect(seen).toHaveLength(1)
    expect((await post(token, { action: 'answers', impression: 'again' })).status).toBe(200)
    expect((await post(token, { action: 'voice', question: 'impression', audio: 'AAAA', contentType: 'audio/webm', transcript: 'again' })).status).toBe(409)
    expect(seen).toHaveLength(1)
    expect(await impressionOf(attempt.id)).toMatchObject({ text: 'first words' })
  })

  it('takes the answer once, and only after the look', async () => {
    const { attempt, token } = await consented()
    expect((await post(token, { action: 'answers', impression: 'too soon' })).status).toBe(409)
    await post(token, { action: 'answers', looked: true })
    await post(token, { action: 'answers', impression: 'first words' })
    expect((await post(token, { action: 'answers', impression: 'other words' })).status).toBe(200)
    expect(await impressionOf(attempt.id)).toMatchObject({ text: 'first words' })
  })

  it('is asked once per person, before their first goal only', async () => {
    const compiled = run.compiled
    const second = (await store.createRun(newRun('two', { compiled: { ...compiled, goals: compiled.goals.slice(0, 2) }, hooksBundle: code }))).run
    const later = await store.createAttempt({ runId: second.run, participant: 'p', goalIndex: 1, rehearsal: false })
    await store.updateAttempt(later.attempt.id, { status: 'consented', answers: { [GOAL_ORDER]: [0, 1] } })
    expect(participantView(second, (await store.getAttempt(later.attempt.id))!).impression).toBeUndefined()
  })
})

describe('each task\'s first click', () => {
  it('is read from that task\'s own events, on its own start page, against its own path', async () => {
    const made = await store.createAttempt({ runId: run.run, participant: 'p1', goalIndex: 0, rehearsal: false })
    await store.updateAttempt(made.attempt.id, { status: 'finished', reason: 'done', startedAt: new Date(0).toISOString(), endedAt: new Date(9_000).toISOString(), verification: { status: 'correct', steps: [] } })
    const path = run.compiled.goals[0]!.path!
    await store.appendEvents(made.attempt.id, [
      { type: 'url', at: 0, url: `http://site.test${path[0]}`, seq: 1 },
      { type: 'click', at: 1000, url: `http://site.test${path[0]}`, target: 'a.cta', seq: 2 },
      { type: 'url', at: 1100, url: `http://site.test${path[1]}`, seq: 3 },
    ])
    expect((await buildTrace(store, run.run)).attempts[0]!.firstClick).toEqual({ target: 'a.cta', url: `http://site.test${path[1]}`, onPath: true, at: 1000 })
    expect((await buildRecord(store, run.run)).measures.byGoal['0']!.firstClick).toEqual({ onPath: 1, offPath: 0, of: 1 })
  })
})
