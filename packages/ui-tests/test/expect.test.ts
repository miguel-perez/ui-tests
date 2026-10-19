import { describe, expect as check, it } from 'vitest'
import { AssertionFailure, MissingEvidence, expect } from '../src/index.ts'

describe('expect', () => {
  it('treats undefined evidence as missing, not as a failure', () => {
    check(() => expect(undefined).toContain('x')).toThrow(MissingEvidence)
  })
  it('reports expected, actual and operator when an assertion fails', () => {
    try { expect(['a']).toContain('b'); throw new Error('did not throw') } catch (error) {
      check(error).toBeInstanceOf(AssertionFailure)
      check(error).toMatchObject({ expected: 'b', actual: ['a'], operator: 'toContain' })
    }
  })
  it('supports toContain on arrays and strings', () => {
    expect(['a', 'b']).toContain('b')
    expect('abc').toContain('bc')
    check(() => expect('abc').toContain('z')).toThrow(AssertionFailure)
  })
  it('supports the other assertions', () => {
    expect(1).toBe(1)
    expect({ a: [1] }).toEqual({ a: [1] })
    expect([{ a: 1 }]).toContainEqual({ a: 1 })
    expect('x').toExist()
    expect(1).toBeTruthy()
    check(() => expect(null).toExist()).toThrow(AssertionFailure)
    check(() => expect(0).toBeTruthy()).toThrow(AssertionFailure)
    check(() => expect(1).toBe(2)).toThrow(AssertionFailure)
  })
})
