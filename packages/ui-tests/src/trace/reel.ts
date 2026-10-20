import type { Signal } from '../signals.ts'
import type { RecordedEvent } from '../store/types.ts'

export type ReelMoment = { start: number; end: number; signal: Signal; words: string[] }

/** How much of the recording is kept either side of a signal. */
export const REEL_PAD_MS = 3000

/**
 * The parts of a recording worth watching: a window around each signal, windows that touch merged into one, and the words the
 * person said inside a window attached to it. Windows stay inside the recorded span. A merged window keeps its earliest signal.
 */
export function highlightReel(input: { events: RecordedEvent[]; signals: Signal[]; words: { at: number; text: string }[]; padMs?: number }): ReelMoment[] {
  const pad = input.padMs ?? REEL_PAD_MS
  // A loop, not Math.min(...times): an attempt can hold more events than a call can take as arguments.
  let first = Infinity
  let last = -Infinity
  for (const event of input.events) {
    if (event.at < first) first = event.at
    if (event.at > last) last = event.at
  }
  if (!input.events.length) { first = -Infinity; last = Infinity }
  const windows: ReelMoment[] = []
  for (const signal of [...input.signals].sort((a, b) => a.at - b.at)) {
    // A signal outside the recorded span pins to its nearer edge, so a window never ends before it starts.
    const end = Math.max(first, Math.min(last, signal.at + pad))
    const start = Math.min(end, Math.max(first, signal.at - pad))
    const previous = windows.at(-1)
    if (previous && start <= previous.end) previous.end = Math.max(previous.end, end)
    else windows.push({ start, end, signal, words: [] })
  }
  for (const window of windows) {
    window.words = input.words.filter((word) => word.at >= window.start && word.at <= window.end).sort((a, b) => a.at - b.at).map((word) => word.text)
  }
  return windows
}

/** What a moment is called where it is listed: the signal's detail, with the words said during it. */
export const momentLabel = (moment: ReelMoment) => (moment.words.length ? `${moment.signal.detail} ("${moment.words.join(' ')}")` : moment.signal.detail)
