import { beforeEach, describe, expect, it } from 'vitest'
import { example } from '../../../apps/web/lib/copy.ts'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileStudy } from '../src/compile.ts'
import { CARD_FOOTER, START_TASK } from '../src/copy.ts'
import { consentText, payoutLine } from '../src/derive/consent.ts'
import { distractors, shuffleChoices } from '../src/derive/distractors.ts'
import { fillScenario, scenarioTemplate } from '../src/derive/scenario.ts'
import { nullModel } from '../src/model.ts'

const { getStudies, resetStudies, study, task, setup, participant, outcome } = api
function evaluate(source: string) {
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', source.replace(/^import .*$/m, ''))(api.study, api.setup, api.task, api.outcome, api.expect, api.participant)
}
beforeEach(() => resetStudies())

describe('scenario', () => {
  it('builds the template from who, why and the goal, with setup details except start', () => {
    expect(scenarioTemplate({ are: 'people who plan', purpose: 'plan the week', goal: 'invite a colleague', values: {} })).toBe('As one of the people who plan, you want to plan the week. Invite a colleague.')
    expect(scenarioTemplate({ are: 'a', purpose: 'b', goal: 'go', values: { start: '/x', email: 'sam@acme.example', name: 'Sam' } })).toBe('As one of the a, you want to b. Go. Use these details: email sam@acme.example, name Sam.')
  })
  it('fills {key} placeholders', () => { expect(fillScenario('Invite {name} at {email} {other}', { name: 'Sam', email: 'e' })).toBe('Invite Sam at e {other}') })
  it('never names the path or the outcome for the landing study', () => {
    evaluate(example)
    const [goal] = compileStudy(getStudies()[0], {}).goals
    expect(goal.scenario.text.toLowerCase()).toContain('start trying ui-tests')
    expect(goal.scenario.pinned).toBe(false)
    for (const page of goal.path ?? []) if (page !== '/') expect(goal.scenario.text).not.toContain(page)
  })
  it('pins an authored scenario', () => {
    study('s', { users: 'people' }, () => { task('a', { scenario: 'Do it {now}' }) })
    expect(compileStudy(getStudies()[0], {}).goals[0].scenario).toEqual({ text: 'Do it {now}', pinned: true })
  })
})

describe('distractors', () => {
  it('gives neighbours and double for numbers', () => { expect(distractors('10', [], 's')).toEqual(['9', '11', '20']) })
  it('takes up to two distinct pool strings, then pads', () => {
    expect(distractors('a', ['a', 'b', 'b', 'c', 'd'], 's')).toEqual(['b', 'c'])
    expect(distractors('a', ['b'], 's')).toEqual(['b', 'None of these'])
    expect(distractors('a', [], 's')).toEqual(['None of these'])
  })
  it('shuffles the choices the same way for the same seed and keeps all of them', () => {
    const a = shuffleChoices('x', ['p', 'q', 'r'], 'seed'), b = shuffleChoices('x', ['p', 'q', 'r'], 'seed')
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual(['p', 'q', 'r', 'x'])
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(s => shuffleChoices('x', ['p', 'q', 'r'], s)[0])).size).toBeGreaterThan(1)
  })
  it('compiles generated distractors from the other answers in the study', () => {
    study('s', { users: 'people' }, () => {
      task('one', {}, () => participant.answer('Q1', { expected: 'red' }))
      task('two', {}, () => participant.answer('Q2', { expected: 'blue' }))
    })
    const [one] = compileStudy(getStudies()[0], {}).goals
    expect([...one.answer!.choices].sort()).toEqual(['None of these', 'blue', 'red'])
    expect(compileStudy(getStudies()[0], {}).goals[0].answer!.choices).toEqual(one.answer!.choices)
  })
})

describe('consent', () => {
  it('writes the payout line', () => {
    expect(payoutLine()).toBe('You can stop at any time. This is unpaid.')
    expect(payoutLine({ minor: 750, currency: 'USD' })).toBe('You can stop at any time and still be paid $7.50.')
    expect(payoutLine({ minor: 500, currency: 'JPY' })).toContain('¥500')
  })
  it('names two purposes, three with workflows, and always carries the payout line', () => {
    const base = consentText({ product: 'Weekboard', author: 'Acme' }, { workflows: false })
    expect(base.purposes).toEqual(['analysis by the author', 'model-assisted analysis of the trace'])
    expect(base.text).toContain(base.payout)
    expect(base.payout).toBe('You can stop at any time. This is unpaid.')
    const flows = consentText({ product: 'Weekboard', author: '' }, { workflows: true, amount: { minor: 750, currency: 'USD' } })
    expect(flows.purposes).toHaveLength(3)
    expect(flows.purposes[2]).toBe('sharing the record with an automated workflow')
    expect(flows.text.join(' ')).toContain('automated workflow')
    expect(flows.text.at(-1)).toBe('You can stop at any time and still be paid $7.50.')
    expect(flows.retentionDays).toBe(90)
  })
  it('flows through the compiler from the config', () => {
    study('s', { users: 'people' }, () => { task('a') })
    const compiled = compileStudy(getStudies()[0], { consent: { workflows: true }, participants: { link: { amount: 750 }, budget: { max: 5000, currency: 'USD' } } })
    expect(compiled.consent.purposes).toHaveLength(3)
    expect(compiled.consent.payout).toBe('You can stop at any time and still be paid $7.50.')
  })
})

describe('impression', () => {
  it('is on for the Weekboard example at its page', () => {
    evaluate(exampleFile)
    expect(compileStudy(getStudies()[0], { product: 'Weekboard' }).impression).toMatchObject({ on: true, page: '/', flashMs: 500, question: 'What was that page for?' })
  })
  it('is off after setup without firstLook, naming setup', () => {
    study('s', { users: 'people' }, () => { setup(async () => ({ start: '/b' })); task('a') })
    expect(compileStudy(getStudies()[0], {}).impression).toMatchObject({ on: false, reason: expect.stringContaining('setup') })
  })
  it('is on after setup when firstLook names a page, and off for firstLook: false', () => {
    study('s', { users: 'people', firstLook: { page: '/landing' } }, () => { setup(async () => ({ start: '/b' })); task('a') })
    expect(compileStudy(getStudies()[0], {}).impression).toMatchObject({ on: true, page: '/landing' })
    resetStudies()
    study('s', { users: 'people', firstLook: false }, () => { task('a', { path: ['/a'] }, () => outcome(async () => {})) })
    expect(compileStudy(getStudies()[0], {}).impression.on).toBe(false)
  })
})

describe('copy and model', () => {
  it('holds the card words and no model by default', () => {
    expect(CARD_FOOTER).toBe("When you think you've finished, press Done. If you get stuck, press I couldn't do this.")
    expect(START_TASK).toBe('Start task')
    expect(nullModel).toBeUndefined()
  })
})
