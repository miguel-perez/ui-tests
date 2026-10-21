import type { RecordedEvent, Snapshot } from '../store/types.ts'

export type RecorderOptions = { now(): number; mutationWindowMs: number; pauseMs: number }

/** Marks the bar's own root, which the recorder and the snapshot leave out. */
export const ROOT_ATTRIBUTE = 'data-ui-tests-root'

const SCROLL_EVERY_MS = 500
const INPUT_EVERY_MS = 1000

const URL_MAX = 2000
const TARGET_MAX = 300
/** Keeps an event within the collector's field limits, so one long address cannot refuse a whole batch. */
const bound = (event: RecordedEvent): RecordedEvent => ({
  ...event,
  url: event.url.slice(0, URL_MAX),
  ...(event.target !== undefined && { target: event.target.slice(0, TARGET_MAX) }),
})

const inside = (node: Node | null) => {
  for (let at: Node | null = node; at; at = at.parentNode) if ((at as Element).hasAttribute?.(ROOT_ATTRIBUTE)) return true
  return false
}

/** A short selector for an element: an id, a test id, or up to three steps of tag and position. Never its text. */
export function shortSelector(element: Element): string {
  const steps: string[] = []
  for (let at: Element | null = element; at && at.nodeType === 1 && steps.length < 3; at = at.parentElement) {
    if (at.id) { steps.unshift(`#${at.id}`); break }
    const testId = at.getAttribute('data-testid')
    if (testId) { steps.unshift(`[data-testid="${testId}"]`); break }
    const tag = at.tagName.toLowerCase()
    if (tag === 'html' || tag === 'body') { steps.unshift(tag); break }
    const same = at.parentElement ? [...at.parentElement.children].filter((child) => child.tagName === at!.tagName) : []
    steps.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(at) + 1})` : tag)
  }
  return steps.join(' > ').slice(0, 300)
}

/** Password and payment fields are never recorded, not even that they were typed in. */
export function isPrivateField(element: Element): boolean {
  const type = (element.getAttribute('type') ?? '').toLowerCase()
  if (type === 'password') return true
  return (element.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).some((token) => token.startsWith('cc-'))
}

/**
 * Records what a participant does as events for the collector: clicks (with whether the page changed within the window),
 * URL changes, scrolls, which field was typed in (never what was typed), and pauses.
 */
export function createRecorder(sink: (events: RecordedEvent[]) => void, options: RecorderOptions): { attach(doc: Document): () => void } {
  return {
    attach(doc) {
      const view = doc.defaultView
      if (!view) return () => {}
      const url = () => view.location?.href ?? doc.URL ?? ''
      // Events leave in the order they happened; a click waits for its window to close.
      const queue: { event: RecordedEvent; ready: boolean }[] = []
      const drain = () => {
        const out: RecordedEvent[] = []
        while (queue[0]?.ready) out.push(queue.shift()!.event)
        if (out.length) sink(out.map(bound))
      }
      let last = options.now()
      let lastUrl = url()
      const lastInput = new Map<string, number>()
      let lastScroll = -Infinity
      const stamp = () => {
        const at = options.now()
        // A gap over the limit with no input is a pause, noted when the person comes back.
        if (at - last > options.pauseMs) queue.push({ event: { type: 'pause', at, url: url(), duration: at - last }, ready: true })
        last = at
        return at
      }
      const urlChanged = () => {
        const now = url()
        if (now === lastUrl) return false
        lastUrl = now
        queue.push({ event: { type: 'url', at: stamp(), url: now }, ready: true })
        drain()
        return true
      }

      const timers = new Set<ReturnType<typeof setTimeout>>()
      // Clicks whose window is still open; a page that unloads inside it settles them as changed.
      const open = new Set<() => void>()
      const onClick = (e: Event) => {
        const target = e.target as Element | null
        if (!target?.tagName || inside(target)) return
        const entry: { event: RecordedEvent; ready: boolean } = { event: { type: 'click', at: stamp(), url: url(), target: shortSelector(target), changed: false }, ready: false }
        queue.push(entry)
        const clickedAt = url()
        let mutated = false
        const Observer = view.MutationObserver
        const observer = Observer
          ? new Observer((records) => { if (records.some((r) => !inside(r.target))) mutated = true })
          : undefined
        observer?.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true })
        const settle = (unloading: boolean) => {
          clearTimeout(timer)
          timers.delete(timer)
          open.delete(unload)
          const pending = observer?.takeRecords?.() ?? []
          if (pending.some((r) => !inside(r.target))) mutated = true
          observer?.disconnect()
          entry.event.changed = unloading || mutated || url() !== clickedAt
          entry.ready = true
          urlChanged()
          drain()
        }
        const unload = () => settle(true)
        const timer = setTimeout(() => settle(false), options.mutationWindowMs)
        timers.add(timer)
        open.add(unload)
      }
      const onInput = (e: Event) => {
        const target = e.target as Element | null
        if (!target?.tagName || inside(target) || isPrivateField(target)) return
        const selector = shortSelector(target)
        const at = options.now()
        if (at - (lastInput.get(selector) ?? -Infinity) < INPUT_EVERY_MS) { last = at; return }
        lastInput.set(selector, at)
        queue.push({ event: { type: 'input', at: stamp(), url: url(), target: selector }, ready: true })
        drain()
      }
      const onScroll = (e: Event) => {
        if (inside(e.target as Node | null)) return
        const at = options.now()
        if (at - lastScroll < SCROLL_EVERY_MS) return
        lastScroll = at
        queue.push({ event: { type: 'scroll', at: stamp(), url: url(), data: { y: Math.round(view.scrollY ?? 0) } }, ready: true })
        drain()
      }
      const onNavigate = () => { urlChanged() }
      const onUnload = () => { for (const settle of [...open]) settle() }

      doc.addEventListener('click', onClick, true)
      doc.addEventListener('input', onInput, true)
      doc.addEventListener('scroll', onScroll, true)
      view.addEventListener('popstate', onNavigate)
      view.addEventListener('hashchange', onNavigate)
      view.addEventListener('pagehide', onUnload)
      view.addEventListener('beforeunload', onUnload)
      // Client-side navigation changes the URL without an event; check on the calls that do it.
      const history = view.history
      const originals: [keyof History, unknown][] = []
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = history?.[method]
        if (typeof original !== 'function') continue
        originals.push([method, original])
        history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
          const result = original.apply(this, args)
          urlChanged()
          return result
        }
      }
      return () => {
        doc.removeEventListener('click', onClick, true)
        doc.removeEventListener('input', onInput, true)
        doc.removeEventListener('scroll', onScroll, true)
        view.removeEventListener('popstate', onNavigate)
        view.removeEventListener('hashchange', onNavigate)
        view.removeEventListener('pagehide', onUnload)
        view.removeEventListener('beforeunload', onUnload)
        for (const [method, original] of originals) (history as unknown as Record<string, unknown>)[method] = original
        for (const timer of timers) clearTimeout(timer)
        timers.clear()
      }
    },
  }
}

const FIELD_TYPES_WITHOUT_VALUE = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image'])

/**
 * The page as markup for the end of an attempt. Typed and pre-filled values are masked, scripts and the bar are left out, and a
 * page past `limit` characters is cut there with `truncated: true`.
 */
export function serializeSnapshot(doc: Document, limit = 2_000_000): Snapshot {
  const root = doc.documentElement.cloneNode(true) as Element
  for (const element of [...root.querySelectorAll(`script, [${ROOT_ATTRIBUTE}]`)]) element.remove()
  for (const field of root.querySelectorAll('input')) {
    if (FIELD_TYPES_WITHOUT_VALUE.has((field.getAttribute('type') ?? '').toLowerCase())) continue
    field.removeAttribute('value')
  }
  for (const area of root.querySelectorAll('textarea')) area.textContent = ''
  const markup = `<!doctype html>${root.outerHTML}`
  const location = doc.defaultView?.location?.href ?? doc.URL ?? ''
  const truncated = markup.length > limit
  return { url: location.slice(0, 2000), dom: truncated ? markup.slice(0, limit) : markup, ...(truncated && { truncated: true }) }
}

/** Shrinks a snapshot until its JSON fits in `bytes` (the collector's limit for `end`, less room for the rest of the body). */
export function fitSnapshot(snapshot: Snapshot, bytes = 4_900_000): Snapshot {
  const encoder = new TextEncoder()
  let dom = snapshot.dom
  let truncated = snapshot.truncated
  while (encoder.encode(JSON.stringify({ ...snapshot, dom })).length > bytes && dom.length > 0) {
    dom = dom.slice(0, Math.floor(dom.length * 0.8))
    truncated = true
  }
  return { ...snapshot, dom, ...(truncated && { truncated: true }) }
}
