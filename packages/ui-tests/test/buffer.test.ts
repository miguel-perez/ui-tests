import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { RecordedEvent } from '../src/store/types.ts'
import { createBuffer } from '../src/next/buffer.ts'

const events = (n: number, from = 0): RecordedEvent[] => Array.from({ length: n }, (_, i) => ({ type: 'click' as const, at: from + i, url: '/', target: `#b${from + i}` }))

describe('the retry buffer', () => {
  it('keeps events in IndexedDB while post fails, then sends them once and in order', async () => {
    const db = new IDBFactory()
    const sent: RecordedEvent[][] = []
    let fail = 2
    const post = async (batch: RecordedEvent[]) => {
      if (fail > 0) { fail--; return false }
      sent.push(batch)
      return true
    }
    const buffer = createBuffer(post, db)
    await buffer.push(events(3))
    await buffer.flush()
    await buffer.push(events(2, 3))
    await buffer.flush()
    expect(sent).toEqual([])
    // A new buffer on the same database stands for the page coming back.
    const back = createBuffer(post, db)
    await back.flush()
    await back.flush()
    expect(sent.flat().map((e) => e.at)).toEqual([0, 1, 2, 3, 4])
  })

  it('sends 250 events as 100, 100 and 50', async () => {
    const sizes: number[] = []
    const buffer = createBuffer(async (batch) => { sizes.push(batch.length); return true }, new IDBFactory())
    await buffer.push(events(250))
    await buffer.flush()
    expect(sizes).toEqual([100, 100, 50])
  })

  it('keeps a batch within the byte limit', async () => {
    const big = (at: number): RecordedEvent => ({ type: 'rrweb', at, url: '/', data: 'x'.repeat(900_000) })
    const sizes: number[] = []
    const buffer = createBuffer(async (batch) => { sizes.push(batch.length); return true }, new IDBFactory())
    await buffer.push([big(1), big(2), big(3)])
    await buffer.flush()
    expect(sizes).toEqual([2, 1])
  })

  it('does not send a cleared event, and works without IndexedDB', async () => {
    const sent: number[] = []
    const buffer = createBuffer(async (batch) => { sent.push(...batch.map((e) => e.at)); return true }, new IDBFactory())
    await buffer.push(events(2))
    await buffer.clear()
    await buffer.flush()
    expect(sent).toEqual([])
    const memory = createBuffer(async (batch) => { sent.push(...batch.map((e) => e.at)); return true }, undefined)
    await memory.push(events(2))
    await memory.flush()
    expect(sent).toEqual([0, 1])
  })
})
