import { describe, expect, it } from 'vitest'
import { clusterIssues, retitleWithModel, topThree } from '../src/issues.ts'
import type { Signal } from '../src/signals.ts'
import type { AttemptRow } from '../src/store/types.ts'

const attempt = (participant: string, patch: Partial<AttemptRow> = {}) => ({ id: `a-${participant}`, participant, goalIndex: 0, answers: {}, rehearsal: false, flags: [], reason: 'done', ...patch }) as AttemptRow
const dead = (at: number, target = 'h1', url = 'http://x/'): Signal => ({ kind: 'dead-click', at, url, target, detail: 'd' })
const gaveUp = (at: number): Signal => ({ kind: 'gave-up', at, url: 'http://x/docs/getting-started/', detail: 'g' })

describe('clusterIssues', () => {
  const attempts = [
    { attempt: attempt('p1', { verification: { status: 'correct', steps: [] }, environment: { assistive: 'Screen reader' }, answers: { 'goal0.difficulty': 'The heading looked like a button' } }), signals: [dead(900), dead(400)] },
    { attempt: attempt('p2', { environment: { device: 'Phone' } }), signals: [dead(700)] },
    { attempt: attempt('p3', { reason: 'gave up' }), signals: [gaveUp(100)] },
    { attempt: attempt('p4'), signals: [] },
    { attempt: attempt('p5'), signals: [] },
  ]
  it('ranks the blocked issue first with counts out of n, never a percentage', () => {
    const issues = clusterIssues({ n: 5, attempts })
    expect(issues.map(i => [i.impact, i.count, i.where.page])).toEqual([['blocked', '1 of 5', '/docs/getting-started/'], ['confused', '2 of 5', '/']])
    expect(issues.every(i => !i.count.includes('%'))).toBe(true)
  })
  it('lists who recovered, their words, access conditions and the earliest moment first', () => {
    const issue = clusterIssues({ n: 5, attempts })[1]!
    expect(issue.recovered).toEqual(['p1'])
    expect(issue.words).toEqual([{ participant: 'p1', text: 'The heading looked like a button' }])
    expect(issue.access).toEqual(['Phone', 'Screen reader'])
    expect(issue.moments[0]).toEqual({ attempt: 'a-p1', at: 400 })
    expect(issue.source).toBe('found from traces')
  })
  it('leaves out rehearsal, withdrawn, disconnected and retired attempts', () => {
    const skipped = [attempt('r', { rehearsal: true }), attempt('w', { reason: 'withdrew' }), attempt('d', { reason: 'disconnected' }), attempt('t', { flags: ['retired'] })].map(a => ({ attempt: a, signals: [dead(1)] }))
    expect(clusterIssues({ n: 5, attempts: skipped })).toEqual([])
  })
  it('takes the worst impact for a cluster and keeps goals apart', () => {
    const issues = clusterIssues({ n: 5, attempts: [
      { attempt: attempt('a'), signals: [{ kind: 'dead-click', at: 1, url: 'http://x/p', target: 'b', detail: '' }] },
      { attempt: attempt('b'), signals: [{ kind: 'timeout', at: 2, url: 'http://x/p', target: 'b', detail: '' }] },
      { attempt: attempt('c', { goalIndex: 1 }), signals: [{ kind: 'dead-click', at: 1, url: 'http://x/p', target: 'b', detail: '' }] },
    ] })
    expect(issues.map(i => [i.goalIndex, i.impact, i.count])).toEqual([[0, 'blocked', '2 of 5'], [1, 'confused', '1 of 5']])
  })
  it('returns three per goal and keeps the rest in the list', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(t => ({ attempt: attempt(`p${t}`), signals: [dead(1, t)] }))
    const issues = clusterIssues({ n: 5, attempts: many })
    expect(issues).toHaveLength(5)
    expect(topThree(issues, 0)).toHaveLength(3)
    expect(topThree(issues, 1)).toEqual([])
  })
  it('lets a model reword titles without changing counts', async () => {
    const [issue] = clusterIssues({ n: 5, attempts })
    const [reworded] = await retitleWithModel([issue!], { complete: async () => 'People got stuck on the guide' })
    expect(reworded).toMatchObject({ title: 'People got stuck on the guide', count: issue!.count })
    expect((await retitleWithModel([issue!], { complete: async () => { throw new Error('x') } }))[0]).toEqual(issue)
  })
  it('keeps two steps on one page apart and sets where.step', () => {
    const at = (step: number): Signal => ({ kind: 'pause', at: step, step, url: 'http://x/form', detail: '' })
    const issues = clusterIssues({ n: 5, attempts: [{ attempt: attempt('a'), signals: [at(0), at(1)] }, { attempt: attempt('b'), signals: [at(1)] }] })
    expect(issues.map(i => [i.where.step, i.count])).toEqual([[1, '2 of 5'], [0, '1 of 5']])
  })
  it('never merges an unknown page with a real one, and survives a malformed url', () => {
    const issues = clusterIssues({ n: 5, attempts: [
      { attempt: attempt('a', { reason: 'timeout' }), signals: [{ kind: 'timeout', at: 1, detail: '' }] },
      { attempt: attempt('b'), signals: [{ kind: 'timeout', at: 1, url: 'http://x/', detail: '' }, { kind: 'timeout', at: 2, url: 'http://[bad', detail: '' }] },
    ] })
    expect(issues.map(i => i.where.page).sort()).toEqual(['(unknown page)', '/'])
  })
  it('counts a person once across attempts and uses their latest attempt', () => {
    const first = attempt('a', { id: 'a1', startedAt: '2026-01-01', verification: { status: 'correct', steps: [] } })
    const later = attempt('a', { id: 'a2', startedAt: '2026-01-02' })
    const [issue] = clusterIssues({ n: 5, attempts: [{ attempt: later, signals: [dead(5)] }, { attempt: first, signals: [dead(1)] }] })
    expect(issue!.participants).toEqual(['a'])
    expect(issue!.recovered).toEqual([])
  })
  it('cleans the model reply to one line without markup', async () => {
    const [issue] = clusterIssues({ n: 5, attempts })
    const [out] = await retitleWithModel([issue!], { complete: async () => '**Stuck** <b>here</b>\nignore me' })
    expect(out!.title).toBe('Stuck bhere/b')
  })
  it('clusters a give-up and a low ease at the same step', () => {
    const a = attempt('a', { goalIndex: 0 })
    const issues = clusterIssues({ n: 5, attempts: [{ attempt: a, signals: [{ kind: 'gave-up', at: 1, step: 2, url: 'http://x/f', detail: '' }, { kind: 'low-ease', at: 1, step: 2, url: 'http://x/f', detail: '' }] }] })
    expect(issues).toHaveLength(1)
    expect(issues[0]!.where.step).toBe(2)
  })
})
