'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ParticipantView } from '../server/view.ts'
import type { RecordedEvent } from '../store/types.ts'
import { createBuffer } from './buffer.ts'
import type { Buffer } from './buffer.ts'
import { createRecorder, fitSnapshot, serializeSnapshot } from './recorder.ts'
import { Taskbar } from './taskbar.tsx'
import type { EndReason } from './taskbar.tsx'
import { chromeTheme, readHost } from './theme.ts'

export type UiTestsProps = {
  /** Where the collector is mounted. */
  endpoint?: string
}

/** The attempt and address whose page visit this load has recorded: one per real load, however often the effect runs. */
let visitRecorded: string | undefined

const ACTIVE = /(?:^|;\s*)ui-tests-active=1(?:;|$)/
const FLUSH_AFTER_MS = 1000
/** Fetches with a keepalive body only while it fits the browsers' 64 KB budget for it. */
const KEEPALIVE_BYTES = 60_000
const bytes = (text: string) => new TextEncoder().encode(text).length

/**
 * Mount once in the root layout. Without the participant's run cookie it renders nothing and loads nothing; with it, it records
 * the attempt, keeps events until the collector has them, and shows the bar.
 */
export function UiTests({ endpoint = '/api/ui-tests/' }: UiTestsProps) {
  const [view, setView] = useState<ParticipantView>()
  const [busy, setBusy] = useState(false)
  const [lateWarning, setLateWarning] = useState(false)
  const [moreTimeUsed, setMoreTimeUsed] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const buffer = useRef<Buffer | undefined>(undefined)

  // The marker cookie is readable on purpose: it only says that a run is on. The token itself is HttpOnly.
  useEffect(() => {
    if (!ACTIVE.test(document.cookie)) return
    let alive = true
    fetch(endpoint, { credentials: 'include', cache: 'no-store' })
      .then((response) => (response.ok ? (response.json() as Promise<ParticipantView>) : undefined))
      .then((next) => { if (alive && next) setView(next) })
      .catch(() => {})
    return () => { alive = false }
  }, [endpoint])

  const post = useMemo(
    () => async (body: unknown): Promise<Response> => {
      const text = JSON.stringify(body)
      return fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: text, keepalive: bytes(text) < KEEPALIVE_BYTES })
    },
    [endpoint],
  )

  const active = view?.status === 'active' ? view : undefined
  const attempt = active?.attempt
  // Which step is on survives a full navigation for this attempt; the collector keeps each step's snapshot.
  useEffect(() => { if (attempt) setStepIndex(readStep(attempt)) }, [attempt])

  // Recording: events go to the buffer, the buffer to the collector.
  useEffect(() => {
    if (!attempt) return
    const kept = createBuffer(async (events: RecordedEvent[]) => {
      try {
        const response = await post({ action: 'events', events })
        // A refusal a retry cannot mend (the attempt ended, or the token is for another run) is dropped, not retried for ever.
        return response.ok || (response.status >= 400 && response.status < 500)
      } catch {
        return false
      }
    }, undefined, `ui-tests-events:${attempt}`)
    buffer.current = kept
    let timer: ReturnType<typeof setTimeout> | undefined
    const flushSoon = () => { clearTimeout(timer); timer = setTimeout(() => void kept.flush(), FLUSH_AFTER_MS) }
    // Every event is numbered here, above anything the buffer has given out on an earlier page: a copy sent on its own and the kept
    // copy carry the same number, and the collector stores it once. Until IndexedDB has an event it is held here as well.
    const base = Date.now() * 1000
    let count = 0
    const held = new Map<number, RecordedEvent>()
    const keep = (events: RecordedEvent[]): RecordedEvent[] => {
      const numbered = events.map((event) => ({ ...event, seq: base + count++ }))
      for (const event of numbered) held.set(event.seq, event)
      void kept.push(numbered).then(() => { for (const event of numbered) held.delete(event.seq) }, () => {}).then(flushSoon)
      return numbered
    }
    const sendNow = (events: RecordedEvent[]) => { if (events.length) void post({ action: 'events', events: events.slice(0, 100) }).catch(() => {}) }
    const recorder = createRecorder((events) => void keep(events), { now: Date.now, mutationWindowMs: 300, pauseMs: 5000 })
    const detach = recorder.attach(document)
    // The page this document opened on, once per load (React's strict mode runs this effect twice). A full navigation starts a new
    // recorder, which sees no change of address of its own; the visit also goes out at once, so leaving fast does not lose it.
    const href = location.href.slice(0, 2000)
    if (visitRecorded !== `${attempt} ${href}`) {
      visitRecorded = `${attempt} ${href}`
      sendNow(keep([{ type: 'url', at: Date.now(), url: href }]))
    }
    const replay = () => void kept.flush()
    // Leaving: what IndexedDB does not have yet (a click that navigates away) goes out on a keepalive request, then the rest.
    const leave = () => { sendNow([...held.values()]); replay() }
    // What was left from a lost connection or a reload replays now; what still cannot be sent stays kept for the next visit.
    replay()
    window.addEventListener('online', replay)
    window.addEventListener('pagehide', leave)
    return () => {
      detach()
      clearTimeout(timer)
      window.removeEventListener('online', replay)
      window.removeEventListener('pagehide', leave)
    }
  }, [attempt, post])

  // The time limit ends the attempt silently; the participant may ask for more once.
  const deadline = useRef<{ attempt: string; start: number } | undefined>(undefined)
  if (active && deadline.current?.attempt !== active.attempt) deadline.current = { attempt: active.attempt, start: startedAt(active.attempt) }
  const seconds = active?.goal.timeoutSeconds
  useEffect(() => {
    if (!active || seconds === undefined || !deadline.current) return
    const end = deadline.current.start + seconds * 1000
    const warn = setTimeout(() => setLateWarning(true), Math.max(0, deadline.current.start + seconds * 800 - Date.now()))
    const stop = setTimeout(() => void finish('timeout'), Math.max(0, end - Date.now()))
    return () => { clearTimeout(warn); clearTimeout(stop) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.attempt, seconds])

  async function finish(reason: EndReason | 'timeout') {
    if (!active || busy) return
    setBusy(true)
    try {
      await buffer.current?.flush()
      const snapshot = fitSnapshot(serializeSnapshot(document))
      // Done on the last step is that step's Done too: its check reads the same snapshot as the outcome.
      const steps = active.goal.steps.length
      if (reason === 'done' && steps) await post({ action: 'step', index: Math.min(stepIndex, steps - 1), snapshot })
      const response = await post({ action: 'end', reason, snapshot })
      // A second end (another tab, or Done racing the time limit) is refused with 409; the first one stands, so go on either way.
      if (response.ok || response.status === 409) {
        await buffer.current?.destroy()
        window.location.assign(`/ui-tests/${active.run}/?after=1`)
        return
      }
    } catch {
      // Offline: stay on the page and let the person press again.
    }
    setBusy(false)
  }

  async function finishStep(index: number) {
    if (!active || busy) return
    setBusy(true)
    try {
      await buffer.current?.flush()
      const response = await post({ action: 'step', index, snapshot: fitSnapshot(serializeSnapshot(document)) })
      if (response.ok) {
        writeStep(active.attempt, index + 1)
        setStepIndex(index + 1)
      }
    } catch {
      // Offline: stay on this step and let the person press again.
    }
    setBusy(false)
  }

  async function moreTime() {
    setBusy(true)
    try {
      const response = await post({ action: 'more-time' })
      if (response.ok) {
        setMoreTimeUsed(true)
        setLateWarning(false)
        setView((await response.json()) as ParticipantView)
      } else if (response.status === 409) setMoreTimeUsed(true)
    } catch {
      // Keep the button for another try.
    }
    setBusy(false)
  }

  const theme = useMemo(() => (active ? chromeTheme(readHost(document, active.brand.accent)) : undefined), [active])
  if (!active || !theme) return null
  const steps = active.goal.steps
  const step = steps.length ? { index: Math.min(stepIndex, steps.length - 1), count: steps.length, name: steps[Math.min(stepIndex, steps.length - 1)]! } : undefined
  return createPortal(
    <Taskbar view={active} theme={theme} busy={busy} step={step} offerMoreTime={lateWarning && !moreTimeUsed} onEnd={(reason) => void finish(reason)} onStep={(index) => void finishStep(index)} onMoreTime={() => void moreTime()} />,
    document.body,
  )
}

/** The step this attempt is on, as this device last saw it. */
function readStep(attempt: string): number {
  try { return Number(sessionStorage.getItem(`ui-tests-step:${attempt}`)) || 0 } catch { return 0 }
}
function writeStep(attempt: string, index: number) {
  try { sessionStorage.setItem(`ui-tests-step:${attempt}`, String(index)) } catch { /* the step resets on a reload without storage */ }
}

/** When this attempt's clock began on this device: the first time the bar saw it. The collector keeps the real clock. */
function startedAt(attempt: string): number {
  const key = `ui-tests-started:${attempt}`
  try {
    const kept = Number(sessionStorage.getItem(key))
    if (kept) return kept
    const now = Date.now()
    sessionStorage.setItem(key, String(now))
    return now
  } catch {
    return Date.now()
  }
}
