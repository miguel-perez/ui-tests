import { describe, it, expect } from 'vitest'
import { parse, reckon, tidy, duration } from '../apps/web/lib/worth'
import { worth } from '../apps/web/lib/copy'

const defaults = { pay: worth.given.pay.value, hours: worth.given.hours.value, share: worth.given.share.value, price: worth.given.price.value }

/** Issue #53, item 1: the arithmetic of "What a run is worth.", as a model. What the page shows from it is in tests/e2e/site.spec.ts. */
describe('what a run is worth', () => {
  it('shows the artefact numbers at the defaults: $65, $93, 0.65 h, about 39 minutes', () => {
    expect(reckon(defaults)).toEqual({ price: '60', wage: '65', rate: '93', hours: '0.65', time: '39\u00a0minutes' })
  })

  it('says minutes under 90 and hours to one place from 90 on, the number and the word never parted', () => {
    expect(reckon({ ...defaults, price: '120' })).toMatchObject({ price: '120', hours: '1.29', time: '77\u00a0minutes' })
    expect(reckon({ ...defaults, price: '200' })).toMatchObject({ price: '200', hours: '2.15', time: '2.2\u00a0hours' })
    expect(duration(1.49)).toBe('89\u00a0minutes')
    expect(duration(1.5)).toBe('1.5\u00a0hours')
  })

  it('reads the fields as the artefact does: commas and symbols ignored, anything else 0, the share at most 100', () => {
    expect(parse('$135,980')).toBe(135980)
    expect(parse('-5')).toBe(0)
    expect(parse('abc')).toBe(0)
    expect(parse('')).toBe(0)
    expect(parse('140', 'share')).toBe(100)
    expect(reckon({ ...defaults, hours: '' })).toMatchObject({ wage: '0', rate: '0', hours: '0.00', time: '0\u00a0minutes' })
  })

  it('writes a number back in the artefact format on leaving a field', () => {
    expect(tidy('135980', 'pay')).toBe('135,980')
    expect(tidy('12.5', 'price')).toBe('12.5')
    expect(tidy('abc', 'price')).toBe('abc')
  })
})
