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

describe('the recorder across navigation', () => {
  const withLocation = (r: ReturnType<typeof start>, href: string) => {
    ;(r.window as unknown as { location: { href: string } }).location = { href }
  }
  it('marks a click changed when the address changed within the window (hash link, pushState)', () => {
    const r = start('<a id="h">x</a>')
    const loc = { href: 'https://h.test/a' }
    ;(r.window as unknown as { location: unknown }).location = loc
    // attach happened before location existed; re-attach for a recorder that sees it
    r.detach()
    const got: RecordedEvent[] = []
    const rec = createRecorder((e) => got.push(...e), { now: () => 1000, mutationWindowMs: 300, pauseMs: 5000 })
    rec.attach(r.document as unknown as Document)
    fire(r.window, r.document.getElementById('h')!, 'click')
    loc.href = 'https://h.test/a#top'
    vi.advanceTimersByTime(300)
    expect(got.filter((e) => e.type === 'click')).toMatchObject([{ changed: true, url: 'https://h.test/a' }])
    expect(got.map((e) => e.type)).toContain('url')
    fire(r.window, r.document.getElementById('h')!, 'click')
    loc.href = 'https://h.test/b'
    vi.advanceTimersByTime(300)
    expect(got.filter((e) => e.type === 'click')[1]).toMatchObject({ changed: true })
  })

  it('emits a click as changed when the page unloads inside the window', () => {
    const r = start('<a id="h">x</a>')
    withLocation(r, 'https://h.test/')
    fire(r.window, r.document.getElementById('h')!, 'click')
    expect(r.got).toEqual([])
    r.window.dispatchEvent(new (r.window as unknown as { Event: typeof Event }).Event('pagehide'))
    expect(r.got.filter((e) => e.type === 'click')).toMatchObject([{ target: '#h', changed: true }])
    r.advance(400)
    expect(r.got.filter((e) => e.type === 'click')).toHaveLength(1)
  })

  it('keeps url and target within the collector limits', () => {
    const r = start(`<a id="${'i'.repeat(500)}">x</a>`)
    ;(r.document as unknown as { URL: string }).URL = 'https://h.test/' + 'u'.repeat(5000)
    fire(r.window, r.document.getElementById('i'.repeat(500))!, 'click')
    r.advance(400)
    expect(r.got[0]!.url.length).toBeLessThanOrEqual(2000)
    expect(r.got[0]!.target!.length).toBeLessThanOrEqual(300)
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
