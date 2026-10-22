import { describe, expect, it } from 'vitest'
import { resultOf, sampleSentence, sentence } from '../src/derive/sentence.ts'

const base = { n: 5, affecting: 1 / 3, attempted: 5, reached: 5, failed: 0, unknown: 0, result: 'none-found' as const, rehearsal: false, shape: 'happy-path' as const, goal: 'g' }

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
    const found = { ...base, failed: 2, reached: 3, result: 'problems-found' as const, goal: 'invite a colleague' }
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
    expect(sentence({ ...base, attempted: 2, reached: 2, result: 'inconclusive' })).toContain('2 of 5 attempts completed')
    // Four reached it and one could not be read: five completed, as the check title says, and the unknown is named, never rounded.
    expect(sentence({ ...base, attempted: 5, reached: 4, unknown: 1, result: 'inconclusive' })).toMatch(/^Inconclusive: 5 of 5 attempts completed, 1 of them could not be verified, /)
  })
})

describe('sentence, for a study that samples several groups', () => {
  const groups = [
    { name: 'Developer', quota: 3, attempted: 3, reached: 3, failed: 0, unknown: 0 },
    { name: 'Designer', quota: 2, attempted: 2, reached: 2, failed: 0, unknown: 0 },
  ]
  const several = { ...base, groups }
  it('says each group its own chance, of its own n, and never the pooled five', () => {
    const said = sentence(several)
    expect(said).toBe('Developer: Three people gave a 70% chance of seeing any problem that hits one in three; none was seen. Designer: Two people gave a 56% chance of seeing any problem that hits one in three; none was seen. That is not a completion rate.')
    expect(said).not.toMatch(/Five|87%/)
  })
  it('says the pending chance per group', () => {
    expect(sentence({ ...several, result: 'pending' })).toBe('Developer: Three people give a 70% chance of seeing any problem that hits at least one person in three. Designer: Two people give a 56% chance of seeing any problem that hits at least one person in three.')
  })
  it('says problems found per group, with each group\'s own counts', () => {
    const found = sentence({ ...several, result: 'problems-found', goal: 'invite a colleague', groups: [{ ...groups[0]!, reached: 2, failed: 1 }, groups[1]!] })
    expect(found).toBe('Developer: 1 of 3 could not invite a colleague; 2 of 3 reached the outcome by their own route. Designer: 0 of 2 could not invite a colleague; 2 of 2 reached the outcome by their own route.')
  })
  it('says inconclusive and rehearsal per group', () => {
    expect(sentence({ ...several, result: 'inconclusive', groups: [{ ...groups[0]!, attempted: 2, unknown: 1 }, { ...groups[1]!, attempted: 0 }] }))
      .toBe('Inconclusive. Developer: 2 of 3 attempts completed, 1 of them could not be verified. Designer: 0 of 2 attempts completed. That is not enough to say whether a problem that hits one in three was there.')
    expect(sentence({ ...several, rehearsal: true })).toBe('Rehearsal: 0 planned attempts recorded (Developer 0 of 3, Designer 0 of 2).')
  })
  it('reads exactly as before with one group', () => {
    expect(sentence({ ...base, groups: [{ name: 'everyone', quota: 5, attempted: 5, reached: 5, failed: 0, unknown: 0 }] })).toBe(sentence(base))
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
