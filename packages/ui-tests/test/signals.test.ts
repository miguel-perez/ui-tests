import { describe, expect, it } from 'vitest'
import { attemptSignals, type Signal } from '../src/signals.ts'
import type { AttemptRow, RecordedEvent, Verification } from '../src/store/types.ts'
import type { CompiledGoal } from '../src/schema/compiled.ts'

const goal = { index: 0, path: ['/', '/docs/getting-started'] } as CompiledGoal
const attempt = (patch: Partial<AttemptRow> = {}) => ({ id: 'a', answers: {}, reason: 'done', ...patch }) as AttemptRow
const signals = (events: RecordedEvent[], patch: Partial<AttemptRow> = {}, verification?: Verification): Signal[] => attemptSignals({ attempt: attempt(patch), events, goal, verification })
const kinds = (list: Signal[]) => list.map(s => s.kind)
const url = (path: string, at = 0): RecordedEvent => ({ type: 'url', at, url: `http://x${path}` })

describe('attemptSignals', () => {
  it('flags a click that changed nothing and names its target', () => {
    const [signal] = signals([{ type: 'click', at: 5, url: 'http://x/', target: 'button#save', changed: false }])
    expect(signal).toMatchObject({ kind: 'dead-click', target: 'button#save', at: 5 })
    expect(signals([{ type: 'click', at: 5, url: 'http://x/', target: 'a', changed: true }])).toEqual([])
  })
  it('flags a second click on the same target', () => {
    const click = (at: number): RecordedEvent => ({ type: 'click', at, url: 'http://x/', target: 'a#go', changed: true })
    expect(kinds(signals([click(0), click(500)]))).toEqual(['repeated-click'])
    expect(signals([click(0), click(9000)])).toEqual([])
  })
  it('flags a pause over 5 seconds only', () => {
    expect(kinds(signals([{ type: 'pause', at: 0, url: '/', duration: 6000 }]))).toEqual(['pause'])
    expect(signals([{ type: 'pause', at: 0, url: '/', duration: 4000 }])).toEqual([])
  })
  it('flags a page off the path and names it', () => {
    const [signal] = signals([url('/'), url('/pricing')])
    expect(signal).toMatchObject({ kind: 'deviation', url: 'http://x/pricing' })
    expect(signal.detail).toContain('/pricing')
    expect(signals([url('/'), url('/docs/getting-started/')])).toEqual([])
  })
  it('flags A to B to A as a backtrack', () => {
    expect(kinds(signals([url('/'), url('/docs/getting-started'), url('/')]))).toEqual(['backtrack'])
  })
  it('flags ease of 3 or below', () => {
    expect(kinds(signals([], { answers: { 'goal0.ease': 3 } }))).toEqual(['low-ease'])
    expect(signals([], { answers: { 'goal0.ease': 4 } })).toEqual([])
  })
  it('flags Done with an incorrect outcome', () => {
    expect(kinds(signals([], {}, { status: 'incorrect', steps: [] }))).toEqual(['false-done'])
    expect(signals([], {}, { status: 'correct', steps: [] })).toEqual([])
  })
  it('flags giving up and timing out', () => {
    expect(kinds(signals([], { reason: 'gave up' }))).toEqual(['gave-up'])
    expect(kinds(signals([], { reason: 'timeout' }))).toEqual(['timeout'])
  })
})
