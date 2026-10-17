import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { texture, rowAt, lineY, stretchAt, stops, travel } from '../apps/web/lib/texture'

/** Issue #51: the page's texture, as a model. What the canvas draws from it is in tests/e2e/site.spec.ts. */
describe('the page texture', () => {
  it('has twice the hero\'s old rows, the two sine terms at twice the amplitude, and twice the speed', () => {
    // 52 rows over the hero's height at 1440 (about 728px) where there were 26: 14px between rows, down the whole page.
    expect(texture.spacing).toBe(14)
    expect(Math.round(728 / texture.spacing)).toBe(52)
    expect(lineY(10, 0, 0) - lineY(9, 0, 0)).not.toBe(0)
    expect(texture.amplitude).toEqual([44, 12])
    expect(texture.speed).toBeCloseTo(0.22)
  })

  it('moves visibly but slowly: on every row a point travels at least 16px in two seconds, and none more than 32', () => {
    for (const start of [0, 2.5, 17, 140]) for (let index = 0; index < 700; index += 7) {
      let most = 0
      for (let x = 0; x <= 1440; x += texture.step) most = Math.max(most, travel(index, x, start, start + 2))
      expect(most, `row ${index} from ${start}s`).toBeGreaterThanOrEqual(16)
      expect(most, `row ${index} from ${start}s`).toBeLessThanOrEqual(32)
    }
  })

  it('gives each row its own stretch, drift and alpha in the stated ranges, varying smoothly by row, with no randomness', async () => {
    const rows = Array.from({ length: 600 }, (_, index) => rowAt(index))
    const span = (pick: (row: (typeof rows)[number]) => number) => [Math.min(...rows.map(pick)), Math.max(...rows.map(pick))]
    const [slowest, fastest] = span(row => row.drift), [shortest, longest] = span(row => row.stretch), [faintest, strongest] = span(row => row.alpha)
    expect(slowest).toBeGreaterThanOrEqual(0.003); expect(fastest).toBeLessThanOrEqual(0.012); expect(fastest - slowest).toBeGreaterThan(0.008)
    expect(shortest).toBeGreaterThanOrEqual(0.44); expect(longest).toBeLessThanOrEqual(0.76); expect(longest - shortest).toBeGreaterThan(0.3)
    expect(faintest).toBeGreaterThanOrEqual(0.35); expect(strongest).toBeLessThanOrEqual(texture.maxAlpha); expect(texture.maxAlpha).toBeLessThanOrEqual(0.7)
    // Smoothly: neighbouring rows differ by a small step of each range, never a jump.
    for (let index = 1; index < rows.length; index++) {
      expect(Math.abs(rows[index].drift - rows[index - 1].drift)).toBeLessThan(0.009 * 0.15)
      expect(Math.abs(rows[index].stretch - rows[index - 1].stretch)).toBeLessThan(0.32 * 0.1)
      expect(Math.abs(rows[index].alpha - rows[index - 1].alpha)).toBeLessThan(0.31 * 0.15)
    }
    // The same on every call, and no generator behind it.
    expect(rowAt(37)).toEqual(rowAt(37))
    expect(await readFile('apps/web/lib/texture.ts', 'utf8')).not.toMatch(/Math\.random|seed|mulberry/i)
  })

  it('drifts each stretch along its line at its own rate, wrapping only once the stretch is off the page', () => {
    const width = 1440
    for (const index of [0, 5, 23, 51]) {
      const { stretch, drift } = rowAt(index), now = stretchAt(index, width, 0), later = stretchAt(index, width, 1)
      expect(now.length).toBeCloseTo(stretch * width)
      expect(now.to - now.from).toBeCloseTo(now.length)
      // A second later the centre has moved by the row's drift, or wrapped round once it left the page.
      const moved = later.centre - now.centre
      if (moved > 0) expect(moved).toBeCloseTo(drift * width)
      else expect(now.to + drift * width).toBeGreaterThan(width + now.length - 1e-6)
      expect(now.from).toBeLessThanOrEqual(width); expect(now.to).toBeGreaterThanOrEqual(0)
    }
    // Rows do not move together: their centres are spread across the page.
    const centres = Array.from({ length: 52 }, (_, index) => stretchAt(index, width, 0).centre)
    expect(Math.max(...centres) - Math.min(...centres)).toBeGreaterThan(width / 2)
  })

  it('strokes each line nothing, grey, blue at the centre, grey, nothing', () => {
    expect(stops[0]).toEqual({ at: 0, colour: 'none' })
    expect(stops.at(-1)).toEqual({ at: 1, colour: 'none' })
    const blue = stops.filter(stop => stop.colour === 'accent')
    expect(blue).toEqual([{ at: 0.5, colour: 'accent' }])
    // The grey carries the line: the accent only in the middle third, reached through the line colour on either side.
    const before = stops.filter(stop => stop.at < 0.5), after = stops.filter(stop => stop.at > 0.5)
    expect(before.at(-1)).toMatchObject({ at: 1 / 3, colour: 'line' })
    expect(after[0]).toMatchObject({ at: 2 / 3, colour: 'line' })
    expect(stops.filter(stop => stop.colour === 'line').length).toBe(4)
    expect(texture).toMatchObject({ token: '--line', accentToken: '--wave-accent', groundToken: '--canvas' })
  })
})
