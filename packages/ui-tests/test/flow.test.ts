import { describe, expect, it } from 'vitest'
import { afterTask, entryScreen, nextScreen } from '../src/player/flow.ts'
import type { Screen } from '../src/player/flow.ts'
import { view } from './player-fixtures.ts'

const goalQuestions = (id: string) => [
  { id: 'goal0.ease', text: 'e', type: 'scale' as const, points: 7 },
  { id: 'goal0.difficulty', text: 'd', type: 'open' as const, askIf: { id: 'goal0.ease', atOrBelow: 4 } },
  { id: 'goal0.confidence', text: 'c', type: 'scale' as const, points: 7 },
  ...(id ? [{ id, text: id, type: 'open' as const }] : []),
]

describe('nextScreen', () => {
  it('goes consent to card when the view has no screener, practice or first look', () => {
    expect(nextScreen(view(), { kind: 'consent' }, {})).toEqual({ kind: 'card' })
  })

  it('orders a link run screener, consent, practice, first look, card', () => {
    const v = view({ screener: [{ id: 's1', text: 'a', options: ['x'], multi: false }, { id: 's2', text: 'b', options: ['y'], multi: false }], practice: true, impression: { page: '/', flashMs: 500, question: 'What was that page for?' } })
    const path: Screen[] = [entryScreen(v)]
    while (path.at(-1)!.kind !== 'card') path.push(nextScreen(v, path.at(-1)!, {}))
    expect(path).toEqual([
      { kind: 'screener', index: 0 },
      { kind: 'screener', index: 1 },
      { kind: 'consent' },
      { kind: 'practice' },
      { kind: 'impression', phase: 'fixation' },
      { kind: 'impression', phase: 'flash' },
      { kind: 'impression', phase: 'question' },
      { kind: 'card' },
    ])
  })

  it('asks the difficulty at ease 4 and skips it at 5', () => {
    expect(nextScreen(view(), { kind: 'ease' }, { 'goal0.ease': 4 })).toEqual({ kind: 'difficulty' })
    expect(nextScreen(view(), { kind: 'ease' }, { 'goal0.ease': 5 })).toEqual({ kind: 'uxlite', item: 0 })
  })

  it('asks confidence only when nothing verifies the task', () => {
    const verified = view({ questions: goalQuestions('') })
    const unverified = view({ hasVerification: false, questions: goalQuestions('') })
    expect(nextScreen(verified, { kind: 'ease' }, { 'goal0.ease': 6 })).toEqual({ kind: 'thanks' })
    expect(nextScreen(unverified, { kind: 'ease' }, { 'goal0.ease': 6 })).toEqual({ kind: 'confidence' })
    expect(nextScreen(unverified, { kind: 'difficulty' }, { 'goal0.ease': 2 })).toEqual({ kind: 'confidence' })
  })

  it('asks the answer question first when the task has one', () => {
    const v = view({ answer: { question: 'Which plan?', choices: ['A', 'B'] } })
    expect(afterTask(v)).toEqual({ kind: 'answer' })
    expect(nextScreen(v, { kind: 'card' }, {})).toEqual({ kind: 'answer' })
    expect(nextScreen(v, { kind: 'answer' }, {})).toEqual({ kind: 'ease' })
  })

  it('walks the study questions after the last goal, then thanks', () => {
    const v = view()
    expect(nextScreen(v, { kind: 'uxlite', item: 0 }, {})).toEqual({ kind: 'uxlite', item: 1 })
    expect(nextScreen(v, { kind: 'uxlite', item: 1 }, {})).toEqual({ kind: 'comment' })
    expect(nextScreen(v, { kind: 'comment' }, {})).toEqual({ kind: 'thanks' })
  })
})

describe('entryScreen', () => {
  it('resumes where the attempt stands', () => {
    expect(entryScreen(view())).toEqual({ kind: 'consent' })
    expect(entryScreen(view({ status: 'consented' }))).toEqual({ kind: 'card' })
    expect(entryScreen(view({ status: 'questions' }))).toEqual({ kind: 'ease' })
    expect(entryScreen(view({ status: 'finished' }))).toEqual({ kind: 'thanks' })
  })
})
