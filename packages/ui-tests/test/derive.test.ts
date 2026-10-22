import { beforeEach, describe, expect, it } from 'vitest'
import { example } from '../../../apps/web/lib/copy.ts'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileStudy, compileWithSnapshot } from '../src/compile.ts'
import { CARD_FOOTER, START_TASK } from '../src/copy.ts'
import { consentText, payoutLine } from '../src/derive/consent.ts'
import { neighbours, shuffleChoices } from '../src/derive/distractors.ts'
import type { StudySnapshot } from '../src/derive/snapshot.ts'
import { fillScenario, scenarioTemplate } from '../src/derive/scenario.ts'
import { NO_MODEL, textModelFor } from '../src/model.ts'

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
  it('gives a count its nearest whole numbers, none below zero', () => {
    expect(neighbours('10')).toEqual(['9', '11', '12'])
    expect(neighbours('1')).toEqual(['0', '2', '3'])
    expect(neighbours('0')).toEqual(['1', '2', '3'])
  })
  it('gives no neighbours where they are not plausible: years, prices, signed or padded numbers, and text', () => {
    for (const expected of ['2024', '19.99', '-3', '007', 'Team', '']) expect(neighbours(expected), expected).toBeUndefined()
  })
  it('shuffles the choices the same way for the same seed and keeps all of them', () => {
    const a = shuffleChoices('x', ['p', 'q', 'r'], 'seed'), b = shuffleChoices('x', ['p', 'q', 'r'], 'seed')
    expect(a).toEqual(b)
    expect([...a].sort()).toEqual(['p', 'q', 'r', 'x'])
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(s => shuffleChoices('x', ['p', 'q', 'r'], s)[0])).size).toBeGreaterThan(1)
  })
  it('pads nothing: a text answer has no distractors until the snapshot holds them, and the study is a draft until then', () => {
    study('s', { users: 'people' }, () => {
      task('one', {}, () => participant.answer('Q1', { expected: 'red' }))
      task('two', {}, () => participant.answer('Q2', { expected: 'blue' }))
    })
    const made = compileWithSnapshot(getStudies()[0], {})
    expect(made.compiled.goals.map(g => g.answer!.choices)).toEqual([['red'], ['blue']])
    expect(made.needs.distractors).toEqual({ Q1: 'red', Q2: 'blue' })
    expect(made.compiled.draft).toBe(true)
  })
  it('reads the distractors from the snapshot while they were drafted from the expected answer', () => {
    study('s', { users: 'people' }, () => { task('one', {}, () => participant.answer('Q1', { expected: 'red' })) })
    const entry = (from: string): StudySnapshot => ({ decoys: {}, groups: [], screens: [], distractors: { Q1: { from, value: ['green', 'yellow', 'orange'], source: 'model' } } })
    expect([...compileWithSnapshot(getStudies()[0], {}, entry('red')).compiled.goals[0].answer!.choices].sort()).toEqual(['green', 'orange', 'red', 'yellow'])
    expect(compileWithSnapshot(getStudies()[0], {}, entry('crimson')).compiled.goals[0].answer!.choices).toEqual(['red'])
  })
  it('reads an empty list in the snapshot as not drafted, so the study stays a draft that recruit refuses', () => {
    study('s', { users: 'people' }, () => { task('one', {}, () => participant.answer('Q1', { expected: 'red' })) })
    const made = compileWithSnapshot(getStudies()[0], {}, { decoys: {}, groups: [], screens: [], distractors: { Q1: { from: 'red', value: [], source: 'model' } } })
    expect(made.compiled.goals[0].answer!.choices).toEqual(['red'])
    expect(made.compiled.draft).toBe(true)
    expect(made.snapshot.reasons).toContain('distractors of "Q1" is not drafted yet')
  })
  it('reads a snapshot list with a blank or the expected answer in it as not drafted, so no choice that is not one reaches people', () => {
    for (const value of [['red'], [''], [' ', 'red'], ['blue', ''], ['blue', 'Red'], ['blue', ' red ']]) {
      resetStudies()
      study('s', { users: 'people' }, () => { task('one', {}, () => participant.answer('Q1', { expected: 'red' })) })
      const made = compileWithSnapshot(getStudies()[0], {}, { decoys: {}, groups: [], screens: [], distractors: { Q1: { from: 'red', value, source: 'model' } } })
      expect(made.compiled.goals[0].answer!.choices, JSON.stringify(value)).toEqual(['red'])
      expect(made.snapshot.reasons, JSON.stringify(value)).toContain('distractors of "Q1" is not drafted yet')
    }
  })
  it('gives a count its neighbours before the snapshot holds them, and asks the snapshot to show them for review', () => {
    study('s', { users: 'people' }, () => { task('one', {}, () => participant.answer('How many people did you invite?', { expected: '3' })) })
    const made = compileWithSnapshot(getStudies()[0], {})
    expect([...made.compiled.goals[0].answer!.choices].sort()).toEqual(['2', '3', '4', '5'])
    expect(made.needs.distractors).toEqual({ 'How many people did you invite?': '3' })
  })
  it('needs nothing drafted for distractors the author wrote', () => {
    study('s', { users: 'people' }, () => { task('one', {}, () => participant.answer('Q1', { expected: 'red', distractors: ['blue'] })) })
    const made = compileWithSnapshot(getStudies()[0], {})
    expect([...made.compiled.goals[0].answer!.choices].sort()).toEqual(['blue', 'red'])
    expect(made.needs.distractors).toEqual({})
  })
  it('refuses written distractors with no wrong answer among them, which would ask a question with one choice', () => {
    for (const distractors of [[], [''], ['red']]) {
      resetStudies()
      study('s', { users: 'people' }, () => { task('one', {}, () => participant.answer('Q1', { expected: 'red', distractors })) })
      expect(() => compileWithSnapshot(getStudies()[0], {}), JSON.stringify(distractors)).toThrow(/task "one": participant.answer\("Q1"\) has no distractors other than its expected answer/)
    }
  })
  it('refuses written distractors with a blank or the expected answer in another case among them, which would show as choices', () => {
    for (const distractors of [['blue', ''], ['blue', 'Red'], ['blue', ' red']]) {
      resetStudies()
      study('s', { users: 'people' }, () => { task('one', {}, () => participant.answer('Q1', { expected: 'red', distractors })) })
      expect(() => compileWithSnapshot(getStudies()[0], {}), JSON.stringify(distractors)).toThrow(/task "one": participant.answer\("Q1"\) has distractors that are blank or its expected answer "red"/)
    }
  })
  it('refuses the same question expecting different answers, whose drafted distractors would share one snapshot entry', () => {
    study('s', { users: 'people' }, () => {
      task('one', {}, () => participant.answer('Which plan?', { expected: 'Team' }))
      task('two', {}, () => participant.answer('Which plan?', { expected: 'Pro' }))
    })
    expect(() => compileWithSnapshot(getStudies()[0], {})).toThrow(/task "two" asks "Which plan\?" expecting "Pro", and an earlier task asks it expecting "Team"/)
  })
  it('shares one drafted entry between tasks asking the same question with the same answer, or where one writes its own', () => {
    study('s', { users: 'people' }, () => {
      task('one', {}, () => participant.answer('Which plan?', { expected: 'Team' }))
      task('two', {}, () => participant.answer('Which plan?', { expected: 'Team' }))
      task('three', {}, () => participant.answer('Which plan?', { expected: 'Pro', distractors: ['Team', 'Free'] }))
    })
    expect(compileWithSnapshot(getStudies()[0], {}).needs.distractors).toEqual({ 'Which plan?': 'Team' })
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
    expect(compileStudy(getStudies()[0], { product: 'Weekboard' }).impression).toMatchObject({ on: true, page: '/', prompt: "What do you make of that page? Say what it is, whose it is, what you can do there, and what it's for.", parts: ['what', 'who', 'action', 'purpose'] })
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
  it('holds the card words, and a model only when the author has a key', () => {
    expect(CARD_FOOTER).toBe("When you think you've finished, press Done. If you get stuck, press I couldn't do this.")
    expect(START_TASK).toBe('Start task')
    // One place for the model: the config's `model`; the key stays in the environment, and nothing stands in for either.
    expect(textModelFor(undefined, { ANTHROPIC_API_KEY: 'key' })).toEqual({ missing: NO_MODEL })
    expect(NO_MODEL).toContain("set model: { provider: 'anthropic', name } in ui-tests.config.ts")
    expect(textModelFor({ provider: 'anthropic', name: 'claude-sonnet-5-5' }, {})).toEqual({ missing: 'model is set in ui-tests.config.ts but ANTHROPIC_API_KEY is not in the environment' })
    expect(textModelFor({ provider: 'scripted', name: 'fixture' }, { ANTHROPIC_API_KEY: 'key' })).toHaveProperty('missing')
    expect(textModelFor({ provider: 'anthropic', name: 'claude-sonnet-5-5' }, { ANTHROPIC_API_KEY: 'key' })).toHaveProperty('model')
  })
})
