import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordedEvent } from '../src/store/types.ts'
import { createRecorder, serializeSnapshot } from '../src/next/recorder.ts'

const page = (body: string) => parseHTML(`<!doctype html><html><body>${body}</body></html>`)
const fire = (window: Window, target: Element, type: string) => target.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event(type, { bubbles: true }))

function start(body: string) {
  const { window, document } = page(body)
  let clock = 1_000
  const got: RecordedEvent[] = []
  const recorder = createRecorder((events) => got.push(...events), { now: () => clock, mutationWindowMs: 300, pauseMs: 5000 })
  const detach = recorder.attach(document as unknown as Document)
  return { window: window as unknown as Window, document, got, detach, advance: (ms: number) => { clock += ms; vi.advanceTimersByTime(ms) } }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('the recorder', () => {
  it('records a click with no page change as changed: false', () => {
    const r = start('<button id="go">Go</button>')
    fire(r.window, r.document.getElementById('go')!, 'click')
    r.advance(400)
    expect(r.got).toMatchObject([{ type: 'click', target: '#go', changed: false }])
  })

  it('records a click followed by a page change within 300 ms as changed: true', () => {
    const r = start('<button id="go">Go</button><main id="m"></main>')
    fire(r.window, r.document.getElementById('go')!, 'click')
    r.advance(100)
    r.document.getElementById('m')!.appendChild(r.document.createElement('p'))
    r.advance(300)
    expect(r.got).toMatchObject([{ type: 'click', changed: true }])
  })

  it('records nothing for password and payment fields', () => {
    const r = start('<input id="p" type="password"><input id="c" autocomplete="cc-number"><input id="n" type="text" name="note">')
    fire(r.window, r.document.getElementById('p')!, 'input')
    fire(r.window, r.document.getElementById('c')!, 'input')
    r.advance(2000)
    expect(r.got).toEqual([])
  })

  it('records which field was typed in, never what was typed', () => {
    const r = start('<input id="n" type="text">')
    const field = r.document.getElementById('n') as unknown as HTMLInputElement
    field.value = 'secret words'
    fire(r.window, field, 'input')
    expect(r.got).toHaveLength(1)
    expect(r.got[0]).toMatchObject({ type: 'input', target: '#n' })
    expect(JSON.stringify(r.got)).not.toContain('secret')
    expect(r.got[0]).not.toHaveProperty('value')
  })

  it('notes a pause over 5 seconds when the person returns', () => {
    const r = start('<button id="go">Go</button>')
    r.advance(6000)
    fire(r.window, r.document.getElementById('go')!, 'click')
    r.advance(400)
    expect(r.got.map((e) => e.type)).toEqual(['pause', 'click'])
    expect(r.got[0]!.duration).toBeGreaterThan(5000)
  })

  it('stops recording once detached', () => {
    const r = start('<button id="go">Go</button>')
    r.detach()
    fire(r.window, r.document.getElementById('go')!, 'click')
    r.advance(400)
    expect(r.got).toEqual([])
  })
})

describe('serializeSnapshot', () => {
  it('masks input values and leaves out scripts and the bar', () => {
    const { document } = page('<input type="text" value="jane@example.com"><textarea>private</textarea><script>var x=1</script><div data-ui-tests>bar</div><p>hello</p>')
    const { dom, truncated } = serializeSnapshot(document as unknown as Document)
    expect(dom).toContain('hello')
    expect(dom).not.toContain('jane@example.com')
    expect(dom).not.toContain('private')
    expect(dom).not.toContain('var x=1')
    expect(dom).not.toContain('>bar<')
    expect(truncated).toBeUndefined()
  })

  it('cuts a 3 MB page at the limit and flags it', () => {
    const { document } = page(`<p>${'a'.repeat(3_000_000)}</p>`)
    const snapshot = serializeSnapshot(document as unknown as Document)
    expect(snapshot.dom.length).toBeLessThanOrEqual(2_000_000)
    expect(snapshot.truncated).toBe(true)
  })
})

describe('fitSnapshot', () => {
  it('shrinks a snapshot whose JSON passes the byte limit and flags it', async () => {
    const { fitSnapshot } = await import('../src/next/recorder.ts')
    const fitted = fitSnapshot({ url: '/', dom: '€'.repeat(2_000_000) })
    expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(4_900_000)
    expect(fitted.truncated).toBe(true)
  })
})
