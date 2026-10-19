'use client'

import { useEffect, useRef, useState } from 'react'
import type { ParticipantView } from '../server/view.ts'
import { entryScreen, messageFor, nextScreen } from './flow.ts'
import type { Screen } from './flow.ts'
import { PlayerScreen } from './screens.tsx'

const ENDPOINT = '/api/ui-tests/'
const FIXATION_MS = 800

/** The participant's own page: consent, the scenario card, and the questions after the task. White-labelled by default. */
export function Player({ runId }: { runId: string }) {
  const [view, setView] = useState<ParticipantView>()
  const [screen, setScreen] = useState<Screen>()
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const token = useRef<string | null>(null)
  const flash = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const request = (init?: { method: string; body: string }) => {
    const query = new URLSearchParams({ run: runId })
    const headers: Record<string, string> = init ? { 'Content-Type': 'application/json' } : {}
    // The link carries the token until consent; from then on the HttpOnly cookie does.
    if (token.current) {
      if (init) headers.Authorization = `Bearer ${token.current}`
      else query.set('t', token.current)
    }
    return fetch(`${ENDPOINT}?${query}`, { credentials: 'include', cache: 'no-store', ...init, headers })
  }

  useEffect(() => {
    token.current = new URLSearchParams(window.location.search).get('t')
    let alive = true
    request()
      .then((response) => (response.ok ? (response.json() as Promise<ParticipantView>) : Promise.reject(new Error(String(response.status)))))
      .then((next) => { if (alive) { setView(next); setScreen(entryScreen(next)) } })
      .catch(() => { if (alive) setError('This link is not valid any more.') })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  // The first look: a fixation mark, then the page for a moment.
  useEffect(() => {
    if (!view || screen?.kind !== 'impression' || screen.phase !== 'fixation') return
    const timer = setTimeout(() => setScreen((s) => (s ? nextScreen(view, s, answers) : s)), FIXATION_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, view])
  useEffect(() => () => clearTimeout(flash.current), [])

  async function send(body: Record<string, unknown>): Promise<ParticipantView> {
    const response = await request({ method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) throw new Error(await response.text())
    return (await response.json()) as ParticipantView
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
      setScreen(nextScreen(updated ?? view, current, answers))
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
      setView(await send({ action: 'withdraw' }))
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
      if (view.status === 'consented') await send({ action: 'begin' })
      window.location.assign(view.goal.start)
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
      onFlashLoaded={() => {
        clearTimeout(flash.current)
        flash.current = setTimeout(() => setScreen((s) => (s ? nextScreen(view, s, answers) : s)), view.impression?.flashMs ?? 500)
      }}
      busy={busy}
      error={error}
    />
  )
}
