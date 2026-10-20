'use client'

import { useEffect, useRef, useState } from 'react'
import type { ParticipantView } from '../server/view.ts'
import { entryScreen, messageFor, nextScreen } from './flow.ts'
import { beginAndHandOff, rememberBypass, withBypass } from './handoff.ts'
import type { Screen } from './flow.ts'
import { PlayerScreen } from './screens.tsx'

const FIXATION_MS = 800
/** If the picture has not loaded by now the first look is dropped: the stage moves on rather than waiting for ever. */
const FLASH_LOAD_LIMIT_MS = 5000

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
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
        // Back from the first click on the author's own page: the first look is over, so the card follows rather than the practice screen.
        const back = new URLSearchParams(window.location.search).get('after') === 'first-look'
        setScreen(back && next.status === 'consented' ? { kind: 'card' } : entryScreen(next))
      })
      .catch(() => { if (alive) setError('This link is not valid any more.') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // The first look: a fixation mark (the picture loads behind it), then the picture for a moment.
  useEffect(() => {
    if (!view || screen?.kind !== 'impression' || screen.phase !== 'fixation') return
    const preload = new Image()
    preload.src = `${endpoint}?run=${encodeURIComponent(view.run)}&shot=first-look`
    const timer = setTimeout(() => setScreen((s) => (s ? nextScreen(view, s, answers) : s)), FIXATION_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, view])
  useEffect(() => {
    if (!view || screen?.kind !== 'impression' || screen.phase !== 'flash') return
    // A first look with no picture to show is dropped whole: the card comes next, with no question and no click. Leaving the phase cancels this.
    const limit = setTimeout(() => { clearTimeout(flash.current); setScreen({ kind: 'card' }) }, FLASH_LOAD_LIMIT_MS)
    return () => clearTimeout(limit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, view])
  useEffect(() => () => clearTimeout(flash.current), [])
  // The first click is taken on the author's own page by the bar there; this page hands the person over to it.
  // Once: a new view on the same screen does not ask for a second code. The button on the screen asks again if this one failed.
  const handedOff = useRef(false)
  useEffect(() => {
    if (!view || screen?.kind !== 'impression' || screen.phase !== 'click' || handedOff.current) return
    handedOff.current = true
    void handoff().catch(() => setError('That did not go through. Check your connection and try again.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, view])

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
    } catch {
      setError('That did not go through. Check your connection and try again.')
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
      onFlashLoaded={() => {
        clearTimeout(flash.current)
        performance.mark('first-look:flash-start')
        flash.current = setTimeout(() => {
          performance.mark('first-look:flash-end')
          setScreen((s) => (s?.kind === 'impression' && s.phase === 'flash' ? nextScreen(view, s, answers) : s))
        }, view.impression?.flashMs ?? 500)
      }}
      onFlashFailed={() => {
        clearTimeout(flash.current)
        setScreen({ kind: 'card' })
      }}
      onOpenPage={() => void handoff().catch(() => setError('That did not go through. Check your connection and try again.'))}
      busy={busy}
      error={error}
    />
  )
}
