import { describe, expect, it } from 'vitest'
import { UXLITE_VERSION, medians, uxLite } from '../src/measures.ts'

describe('uxLite', () => {
  it('turns each item into (response - 1) x 25 and scores their mean', () => {
    expect(uxLite(5, 3)).toEqual({ useful: 100, easy: 50, score: 75 })
    expect(uxLite(1, 1)).toEqual({ useful: 0, easy: 0, score: 0 })
    expect(uxLite(2, 5)).toEqual({ useful: 25, easy: 100, score: 62.5 })
  })
  it('names the wording version', () => expect(UXLITE_VERSION).toBe('uxlite-2024'))
})

describe('medians', () => {
  it('is the median of all times and of the verified ones, not a geometric mean', () => {
    const attempts = [
      { durationMs: 10_000, verified: true }, { durationMs: 1_000, verified: false }, { durationMs: 100_000, verified: true }, { durationMs: 4_000 },
    ]
    expect(medians(attempts)).toEqual({ allMs: 7_000, verifiedMs: 55_000 })
  })
  it('omits what it cannot say', () => {
    expect(medians([])).toEqual({})
    expect(medians([{ durationMs: 3_000, verified: false }, { verified: true }])).toEqual({ allMs: 3_000 })
  })
})
