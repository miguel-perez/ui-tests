import { describe, expect, it } from 'vitest'
import { resultOf, sampleSentence, sentence } from '../src/derive/sentence.ts'

const base = { n: 5, affecting: 1 / 3, f: 0, x: 5, result: 'none-found' as const, rehearsal: false, shape: 'happy-path' as const, goal: 'g' }

describe('sentence', () => {
  it('writes the sample sentence', () => {
    expect(sampleSentence(5, 1 / 3)).toBe('Five people give an 87% chance of seeing any problem that hits at least one person in three.')
  })
  it('says none were seen without calling it a completion rate', () => {
    expect(sentence(base)).toBe('Five people gave an 87% chance of seeing any problem that hits one in three; none was seen. That is not a completion rate.')
  })
  it('rehearsal counts planned attempts, digits only', () => {
    expect(sentence({ ...base, rehearsal: true })).toBe('Rehearsal: 0 of 5 planned attempts recorded.')
  })
  it('says what happened when problems were found, by shape', () => {
    const found = { ...base, f: 2, x: 3, result: 'problems-found' as const, goal: 'invite a colleague' }
    expect(sentence(found)).toBe('2 of 5 could not invite a colleague; 3 of 5 reached the outcome by their own route.')
    expect(sentence({ ...found, shape: 'goal-only' })).toContain('by their own route')
    expect(sentence({ ...found, shape: 'steps' })).toBe('2 of 5 could not invite a colleague; 3 of 5 completed the steps.')
  })
  it('spells only the leading number', () => {
    expect(sentence({ ...base, n: 19, affecting: 0.1, result: 'none-found' })).toMatch(/^Nineteen people gave an? 86% chance of seeing any problem that hits one in ten; none was seen/)
    expect(sentence({ ...base, n: 25, affecting: 0.1 })).toMatch(/^25 people/)
  })
  it('keeps pending on the sample sentence and inconclusive honest', () => {
    expect(sentence({ ...base, result: 'pending' })).toBe(sampleSentence(5, 1 / 3))
    expect(sentence({ ...base, x: 2, result: 'inconclusive' })).toContain('2 of 5 attempts completed')
  })
})

describe('resultOf', () => {
  it('stays pending until n counted attempts or the deadline', () => {
    expect(resultOf({ n: 5, verified: ['correct', 'unknown'], deadlinePassed: false })).toBe('pending')
    expect(resultOf({ n: 5, verified: ['incorrect'], deadlinePassed: false })).toBe('pending')
    expect(resultOf({ n: 5, verified: [], deadlinePassed: false })).toBe('pending')
  })
  it('finds problems from n attempts with one incorrect, or at the deadline', () => {
    expect(resultOf({ n: 5, verified: ['incorrect', 'correct', 'correct', 'correct', 'correct'], deadlinePassed: false })).toBe('problems-found')
    expect(resultOf({ n: 5, verified: ['incorrect'], deadlinePassed: true })).toBe('problems-found')
  })
  it('is none-found only with n attempts all correct', () => {
    expect(resultOf({ n: 2, verified: ['correct', 'correct'], deadlinePassed: false })).toBe('none-found')
  })
  it('is inconclusive with an unknown or too few at the deadline', () => {
    expect(resultOf({ n: 2, verified: ['correct', 'unknown'], deadlinePassed: false })).toBe('inconclusive')
    expect(resultOf({ n: 2, verified: ['correct', 'unknown'], deadlinePassed: true })).toBe('inconclusive')
    expect(resultOf({ n: 5, verified: ['correct'], deadlinePassed: true })).toBe('inconclusive')
  })
})
