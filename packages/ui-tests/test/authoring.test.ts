import { beforeEach, describe, expect, it } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'

const { study, task, outcome, setup, resetStudies, getStudies } = api

/** Evaluates a study file's source with the authoring API in scope, as the loader will. */
function evaluate(source: string) {
  const body = source.replace(/^import .*$/m, '')
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', body)(api.study, api.setup, api.task, api.outcome, api.expect, api.participant)
}

beforeEach(() => resetStudies())

describe('authoring', () => {
  it('evaluates the Weekboard example into one study with one task', async () => {
    evaluate(exampleFile)
    const [first, ...rest] = getStudies()
    expect(rest).toEqual([])
    expect(first.name).toBe('invite flow')
    expect(first.setup).toBeTypeOf('function')
    expect(first.tasks).toHaveLength(1)
    const [invite] = first.tasks
    expect(invite.name).toBe('invite a colleague')
    expect(invite.options.path).toEqual(['/board', '/settings/members'])
    expect(invite.options.timeLimit).toBe('3 min')
    expect(invite.options.firstLook).toBeUndefined()
    expect(first.options.firstLook).toEqual({ page: '/' })
    expect(invite.outcomes).toHaveLength(1)
    expect(first.legacy).toEqual([])
  })

  it('turns a task inside a task body into a step, with or without a check', () => {
    const check = async () => {}
    study('s', { users: 'people' }, () => {
      task('main', {}, () => {
        task('open billing')
        task('choose the new plan', check)
      })
    })
    const [{ steps }] = getStudies()[0].tasks
    expect(steps.map(step => step.name)).toEqual(['open billing', 'choose the new plan'])
    expect(steps[0].check).toBeUndefined()
    expect(steps[1].check).toBe(check)
    expect(getStudies()[0].tasks).toHaveLength(1)
  })

  it('accepts a task with only a body', () => {
    study('s', { users: 'people' }, () => { task('t', () => { outcome(() => {}) }) })
    expect(getStudies()[0].tasks[0].outcomes).toHaveLength(1)
  })

  it('records participant.answer on the task', () => {
    study('s', { users: 'people' }, () => {
      task('t', () => { api.participant.answer('Which plan?', { expected: 'Team', distractors: ['Solo'] }) })
    })
    expect(getStudies()[0].tasks[0].answer).toEqual({ question: 'Which plan?', expected: 'Team', distractors: ['Solo'] })
  })

  it('rejects calls outside their parent', () => {
    expect(() => outcome(() => {})).toThrow('outcome must be inside task')
    expect(() => task('t')).toThrow('task must be inside study')
    expect(() => setup(async () => ({}))).toThrow('setup must be inside study')
    study('s', { users: 'people' }, () => {
      expect(() => outcome(() => {})).toThrow('outcome must be inside task')
    })
  })

  it('names the new option for each old one', () => {
    study('s', { users: 'people', video: true }, () => {
      task('t', { happyPath: ['/a'], impression: false })
    })
    expect(getStudies()[0].legacy).toEqual([
      'study "s": "video" is now "record: \'video\'"',
      'task "t": "happyPath" is now "path"',
      // On a task, the first look moves to the study, so the message names where it goes.
      'task "t": "impression" is now "firstLook on the study"',
    ])
  })

  it('records the call site of the study and task', () => {
    study('s', { users: 'people' }, () => { task('t') })
    const [entry] = getStudies()
    expect(entry.file).toMatch(/authoring\.test\.ts$/)
    expect(entry.line).toBeGreaterThan(0)
    expect(entry.tasks[0].line).toBe(entry.line)
  })
})
