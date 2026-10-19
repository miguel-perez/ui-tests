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

const ACTIVE = /(?:^|;\s*)ui-tests-active=1(?:;|$)/
const FLUSH_AFTER_MS = 1000
/** Fetches with a keepalive body only while it fits the browsers' 64 KB budget for it. */
const KEEPALIVE_BYTES = 60_000

/**
 * Mount once in the root layout. Without the participant's run cookie it renders nothing and loads nothing; with it, it records
 * the attempt, keeps events until the collector has them, and shows the bar.
 */
export function UiTests({ endpoint = '/api/ui-tests/' }: UiTestsProps) {
  const [view, setView] = useState<ParticipantView>()
  const [busy, setBusy] = useState(false)
  const [lateWarning, setLateWarning] = useState(false)
  const [moreTimeUsed, setMoreTimeUsed] = useState(false)
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
      return fetch(endpoint, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: text, keepalive: text.length < KEEPALIVE_BYTES })
    },
    [endpoint],
  )

  const active = view?.status === 'active' ? view : undefined
  const attempt = active?.attempt

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
    })
    buffer.current = kept
    let timer: ReturnType<typeof setTimeout> | undefined
    const flushSoon = () => { clearTimeout(timer); timer = setTimeout(() => void kept.flush(), FLUSH_AFTER_MS) }
    const recorder = createRecorder((events) => void kept.push(events).then(flushSoon), { now: Date.now, mutationWindowMs: 300, pauseMs: 5000 })
    const detach = recorder.attach(document)
    const replay = () => void kept.flush()
    // What was left from a lost connection or a reload replays now; what still cannot be sent stays kept for the next visit.
    replay()
    window.addEventListener('online', replay)
    window.addEventListener('pagehide', replay)
    return () => {
      detach()
      clearTimeout(timer)
      window.removeEventListener('online', replay)
      window.removeEventListener('pagehide', replay)
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
      const response = await post({ action: 'end', reason, snapshot })
      // A second end (another tab, or Done racing the time limit) is refused with 409; the first one stands, so go on either way.
      if (response.ok || response.status === 409) {
        await buffer.current?.clear()
        window.location.assign(`/ui-tests/${active.run}/?after=1`)
        return
      }
    } catch {
      // Offline: stay on the page and let the person press again.
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
  return createPortal(
    <Taskbar view={active} theme={theme} busy={busy} offerMoreTime={lateWarning && !moreTimeUsed} onEnd={(reason) => void finish(reason)} onMoreTime={() => void moreTime()} />,
    document.body,
  )
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
