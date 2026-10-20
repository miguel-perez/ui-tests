import { describe, expect, it } from 'vitest'
import type { Signal } from '../src/signals.ts'
import type { RecordedEvent } from '../src/store/types.ts'
import { highlightReel } from '../src/trace/reel.ts'

const signal = (at: number, kind: Signal['kind'] = 'dead-click'): Signal => ({ kind, at, detail: kind })
const events: RecordedEvent[] = [{ type: 'url', at: 0, url: '/' }, { type: 'url', at: 60_000, url: '/x' }]

describe('highlightReel', () => {
  it('turns two signals 2 s apart into one merged window of 3 s either side', () => {
    const reel = highlightReel({ events, signals: [signal(20_000), signal(22_000, 'repeated-click')], words: [] })
    expect(reel).toHaveLength(1)
    expect(reel[0]).toMatchObject({ start: 17_000, end: 25_000, signal: { kind: 'dead-click' } })
  })

  it('keeps signals further apart than the padding as separate windows, in time order', () => {
    const reel = highlightReel({ events, signals: [signal(40_000), signal(10_000)], words: [] })
    expect(reel.map((moment) => [moment.start, moment.end])).toEqual([[7000, 13_000], [37_000, 43_000]])
  })

  it('attaches the words said inside a window to it', () => {
    const reel = highlightReel({ events, signals: [signal(20_000), signal(40_000)], words: [{ at: 21_000, text: 'where is it' }, { at: 39_000, text: 'huh' }, { at: 30_000, text: 'between' }] })
    expect(reel.map((moment) => moment.words)).toEqual([['where is it'], ['huh']])
  })

  it('never ends a window before it starts, for a signal outside the recorded span', () => {
    for (const at of [-10_000, 70_000]) {
      const [moment] = highlightReel({ events, signals: [signal(at)], words: [] })
      expect(moment!.start).toBeLessThanOrEqual(moment!.end)
      expect([moment!.start, moment!.end]).toEqual(at < 0 ? [0, 0] : [60_000, 60_000])
    }
  })

  it('stays inside the recorded span and honours padMs', () => {
    expect(highlightReel({ events, signals: [signal(1000), signal(59_000)], words: [] }).map((m) => [m.start, m.end])).toEqual([[0, 4000], [56_000, 60_000]])
    expect(highlightReel({ events, signals: [signal(20_000), signal(22_000)], words: [], padMs: 500 })).toHaveLength(2)
  })

  it('takes the span of 200,000 events without a spread', () => {
    const many: RecordedEvent[] = Array.from({ length: 200_000 }, (_, i) => ({ type: 'rrweb', at: i, url: '/' }))
    expect(highlightReel({ events: many, signals: [signal(100_000)], words: [] })).toMatchObject([{ start: 97_000, end: 103_000 }])
  })

  it('is empty without signals', () => {
    expect(highlightReel({ events, signals: [], words: [{ at: 1, text: 'a' }] })).toEqual([])
  })
})
