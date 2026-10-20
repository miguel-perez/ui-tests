import { beforeEach, describe, expect, it } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileStudy, deriveScreener, fitScore, inferUsers, printUsersDraft, screen, STANDING_EXCLUSION } from '../src/compile.ts'
import { lint } from '../src/lint.ts'
import { refreshRun } from '../src/runner/progress.ts'
import { createCollector } from '../src/server/collector.ts'
import { participantView } from '../src/server/view.ts'
import { baseForm } from '../src/derive/screener.ts'
import { buildTrace } from '../src/trace/build.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { entryScreen, messageFor, nextScreen } from '../src/player/flow.ts'
import { newRun } from './store-conformance.ts'

const { getStudies, resetStudies } = api
const config = { product: 'Weekboard' }

function evaluate(source: string) {
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', source.replace(/^import .*$/m, ''))(api.study, api.setup, api.task, api.outcome, api.expect, api.participant)
}
function compileSource(source: string, cfg: Record<string, unknown> = config) {
  resetStudies()
  evaluate(source)
  const study = getStudies()[0]
  const compiled = compileStudy(study, cfg)
  return { study, compiled, findings: lint({ study, compiled, sourceText: source, config: cfg }) }
}
const sentenceStudy = (users: string) => `import { study, task, outcome } from 'ui-tests'
study('s', { users: ${JSON.stringify(users)}, purpose: 'plan the week' }, () => {
  task('plan', {}, () => { outcome(async () => {}) })
})`
beforeEach(() => resetStudies())

describe('the Weekboard screener', () => {
  it('has six questions, three from users and three from purpose, then the environment', () => {
    const { compiled } = compileSource(exampleFile)
    expect(compiled.screener.map(q => q.field)).toEqual(['did', 'uses', 'not', 'purpose', 'purpose', 'purpose', 'environment', 'environment', 'environment'])
    const texts = compiled.screener.map(q => q.text)
    expect(texts[0]).toBe('When did you last use a shared tool to plan work with a team?')
    expect(texts.slice(3, 6)).toEqual(['When did you last need to plan the week together without emailing screenshots around?', 'How do you do it today?', 'How much does it matter to you to get this right?'])
  })

  it('accepts the recency bands inside within and rejects the rest', () => {
    const [recency] = compileSource(exampleFile).compiled.screener
    expect(recency.options).toEqual([
      { label: 'In the past week', rule: 'accept' }, { label: 'In the past month', rule: 'accept' }, { label: 'In the past 3 months', rule: 'accept' },
      { label: 'Longer ago', rule: 'reject' }, { label: "I haven't", rule: 'reject' },
    ])
  })

  it('makes the window itself an accepting band, whatever its length', () => {
    const labels = (within?: string) => deriveScreener({ are: 'a', did: 'booked a trip', ...(within && { within }) }, '')[0]!.options.map(o => `${o.label}:${o.rule}`)
    expect(labels('1 month')).toEqual(['In the past week:accept', 'In the past month:accept', 'Longer ago:reject', "I haven't:reject"])
    expect(labels('6 weeks')).toEqual(['In the past week:accept', 'In the past month:accept', 'In the past 6 weeks:accept', 'Longer ago:reject', "I haven't:reject"])
    expect(labels('2 years')).toEqual(['In the past week:accept', 'In the past month:accept', 'In the past year:accept', 'In the past 2 years:accept', 'Longer ago:reject', "I haven't:reject"])
    expect(labels('3 days')).toEqual(['In the past 3 days:accept', 'Longer ago:reject', "I haven't:reject"])
    expect(labels()).toEqual(['In the past week:accept', 'In the past month:accept', 'Earlier this year:accept', "I haven't:reject"])
  })

  it('asks uses as a multi-select with one decoy and a rejecting None of these', () => {
    const uses = compileSource(exampleFile).compiled.screener.find(q => q.id === 'screener.uses')!
    expect(uses.multi).toBe(true)
    expect(uses.options.filter(o => o.rule === 'accept').map(o => o.label).sort()).toEqual(['Asana', 'Linear', 'Notion', 'Trello'])
    expect(uses.options.filter(o => o.rule === 'may-select')).toHaveLength(1)
    expect(uses.options.at(-1)).toEqual({ label: 'None of these', rule: 'reject' })
  })

  it('hides the exclusions among neutral options, with the standing exclusion always there', () => {
    const not = compileSource(exampleFile).compiled.screener.find(q => q.id === 'screener.not')!
    const rejecting = not.options.filter(o => o.rule === 'reject').map(o => o.label).sort()
    expect(rejecting).toEqual(['Has used Weekboard', STANDING_EXCLUSION].sort())
    expect(not.options.filter(o => o.rule === 'may-select').length).toBeGreaterThan(2)
    const bare = deriveScreener({ are: 'people' }, '').find(q => q.id === 'screener.not')!
    expect(bare.options.some(o => o.label === 'Work in UX, design, marketing or market research' && o.rule === 'reject')).toBe(true)
  })

  it('asks often and a broad then narrow role when users carries them', () => {
    const questions = deriveScreener({ are: 'engineers', did: 'shipped a UI', within: '3 months', often: 'weekly', role: 'engineering manager' }, '')
    expect(questions.map(q => q.id).slice(0, 4)).toEqual(['screener.recency', 'screener.often', 'screener.area', 'screener.role'])
    expect(questions[0]!.text).toBe('When did you last ship a UI?')
    expect(questions[1]!.options.map(o => o.rule)).toEqual(['accept', 'accept', 'reject', 'reject', 'reject'])
    expect(questions[2]!.options.every(o => o.rule === 'may-select' || o.label === 'None of these')).toBe(true)
    const role = questions[3]!
    expect(role.options.filter(o => o.rule === 'accept').map(o => o.label)).toEqual(['engineering manager'])
    expect(role.options.find(o => o.label === 'None of these')!.rule).toBe('reject')
  })

  it('never lets labels or rules reach the participant view', async () => {
    const { compiled } = compileSource(exampleFile)
    const store = new SqliteStore(':memory:')
    const { run } = await store.createRun(newRun('v', { compiled }))
    const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false })
    const view = participantView(run, attempt)
    expect(view.screener).toHaveLength(9)
    const json = JSON.stringify(view)
    for (const secret of ['"accept"', '"reject"', 'may-select', '"field"', '"rule"', compiled.label]) expect(json).not.toContain(secret)
    expect(view.practice).toBe(true)
    expect(view.screener[3]).toMatchObject({ multi: false })
    expect(view.screener[4]).toMatchObject({ open: true, options: [] })
  })

  it('reaches the view from the compiled study: brand and practice, and nothing for a rehearsal', async () => {
    const { compiled } = compileSource(exampleFile, { ...config, brand: { accent: '#0a7' } })
    expect(compiled.brand).toEqual({ name: 'Weekboard', accent: '#0a7' })
    const store = new SqliteStore(':memory:')
    const { run } = await store.createRun(newRun('b', { compiled }))
    const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false })
    expect(participantView(run, attempt)).toMatchObject({ brand: { name: 'Weekboard', accent: '#0a7' }, practice: true })
    const rehearsal = await store.createRun(newRun('r', { compiled, rehearsal: true }))
    const own = await store.createAttempt({ runId: rehearsal.run.run, participant: 'p', goalIndex: 0, rehearsal: true })
    expect(participantView(rehearsal.run, own.attempt)).toMatchObject({ screener: [], practice: false })
  })
})

describe('inferring users from a sentence', () => {
  it('reads a relative clause as did and a time phrase as within', () => {
    expect(inferUsers('developers who shipped a UI in the last month')).toEqual({
      users: { are: 'developers who shipped a UI in the last month', did: 'shipped a UI', within: '1 month' }, inferred: ['did', 'within'],
    })
    expect(inferUsers('people who booked a trip within the past 3 months').users).toMatchObject({ did: 'booked a trip', within: '3 months' })
    expect(inferUsers('people who plan work').inferred).toEqual(['did'])
    expect(inferUsers('busy parents').inferred).toEqual([])
  })

  it('prints a pasteable draft', () => {
    const { users } = inferUsers('developers who shipped a UI in the last month')
    expect(printUsersDraft(users)).toBe("users: { are: 'developers who shipped a UI in the last month', did: 'shipped a UI', within: '1 month' }")
  })

  it('compiles the inferred fields and marks the question', () => {
    const { compiled } = compileSource(sentenceStudy('developers who shipped a UI in the last month'))
    expect(compiled.users).toMatchObject({ did: 'shipped a UI', within: '1 month' })
    expect(compiled.screener[0]).toMatchObject({ id: 'screener.recency', text: 'When did you last ship a UI?', inferred: true })
    expect(compiled.screener[0]!.options.map(o => o.rule)).toEqual(['accept', 'accept', 'reject', 'reject'])
  })

  it('warns users-inferred with the draft, and users-did when there is no behaviour', () => {
    const inferred = compileSource(sentenceStudy('developers who shipped a UI in the last month')).findings.filter(f => f.rule === 'users-inferred')
    expect(inferred).toHaveLength(1)
    expect(inferred[0]).toMatchObject({ severity: 'warning' })
    expect(inferred[0]!.fix).toContain("users: { are: 'developers who shipped a UI in the last month'")
    expect(inferred[0]!.message).toContain("did 'shipped a UI'".replace(/'/g, '"'))
    const bare = compileSource(sentenceStudy('busy parents')).findings
    expect(bare.filter(f => f.rule === 'users-did')).toHaveLength(1)
    expect(bare.some(f => f.rule === 'users-inferred')).toBe(false)
    expect(compileSource(sentenceStudy('busy parents')).compiled.screener.map(q => q.field)).not.toContain('did')
  })

  it('does not ask an agent-only study for a behaviour', () => {
    const source = sentenceStudy('busy parents').replace("purpose: 'plan the week' }", "purpose: 'plan the week', actors: ['agent'] }")
    expect(compileSource(source).findings.some(f => f.rule === 'users-did')).toBe(false)
  })

  it('stays quiet for the Weekboard object', () => {
    const { findings } = compileSource(exampleFile)
    expect(findings.filter(f => f.rule === 'users-inferred' || f.rule === 'users-did')).toEqual([])
  })
})

describe('screen and fitScore', () => {
  const questions = compileSource(exampleFile).compiled.screener
  const week = { 'screener.recency': 'In the past week' }

  it('rejects on a rejecting option, on no accepting option, and on None of these', () => {
    expect(screen({ ...week, 'screener.uses': ['Trello'] }, questions)).toBe('accept')
    expect(screen({ 'screener.recency': 'Longer ago' }, questions)).toBe('reject')
    expect(screen({ 'screener.recency': 'In the past 3 months' }, questions)).toBe('accept')
    expect(screen({ 'screener.recency': "I haven't" }, questions)).toBe('reject')
    expect(screen({ 'screener.uses': ['None of these'] }, questions)).toBe('reject')
    const decoy = questions.find(q => q.id === 'screener.uses')!.options.find(o => o.rule === 'may-select')!.label
    expect(screen({ 'screener.uses': [decoy] }, questions)).toBe('reject')
    expect(screen({ 'screener.uses': [decoy, 'Asana'] }, questions)).toBe('accept')
    expect(screen({ 'screener.not': ['Has used Weekboard', 'None of these'] }, questions)).toBe('reject')
    expect(screen({ 'screener.not': [STANDING_EXCLUSION] }, questions)).toBe('reject')
    expect(screen({ 'screener.not': ['None of these'] }, questions)).toBe('accept')
  })

  it('filters nobody on the fit and environment questions, and ignores unknown ids', () => {
    expect(screen({ 'screener.need': "I haven't", 'screener.matters': 'Not at all', 'screener.browser': 'Safari', 'screener.assistive': ['Screen reader'], 'screener.nonsense': 'x' }, questions)).toBe('accept')
  })

  it('scores recency 0 to 3, solving 0 or 1 and importance 0 to 3', () => {
    expect(fitScore({ 'screener.need': 'In the past week', 'screener.today': 'A spreadsheet and a lot of chat', 'screener.matters': 'A great deal' })).toEqual({ recency: 3, solving: 1, importance: 3, total: 7 })
    expect(fitScore({ 'screener.need': 'In the past month', 'screener.today': "I don't", 'screener.matters': 'Quite a bit' })).toEqual({ recency: 2, solving: 0, importance: 2, total: 4 })
    expect(fitScore({ 'screener.need': 'Earlier this year', 'screener.today': '', 'screener.matters': 'A little' })).toEqual({ recency: 1, solving: 0, importance: 1, total: 2 })
    expect(fitScore({ 'screener.need': "I haven't", 'screener.matters': 'Not at all' })).toEqual({ recency: 0, solving: 0, importance: 0, total: 0 })
    expect(fitScore({})).toEqual({ recency: 0, solving: 0, importance: 0, total: 0 })
  })
})

describe('the collector and the count', () => {
  const endpoint = 'http://app.test/api/ui-tests/'
  async function setup() {
    const { compiled } = compileSource(exampleFile)
    const store = new SqliteStore(':memory:')
    const { run } = await store.createRun(newRun('c', { compiled }))
    const collect = createCollector({ store: async () => store, now: () => Date.parse('2026-10-19T10:00:00.000Z') })
    const person = async () => {
      const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false })
      const send = (body: unknown) => collect(new Request(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))
      return { attempt, token, send }
    }
    return { store, run, person }
  }

  it('asks, records the result and still lets a person outside the users go on to consent', async () => {
    const { store, person } = await setup()
    const { attempt, send } = await person()
    const response = await send({ action: 'answers', screener: { 'screener.recency': 'Longer ago', 'screener.need': 'In the past week', 'screener.today': 'A spreadsheet', 'screener.matters': 'A great deal' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'created' })
    const row = (await store.getAttempt(attempt.id))!
    expect(row.status).toBe('created')
    expect(row.flags).toEqual([])
    expect(row.answers.screenerResult).toEqual({ matches: false, outside: ['accept the bands inside 3 months'], fit: { recency: 3, solving: 1, importance: 3, total: 7 } })
    expect((await send({ action: 'consent' })).status).toBe(200)
    expect((await send({ action: 'begin' })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))?.status).toBe('active')
  })

  it('keeps a person who fits, adds up their answers and records their environment', async () => {
    const { store, person } = await setup()
    const { attempt, send } = await person()
    expect((await send({ action: 'answers', screener: { 'screener.recency': 'In the past week' } })).status).toBe(200)
    const view = await (await send({ action: 'answers', screener: { 'screener.uses': ['Trello'], 'screener.browser': 'Safari', 'screener.device': 'Phone', 'screener.assistive': ['Screen reader', 'Voice control'] } })).json()
    expect(view.status).toBe('created')
    const row = (await store.getAttempt(attempt.id))!
    expect(row.flags).toEqual([])
    expect(row.answers.screenerResult).toMatchObject({ matches: true, outside: [] })
    expect(row.answers.screener).toMatchObject({ 'screener.recency': 'In the past week', 'screener.uses': ['Trello'] })
    expect(row.environment).toEqual({ browser: 'Safari', device: 'Phone', assistive: 'Screen reader, Voice control' })
    expect((await send({ action: 'consent' })).status).toBe(200)
  })

  it('sends the answers so far after each screener question', async () => {
    const { run, person } = await setup()
    const { attempt, send } = await person()
    const view = participantView(run, attempt)
    const answers = { [view.screener[0]!.id]: 'In the past week', [view.screener[1]!.id]: ['Trello'] }
    expect(messageFor(view, { kind: 'screener', index: 0 }, answers)).toEqual({ action: 'answers', screener: { 'screener.recency': 'In the past week' } })
    expect(messageFor(view, { kind: 'screener', index: 1 }, answers)).toEqual({ action: 'answers', screener: answers })
    expect((await send(messageFor(view, { kind: 'screener', index: 1 }, answers)!)).status).toBe(200)
  })

  it('counts a person outside the users like any other, and the trace shows what the screener made of them', async () => {
    const { store, run, person } = await setup()
    const { attempt, send } = await person()
    await send({ action: 'answers', screener: { 'screener.recency': "I haven't" } })
    await send({ action: 'consent' })
    await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', startedAt: new Date().toISOString(), verification: { status: 'correct', steps: [] } })
    const refreshed = await refreshRun(store, run.run, new Date())
    expect(refreshed.states.collection).toBe('collecting')
    const trace = await buildTrace(store, run.run)
    expect(trace.attempts).toHaveLength(1)
    expect(trace.attempts[0]!.screener).toMatchObject({ matches: false, outside: ['accept the bands inside 3 months'] })
    const match = await person()
    await match.send({ action: 'answers', screener: { 'screener.recency': 'In the past week' } })
    expect((await buildTrace(store, run.run)).attempts.find(a => a.attempt.id === match.attempt.id)!.screener).toMatchObject({ matches: true })
  })
})

describe('baseForm', () => {
  it('gives the base form of regular and irregular past tense', () => {
    const cases: [string, string][] = [
      ['added a card', 'add a card'], ['updated a plan', 'update a plan'], ['received an invoice', 'receive an invoice'], ['scheduled a meeting', 'schedule a meeting'],
      ['approved a request', 'approve a request'], ['shipped a UI', 'ship a UI'], ['planned the week', 'plan the week'], ['used a shared tool', 'use a shared tool'],
      ['tried a new tool', 'try a new tool'], ['moved a card', 'move a card'], ['deleted a board', 'delete a board'], ['edited a page', 'edit a page'],
      ['opened a file', 'open a file'], ['stopped a job', 'stop a job'], ['called support', 'call support'], ['managed a team', 'manage a team'],
      ['created a board', 'create a board'], ['waited for a reply', 'wait for a reply'], ['wrote a spec', 'write a spec'], ['ran a test', 'run a test'], ['built a page', 'build a page'],
      ['need a plan', 'need a plan'], ['ship a UI', 'ship a UI'],
    ]
    for (const [past, base] of cases) expect(baseForm(past), past).toBe(base)
  })
})
