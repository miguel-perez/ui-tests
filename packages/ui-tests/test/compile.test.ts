import { beforeEach, describe, expect, it } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileStudy, compiledStudySchema } from '../src/compile.ts'

const { getStudies, resetStudies, study, task, outcome, setup, participant } = api
const config = { product: 'Weekboard' }

function evaluate(source: string) {
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', source.replace(/^import .*$/m, ''))(api.study, api.setup, api.task, api.outcome, api.expect, api.participant)
}
beforeEach(() => resetStudies())

describe('compileStudy', () => {
  it('compiles the Weekboard example', () => {
    evaluate(exampleFile)
    const compiled = compileStudy(getStudies()[0], config)
    expect(compiled.schema).toBe('https://ui-tests.com/schemas/compiled-study.v1.json')
    expect(compiled.sample.n).toBe(5)
    expect(compiled.sample.sentence).toBe('Five people give an 87% chance of seeing any problem that hits at least one person in three.')
    expect(compiled.record).toBe('video')
    expect(compiled.label).toBe('people who plan work with a team in a shared tool, plan the week together without emailing screenshots around')
    const [goal] = compiled.goals
    expect(goal).toMatchObject({ shape: 'happy-path', startFrom: 'setup', start: '/board', primary: true, hasOutcome: true, path: ['/board', '/settings/members'] })
    expect(goal.timeout.seconds).toBe(180)
    expect(compiled.impression).toMatchObject({ on: true, page: '/', flashMs: 500 })
    expect(compiled.questions[0].text).toBe('Would Weekboard be useful to you?')
    expect(goal.questions.map(q => q.id)).toEqual(['goal0.ease', 'goal0.difficulty'])
    expect(compiled.screener).toEqual([])
  })

  it('parses against the schema and holds no functions', () => {
    evaluate(exampleFile)
    const compiled = compileStudy(getStudies()[0], config)
    expect(compiledStudySchema.parse(JSON.parse(JSON.stringify(compiled)))).toEqual(compiled)
    expect(JSON.stringify(compiled, (_, v) => typeof v === 'function' ? 'FUNCTION' : v)).not.toContain('FUNCTION')
  })

  it('picks the shape and start of each task', () => {
    study('s', { users: 'people' }, () => {
      task('steps', {}, () => { task('one'); task('two', async () => {}) })
      task('outcome only', {}, () => outcome(async () => {}))
      task('explore', { minutes: 5 })
      task('answer', {}, () => participant.answer('Which?', { expected: 'B', distractors: ['A'] }))
      task('starts', { start: '/x', path: ['/y'] })
    })
    const goals = compileStudy(getStudies()[0], {}).goals
    expect(goals.map(g => g.shape)).toEqual(['steps', 'goal-only', 'time-boxed', 'goal-only', 'happy-path'])
    expect(goals.map(g => g.start)).toEqual(['/', '/', '/', '/', '/x'])
    expect(goals.map(g => g.startFrom)).toEqual(['root', 'root', 'root', 'root', 'option'])
    expect(goals[0].steps).toEqual([{ name: 'one', hasCheck: false }, { name: 'two', hasCheck: true }])
    expect(goals[0].timeout.seconds).toBe(180)
    expect(goals[2].timeout.seconds).toBe(300)
    expect(goals[3].answer).toMatchObject({ question: 'Which?', expected: 'B' })
    expect([...goals[3].answer!.choices].sort()).toEqual(['A', 'B'])
    expect(goals[3].questions.map(q => q.id)).toEqual(['goal3.ease', 'goal3.difficulty'])
    expect(goals[0].questions.map(q => q.id)).toContain('goal0.confidence')
    expect(goals[1].primary).toBe(true)
    expect(goals.filter(g => g.primary)).toHaveLength(1)
  })

  it('defaults the start to the first path page and turns the first look off after setup', () => {
    study('s', { users: 'people' }, () => { task('a', { path: ['/p', '/q'] }) })
    const compiled = compileStudy(getStudies()[0], {})
    expect(compiled.goals[0]).toMatchObject({ start: '/p', startFrom: 'path' })
    expect(compiled.impression.on).toBe(true)
    resetStudies()
    study('s', { users: 'people' }, () => { setup(async () => ({})); task('a') })
    expect(compileStudy(getStudies()[0], {}).impression).toMatchObject({ on: false, reason: expect.stringContaining('setup') })
  })

  it('prefers primary: true, then the only task with an outcome', () => {
    study('s', { users: 'people' }, () => { task('a'); task('b', { primary: true }); task('c', {}, () => outcome(async () => {})) })
    expect(compileStudy(getStudies()[0], {}).goals.map(g => g.primary)).toEqual([false, true, false])
    resetStudies()
    study('s', { users: 'people' }, () => { task('a'); task('c', {}, () => outcome(async () => {})) })
    expect(compileStudy(getStudies()[0], {}).goals.map(g => g.primary)).toEqual([false, true])
  })

  it('rejects invalid users and records a derivation for derived fields', () => {
    study('bad', { users: { are: 'a', within: 'soon' } }, () => { task('a') })
    expect(() => compileStudy(getStudies()[0], {})).toThrow(/within/)
    resetStudies()
    evaluate(exampleFile)
    const fields = compileStudy(getStudies()[0], config).derivations.map(d => d.field)
    for (const f of ['id', 'label', 'sample.n', 'sample.sentence', 'goals[0].shape', 'goals[0].start', 'goals[0].timeout', 'goals[0].scenario', 'impression', 'questions']) expect(fields).toContain(f)
  })

  it('reports undefined users and bad time limits with the study file and line', () => {
    study('s', {} as never, () => { task('a') })
    expect(() => compileStudy(getStudies()[0], {})).toThrow(/users/)
    resetStudies()
    study('t', { users: 'people' }, () => { task('a', { timeLimit: 'soon' }) })
    const s = getStudies()[0]
    let caught: unknown
    try { compileStudy(s, {}) } catch (e) { caught = e }
    expect(caught).toMatchObject({ name: 'StudyLoadError', file: s.file, line: s.tasks[0].line })
    expect((caught as Error).message).toContain('timeLimit')
    expect(s.file).not.toBe('')
  })
})
