/** @jsxRuntime automatic @jsxImportSource react */
'use client'

import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

/** The part of rrweb-player this uses. */
type Player = {
  goto(ms: number, play?: boolean): void
  pause(): void
  play(): void
  addEventListener(name: string, handler: (event: { payload: unknown }) => void): void
  $destroy?: () => void
}
type PlayerConstructor = new (options: { target: HTMLElement; props: Record<string, unknown> }) => Player

export type ReplayProps = {
  /** rrweb events, as recorded. */
  events: unknown[]
  /** The moments of the reel, in the same clock as the events. */
  moments: { start: number; end: number; label: string }[]
  /** rrweb-player's stylesheet, when the host page does not already carry it. */
  css?: string
}

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const stamp = (event: unknown) => (event as { timestamp: number }).timestamp

/**
 * The recording, played by rrweb-player (fetched when this mounts, never with the page), with a button for each moment of the
 * highlight reel that seeks to it, and one that plays the reel moment after moment.
 */
export function Replay({ events, moments, css }: ReplayProps) {
  const target = useRef<HTMLDivElement>(null)
  const player = useRef<Player | undefined>(undefined)
  const reel = useRef<{ index: number } | undefined>(undefined)
  const [now, setNow] = useState(0)
  const [status, setStatus] = useState('Loading the replay')
  const first = events.length ? stamp(events[0]) : 0
  const last = events.length ? stamp(events[events.length - 1]) : 0
  const offset = (at: number) => Math.min(Math.max(0, at - first), last - first)

  useEffect(() => {
    let alive = true
    const host = target.current
    if (!host || events.length < 2) { setStatus('This recording is too short to play'); return }
    import('rrweb-player').then((module) => {
      if (!alive) return
      const Constructor = ((module as { default?: unknown }).default ?? module) as PlayerConstructor
      const width = Math.max(320, Math.min(host.clientWidth || 800, 1000))
      const made = new Constructor({ target: host, props: { events, width, height: Math.round(width * 0.6), autoPlay: false, showController: true, skipInactive: false } })
      player.current = made
      made.addEventListener('ui-update-current-time', ({ payload }) => {
        const ms = Number(payload)
        setNow(ms)
        const playing = reel.current
        const moment = playing && moments[playing.index]
        if (moment && ms >= offset(moment.end)) next(playing.index + 1)
      })
      setStatus('Ready')
    }).catch(() => { if (alive) setStatus('The replay could not be loaded') })
    return () => { alive = false; player.current?.$destroy?.(); player.current = undefined; if (host) host.replaceChildren() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events])

  function next(index: number) {
    const moment = moments[index]
    if (!moment) {
      reel.current = undefined
      player.current?.pause()
      setStatus('End of the highlight reel')
      return
    }
    reel.current = { index }
    setStatus(`Highlight reel: moment ${index + 1} of ${moments.length}`)
    player.current?.goto(offset(moment.start), true)
  }

  function seek(index: number) {
    reel.current = undefined
    const moment = moments[index]!
    setStatus(`Moment ${index + 1} of ${moments.length}`)
    player.current?.goto(offset(moment.start), false)
  }

  return (
    <div data-replay-ready={status === 'Ready' || status.startsWith('Highlight') || status.startsWith('Moment') || status.startsWith('End') ? 'true' : 'false'} data-current-ms={Math.round(now)}>
      {css && <style>{css}</style>}
      <div ref={target} />
      <p role="status">{status}</p>
      {moments.length > 0 && (
        <>
          <p><button type="button" onClick={() => next(0)}>Play the highlight reel</button></p>
          <ol>
            {moments.map((moment, index) => (
              <li key={index}>
                <button type="button" onClick={() => seek(index)}>Go to {clock(offset(moment.start))}</button> {moment.label}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

/** In the trace page: replaces each `[data-replay]` placeholder with a player for the events and moments its JSON holds. */
export function mountReplays(root: ParentNode, css?: string) {
  for (const holder of root.querySelectorAll<HTMLElement>('[data-replay]')) {
    if (holder.dataset.mounted) continue
    holder.dataset.mounted = 'true'
    const json = holder.querySelector('script[type="application/json"]')?.textContent
    if (!json) continue
    const props = JSON.parse(json) as ReplayProps
    createRoot(holder).render(<Replay {...props} {...(css && { css })} />)
  }
}
