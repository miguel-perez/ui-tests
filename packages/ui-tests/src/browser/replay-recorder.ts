import type { RecordedEvent } from '../store/types.ts'
import { ROOT_ATTRIBUTE } from './recorder.ts'

/** The few parts of rrweb's `record` this uses; the real one is loaded only once an attempt is on. */
export type RrwebRecord = (options: Record<string, unknown>) => (() => void) | undefined
export type ReplayOptions = {
  /** Loads rrweb; replaced in tests. */
  load?: () => Promise<{ record: RrwebRecord }>
  /** An event whose JSON is longer than this (in bytes) cannot be sent; recording stops rather than send a replay with a hole in it. */
  maxEventBytes?: number
  /** Called once, when recording stopped because an event was too large to send. */
  onTruncated?: () => void
}

/** The bar, password fields and payment fields are blocked outright: rrweb records a placeholder, not their content. */
export const BLOCK_SELECTOR = [`[${ROOT_ATTRIBUTE}]`, 'input[type="password" i]', '[autocomplete*="cc-" i]'].join(', ')

/** Text people type into the page outside a form field: a rich-text editor's content is masked as an input's value is (PRD 06: typing is kept without its values). */
export const MASK_TEXT_SELECTOR = '[contenteditable], [contenteditable] *'

/** The largest event the collector's replay batch can carry (its limit is 5,000,000 bytes for the whole batch). */
export const MAX_REPLAY_EVENT_BYTES = 4_000_000

const encoder = new TextEncoder()

/**
 * Records the page as rrweb events for the replay. Every typed and pre-filled value, and the text of anything editable, is masked and the bar and private fields are
 * blocked. rrweb is imported here, when an attempt has begun, so a visitor with no run never downloads it. Returns a stop function.
 */
export function startReplay(doc: Document, sink: (events: RecordedEvent[]) => void, options: ReplayOptions = {}): () => void {
  const load = options.load ?? (() => import('rrweb') as Promise<{ record: RrwebRecord }>)
  const maxBytes = options.maxEventBytes ?? MAX_REPLAY_EVENT_BYTES
  let stopped = false
  let stopRecording: (() => void) | undefined
  const stop = () => {
    if (stopped) return
    stopped = true
    stopRecording?.()
  }
  load()
    .then(({ record }) => {
      if (stopped) return
      stopRecording = record({
        emit(event: { timestamp: number }) {
          if (stopped) return
          const text = JSON.stringify(event)
          if (text.length > maxBytes / 3 && encoder.encode(text).length > maxBytes) { stop(); options.onTruncated?.(); return }
          sink([{ type: 'rrweb', at: event.timestamp, url: (doc.defaultView?.location?.href ?? doc.URL ?? '').slice(0, 2000), data: event }])
        },
        maskAllInputs: true,
        maskTextSelector: MASK_TEXT_SELECTOR,
        blockSelector: BLOCK_SELECTOR,
        sampling: { scroll: 150, mousemove: 100, input: 'last' },
      })
    })
    .catch(() => {})
  return stop
}
