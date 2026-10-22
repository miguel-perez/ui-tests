'use client'

import { useEffect, useRef, useState } from 'react'
import { GROUP_FULL } from '../copy.ts'
import type { ParticipantView } from '../server/view.ts'
import { entryScreen, messageFor, nextScreen } from './flow.ts'
import { beginAndHandOff, rememberBypass, withBypass } from './handoff.ts'
import type { Screen } from './flow.ts'
import { PlayerScreen } from './screens.tsx'

/**
 * The participant's own page: consent, the scenario card, and the questions after the task. White-labelled by default. `endpoint` is
 * the collector, on this page's own origin.
 */
export function Player({ runId, endpoint = '/api/ui-tests/' }: { runId: string; endpoint?: string }) {
  const [view, setView] = useState<ParticipantView>()
  const [screen, setScreen] = useState<Screen>()
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const token = useRef<string | null>(null)
  const bypass = useRef<string | undefined>(undefined)

  const request = (init?: { method: string; body: string }) => {
    const query = new URLSearchParams({ run: runId })
    const headers: Record<string, string> = init ? { 'Content-Type': 'application/json' } : {}
    // The link carries the token until consent; from then on the HttpOnly cookie does.
    if (token.current) {
      if (init) headers.Authorization = `Bearer ${token.current}`
      else query.set('t', token.current)
    }
    return fetch(`${endpoint}?${query}`, { credentials: 'include', cache: 'no-store', ...init, headers })
  }

  useEffect(() => {
    token.current = new URLSearchParams(window.location.search).get('t')
    bypass.current = rememberBypass(runId, window.location.search)
    let alive = true
    request()
      .then((response) => (response.ok ? (response.json() as Promise<ParticipantView>) : Promise.reject(new Error(String(response.status)))))
      .then((next) => {
        if (!alive) return
        setView(next)
        // Back from the tour of the author's own page: the prompt follows, or the card once it is answered, never the practice again.
        const back = new URLSearchParams(window.location.search).get('after') === 'first-look'
        setScreen(back && next.status === 'consented' && !next.impression ? { kind: 'card' } : entryScreen(next))
      })
      .catch(() => { if (alive) setError('This link is not valid any more.') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])


  /** The screen after `current`; once a goal's last answer is in and the person has a next goal, the view is that goal's, and its card comes next. */
  function following(before: ParticipantView, updated: ParticipantView | undefined, current: Screen): Screen {
    if (updated && updated.attempt !== before.attempt) return entryScreen(updated)
    return nextScreen(updated ?? before, current, answers)
  }

  async function send(body: Record<string, unknown>): Promise<ParticipantView> {
    const response = await request({ method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) throw new Error(await response.text())
    return (await response.json()) as ParticipantView
  }

  /** Sends the person on to the app with a one-time code in the address, which the app's page trades for the bar. */
  async function handoff() {
    const response = await request({ method: 'POST', body: JSON.stringify({ action: 'handoff' }) })
    if (!response.ok) throw new Error(await response.text())
    const { url } = (await response.json()) as { url: string }
    window.location.assign(withBypass(url, bypass.current))
  }

  async function advance(current: Screen) {
    if (!view || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const message = messageFor(view, current, answers)
      const updated = message ? await send(message) : undefined
      if (updated) setView(updated)
      if (current.kind === 'consent') {
        // The cookie carries the run from here; the token leaves the address bar and the history.
        token.current = null
        window.history.replaceState(null, '', window.location.pathname)
      }
      setScreen(following(view, updated, current))
    } catch (error) {
      // A person whose group is already full is thanked, not asked to try again.
      if (current.kind === 'consent' && error instanceof Error && error.message === GROUP_FULL) setScreen({ kind: 'full' })
      else setError('That did not go through. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  /** A spoken answer is sent whole and counts as this screen's answer, so the next screen follows at once. */
  async function voice(current: Screen, id: string, blob: Blob, typed?: string) {
    if (!view || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const updated = await send({ action: 'voice', question: id, audio: btoa(binary), contentType: blob.type || 'audio/webm', ...(typed && { typed }) })
      setView(updated)
      setScreen(following(view, updated, current))
    } catch {
      setError('That did not go through. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    if (!view || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const done = await send({ action: 'withdraw' })
      // What this device kept for the attempt (events and replay not yet sent) goes too.
      for (const name of ['ui-tests-events', 'ui-tests-replay']) { try { indexedDB.deleteDatabase(`${name}:${done.attempt}`) } catch { /* no IndexedDB */ } }
      setView(done)
      setScreen({ kind: 'withdrawn' })
    } catch {
      setError('That did not go through. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    if (!view || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await beginAndHandOff(view, { begin: () => send({ action: 'begin' }), begun: setView, handoff })
    } catch {
      setError('That did not go through. Check your connection and try again.')
      setBusy(false)
    }
  }

  if (!view || !screen) {
    return <main style={{ padding: 32, font: '16px system-ui, sans-serif' }}>{error ? <p role="alert">{error}</p> : <p>Loading</p>}</main>
  }
  return (
    <PlayerScreen
      view={view}
      screen={screen}
      answers={answers}
      onAnswer={(id, value) => setAnswers((a) => ({ ...a, [id]: value }))}
      onNext={() => void advance(screen)}
      onStart={() => void start()}
      onWithdraw={() => void withdraw()}
      onVoice={(id, blob, typed) => void voice(screen, id, blob, typed)}
      onOpenPage={() => void handoff().catch(() => setError('That did not go through. Check your connection and try again.'))}
      busy={busy}
      error={error}
    />
  )
}
