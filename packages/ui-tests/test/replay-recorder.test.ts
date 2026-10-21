import { parseHTML } from 'linkedom'
import { describe, expect, it } from 'vitest'
import type { RecordedEvent } from '../src/store/types.ts'
import { BLOCK_SELECTOR, MASK_TEXT_SELECTOR, startReplay, type RrwebRecord } from '../src/browser/replay-recorder.ts'

const doc = () => parseHTML('<!doctype html><html><body></body></html>').document as unknown as Document
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function fake() {
  const calls: Record<string, unknown>[] = []
  let emit: ((event: { timestamp: number }) => void) | undefined
  let stopped = false
  const record: RrwebRecord = (options) => { calls.push(options); emit = options.emit as typeof emit; return () => { stopped = true } }
  return { calls, load: async () => ({ record }), emit: (event: { timestamp: number }) => emit!(event), stopped: () => stopped }
}

describe('startReplay', () => {
  it('loads rrweb only when called, masks every input and blocks the bar and private fields', async () => {
    let loaded = 0
    const f = fake()
    const got: RecordedEvent[] = []
    expect(loaded).toBe(0)
    startReplay(doc(), (events) => got.push(...events), { load: async () => { loaded++; return f.load() } })
    await tick()
    expect(loaded).toBe(1)
    expect(f.calls[0]).toMatchObject({ maskAllInputs: true, maskTextSelector: MASK_TEXT_SELECTOR, blockSelector: BLOCK_SELECTOR })
    // Text typed into a rich-text editor is masked as well, down to its nested nodes.
    const page = parseHTML('<!doctype html><html><body><div contenteditable="true"><p><b>typed</b></p></div><p>not editable</p></body></html>').document
    expect(page.querySelector('b')!.matches(MASK_TEXT_SELECTOR)).toBe(true)
    expect(page.querySelector('body > p')!.matches(MASK_TEXT_SELECTOR)).toBe(false)
    expect(BLOCK_SELECTOR).toContain('[data-ui-tests-root]')
    expect(BLOCK_SELECTOR).toContain('password')
    expect(BLOCK_SELECTOR).toContain('cc-')
    f.emit({ timestamp: 42 })
    expect(got).toMatchObject([{ type: 'rrweb', at: 42, data: { timestamp: 42 } }])
  })

  it('records nothing if stopped before rrweb arrives, and stops the recording when stopped after', async () => {
    const early = fake()
    startReplay(doc(), () => {}, { load: early.load })()
    await tick()
    expect(early.calls).toHaveLength(0)
    const late = fake()
    const stop = startReplay(doc(), () => {}, { load: late.load })
    await tick()
    stop()
    expect(late.stopped()).toBe(true)
  })

  it('stops for good at an event too large to send, rather than send a replay with a hole', async () => {
    const f = fake()
    const got: RecordedEvent[] = []
    let truncated = 0
    startReplay(doc(), (events) => got.push(...events), { load: f.load, maxEventBytes: 100, onTruncated: () => truncated++ })
    await tick()
    f.emit({ timestamp: 1 })
    f.emit({ timestamp: 2, big: 'x'.repeat(200) } as { timestamp: number })
    f.emit({ timestamp: 3 })
    expect(got.map((e) => e.at)).toEqual([1])
    expect(f.stopped()).toBe(true)
    expect(truncated).toBe(1)
  })

  it('survives rrweb failing to load', async () => {
    const stop = startReplay(doc(), () => {}, { load: async () => { throw new Error('offline') } })
    await tick()
    expect(() => stop()).not.toThrow()
  })
})
