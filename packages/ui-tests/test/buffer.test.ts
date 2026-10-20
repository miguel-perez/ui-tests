import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { RecordedEvent } from '../src/store/types.ts'
import { REPLAY_BATCH_BYTES, createBuffer } from '../src/browser/buffer.ts'

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

  it('keeps the number an event was sent with, in IndexedDB and in memory, and numbers the rest by key', async () => {
    for (const db of [new IDBFactory(), undefined]) {
      const sent: RecordedEvent[] = []
      const buffer = createBuffer(async (batch) => { sent.push(...batch); return true }, db)
      await buffer.push([{ ...events(1)[0]!, seq: 1_792_000_000_000_000 }, ...events(1, 1)])
      await buffer.flush()
      expect(sent.map((e) => e.seq)).toEqual([1_792_000_000_000_000, expect.any(Number)])
      expect(sent[1]!.seq).not.toBe(1_792_000_000_000_000)
    }
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

  it('counts replay batches on limits of their own', async () => {
    const big = (at: number): RecordedEvent => ({ type: 'rrweb', at, url: '/', data: 'x'.repeat(1_900_000) })
    const sizes: number[] = []
    const buffer = createBuffer(async (batch) => { sizes.push(batch.length); return true }, new IDBFactory(), 'replay', { events: 100, bytes: REPLAY_BATCH_BYTES })
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

  it('resends a batch the server stored but the page never heard about, with the same sequence numbers', async () => {
    const db = new IDBFactory()
    const stored = new Map<number, RecordedEvent>()
    let lost = true
    const post = async (batch: RecordedEvent[]) => {
      for (const event of batch) stored.set(event.seq!, event)
      if (lost) { lost = false; return false }
      return true
    }
    const first = createBuffer(post, db)
    await first.push(events(3))
    await first.flush()
    await createBuffer(post, db).flush()
    expect([...stored.keys()]).toEqual([1, 2, 3])
    expect(stored.size).toBe(3)
  })

  it('keeps each attempt in its own database and deletes it on destroy', async () => {
    const db = new IDBFactory()
    const sent: number[] = []
    const post = async (batch: RecordedEvent[]) => { sent.push(...batch.map((e) => e.at)); return true }
    const one = createBuffer(post, db, 'a1')
    await one.push(events(2))
    await createBuffer(post, db, 'a2').flush()
    expect(sent).toEqual([])
    await one.destroy()
    await createBuffer(post, db, 'a1').flush()
    expect(sent).toEqual([])
  })
})
