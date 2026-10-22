import { describe, expect, it } from 'vitest'
import type { AuthoredTask } from '../src/authoring.ts'
import { detectionChance, sampleSentence, sampleSize } from '../src/derive/sample.ts'
import { goalTimeout } from '../src/derive/timeout.ts'
import { contextId, validateUsers } from '../src/derive/users.ts'

const taskWith = (options: AuthoredTask['options'], steps: string[] = []): AuthoredTask => ({ name: 't', options, steps: steps.map(name => ({ name, line: 0 })), outcomes: [], line: 0 })

describe('sample size', () => {
  it('is the smallest n reaching the confidence', () => {
    expect(sampleSize(1 / 3, 0.85)).toBe(5)
    expect(sampleSize(1 / 10, 0.85)).toBe(19)
    expect(Math.round(detectionChance(1 / 3, 5) * 100)).toBe(87)
  })
  it('rejects values outside 0..1', () => { expect(() => sampleSize(0, 0.85)).toThrow(); expect(() => sampleSize(0.5, 1)).toThrow() })
  it('writes the sentence', () => {
    expect(sampleSentence(5, 1 / 3)).toBe('Five people give an 87% chance of seeing any problem that hits at least one person in three.')
  })
})

describe('goalTimeout', () => {
  it('uses 90 seconds a page with a floor of 3 minutes', () => {
    expect(goalTimeout(taskWith({ path: ['/', '/docs/getting-started'] })).seconds).toBe(180)
    expect(goalTimeout(taskWith({ path: ['/a', '/b', '/c'] })).seconds).toBe(270)
    expect(goalTimeout(taskWith({}, ['a', 'b', 'c', 'd'])).seconds).toBe(360)
    expect(goalTimeout(taskWith({})).seconds).toBe(180)
  })
  it('prefers timeLimit', () => {
    expect(goalTimeout(taskWith({ timeLimit: '3 min' })).seconds).toBe(180)
    expect(goalTimeout(taskWith({ timeLimit: '90 s', path: ['/a', '/b', '/c', '/d'] })).seconds).toBe(90)
    expect(() => goalTimeout(taskWith({ timeLimit: 'soon' }))).toThrow(/timeLimit/)
  })
})

describe('users', () => {
  it('requires did in the object form, and derives are from it', () => {
    expect(validateUsers({ are: 'a' }).errors.map(e => e.field)).toEqual(['did'])
    expect(validateUsers({ did: 'x' }).errors).toEqual([])
  })
  it('names each bad field', () => {
    expect(validateUsers({ did: 'x', within: 'soon' }).errors.map(e => e.field)).toEqual(['within'])
    expect(validateUsers({ did: 'x', where: ['XX1'] }).errors.map(e => e.field)).toEqual(['where'])
    expect(validateUsers({ did: 'x', age: { min: 60, max: 20 } }).errors.map(e => e.field)).toEqual(['age'])
    expect(validateUsers({ did: 'x', often: 'hourly' } as never).errors.map(e => e.field)).toEqual(['often'])
    expect(validateUsers({ did: 'x', role: { Developer: 0 } }).errors.map(e => e.field)).toEqual(['role'])
    expect(validateUsers({ did: 'x', professionals: 'maybe' } as never).errors.map(e => e.field)).toEqual(['professionals'])
    expect(validateUsers({ did: 'x', screen: {} } as never).errors.map(e => e.field)).toEqual(['screen'])
  })
  it('accepts a valid object and a string', () => {
    expect(validateUsers({ did: 'x', within: '3 months', where: ['US', 'PT'], age: { min: 18, max: 65 }, language: 'pt-BR', role: { Developer: 3, Designer: 2 }, insiders: 'include' }).errors).toEqual([])
    expect(validateUsers('people').errors).toEqual([])
  })
  it('builds the id from both sentences', () => {
    expect(contextId('People who plan!', 'plan the week')).toBe('people-who-plan…plan-the-week')
    expect(contextId('x'.repeat(60), 'y').split('…')[0]).toHaveLength(40)
  })
})

describe('sample sentence phrasing', () => {
  it('says one person in k only for 1/k', () => {
    expect(sampleSentence(5, 1 / 3)).toContain('one person in three.')
    expect(sampleSentence(19, 1 / 10)).toContain('one person in ten.')
    expect(sampleSentence(5, 0.4)).toContain('at least 40% of people.')
    expect(sampleSentence(5, 0.15)).toContain('at least 15% of people.')
  })
  it('names users when missing and keeps non-Latin ids distinct', () => {
    expect(validateUsers(undefined as never).errors[0].field).toBe('users')
    const a = contextId('人们计划', '一起'), b = contextId('人们计划', '不同')
    expect(a).not.toBe(b)
    expect(contextId('!!!', '')).toMatch(/^[0-9a-f]{8}$/)
  })
})
