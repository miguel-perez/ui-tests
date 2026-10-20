import { describe, expect, it } from 'vitest'
import { agentResult, runResultOf } from '../src/agents/result.ts'

const trials = (states: string) => [...states].map(c => ({ state: ({ v: 'verified', s: 'stopped', u: 'unknown' } as const)[c as 'v' | 's' | 'u'] }))

describe('agentResult', () => {
  it('passes when every trial verified (pass^k)', () => {
    expect(agentResult(trials('vvvvv'), 'all')).toEqual({ result: 'pass', passK: true, passAtK: true })
  })
  it('fails when any trial stopped, and still reports pass@k', () => {
    expect(agentResult(trials('vvsvv'), 'all')).toEqual({ result: 'fail', passK: false, passAtK: true })
  })
  it('is inconclusive when a trial is unknown and none stopped; a stopped trial wins over an unknown one', () => {
    expect(agentResult(trials('vuvvv'), 'all')).toEqual({ result: 'inconclusive', passK: false, passAtK: true })
    expect(agentResult(trials('vusvv'), 'all').result).toBe('fail')
  })
  it('lets pass@k decide under reliability any', () => {
    expect(agentResult(trials('sssvs'), 'any')).toEqual({ result: 'pass', passK: false, passAtK: true })
    expect(agentResult(trials('sssss'), 'any').result).toBe('fail')
    expect(agentResult(trials('suuss'), 'any').result).toBe('inconclusive')
  })
  it('reads no pass from no trials', () => {
    expect(agentResult([], 'all')).toEqual({ result: 'inconclusive', passK: false, passAtK: false })
  })
  it('maps task results to the run result', () => {
    expect(runResultOf(['pass', 'pass'])).toBe('none-found')
    expect(runResultOf(['pass', 'fail', 'inconclusive'])).toBe('problems-found')
    expect(runResultOf(['pass', 'inconclusive'])).toBe('inconclusive')
  })
})
