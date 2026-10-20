import { describe, expect, it } from 'vitest'
import { canRead, combine, optimisable } from '../src/consumers.ts'

const all = ['analysis by the author', 'model-assisted analysis of the trace', 'sharing the record with an automated workflow']

describe('consumer rules', () => {
  it('reads only what the person agreed to', () => {
    expect(canRead({ purposes: ['analysis by the author'], restrictions: [] }, 'words')).toBe(false)
    expect(canRead({ purposes: ['analysis by the author'], restrictions: [] }, 'recordings')).toBe(true)
    expect(canRead({ purposes: ['analysis by the author'], restrictions: [] }, 'workflow')).toBe(false)
    expect(canRead({ purposes: all, restrictions: [] }, 'words')).toBe(true)
    expect(canRead({ purposes: all, restrictions: [] }, 'workflow')).toBe(true)
    expect(canRead({ purposes: [], restrictions: [] }, 'recordings')).toBe(false)
  })
  it('lets a source restriction rule a reading out', () => {
    expect(canRead({ purposes: all, restrictions: ['no-recordings'] }, 'recordings')).toBe(false)
    expect(canRead({ purposes: all, restrictions: ['no-recordings'] }, 'words')).toBe(true)
  })
  it('optimises only on agent results', () => {
    expect(optimisable({ actor: 'human' })).toBe(false)
    expect(optimisable({ actor: 'agent' })).toBe(true)
  })
  it('never combines human and agent records', () => {
    expect(() => combine([{ actor: 'human' }, { actor: 'agent' }])).toThrow('human and agent records are never combined')
    expect(combine([{ actor: 'agent' }, { actor: 'agent' }]).actor).toBe('agent')
  })
})
