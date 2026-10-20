import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { ParticipantView } from '../server/view.ts'
import { ROOT_ATTRIBUTE } from './recorder.ts'
import { chromeVars } from './theme.ts'
import type { ChromeTheme } from './theme.ts'

export type EndReason = 'done' | 'gave up'

/** The step on now, when the task has steps: one at a time, each with its own Done. */
export type CurrentStep = { index: number; count: number; name: string }

export type TaskbarProps = {
  view: Pick<ParticipantView, 'goal' | 'brand'>
  theme: ChromeTheme
  /** Shown once the time is nearly spent and the participant has not yet asked for more. */
  offerMoreTime: boolean
  busy: boolean
  /** The step on now; Done on any step but the last moves to the next one. */
  step?: CurrentStep
  onEnd(reason: EndReason): void
  onStep?(index: number): void
  onMoreTime(): void
}

const css = `
.uit-bar { position: fixed; z-index: 2147483646; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%); display: grid; gap: 8px; justify-items: center; max-width: calc(100vw - 16px); color: var(--uit-ink); font-family: var(--uit-font); font-size: 14px; line-height: 1.4; }
.uit-bar *, .uit-bar *::before, .uit-bar *::after { box-sizing: border-box; }
.uit-pill, .uit-card { background: var(--uit-surface); color: var(--uit-ink); border-radius: 14px; box-shadow: 0 0 0 1px var(--uit-hair), 0 10px 28px rgba(21, 26, 33, .3); }
.uit-pill { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 4px; flex-wrap: wrap; justify-content: center; }
.uit-card { padding: 14px 16px; max-width: 420px; display: grid; gap: 6px; }
.uit-card p { margin: 0; }
.uit-dim { color: var(--uit-dim); }
.uit-bar button { font: inherit; color: inherit; cursor: pointer; border: 0; background: transparent; border-radius: 10px; min-height: 36px; padding: 0 12px; box-shadow: inset 0 0 0 1px var(--uit-hair); white-space: nowrap; }
.uit-bar button:disabled { opacity: .55; cursor: default; }
.uit-bar button:focus-visible { outline: 2px solid var(--uit-ink); outline-offset: 2px; }
.uit-bar .uit-primary { background: var(--uit-accent); color: var(--uit-accent-ink); box-shadow: none; font-weight: 500; }
.uit-bar .uit-plain { box-shadow: none; }
.uit-bar .uit-summary { box-shadow: none; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.uit-handle { width: 20px; align-self: stretch; cursor: grab; touch-action: none; display: grid; place-items: center; color: var(--uit-dim); user-select: none; }
.uit-question, .uit-step { padding: 0 8px; font-weight: 500; }
@media (max-width: 600px) { .uit-handle { display: none; } .uit-bar { left: 8px; right: 8px; transform: none; } .uit-pill { width: 100%; } }
@media (pointer: coarse) { .uit-bar button { min-height: 44px; } }
`

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'number', 'password'])

/** Whether focus sits in a field of the host page where the person is typing, which the bar must not cover. */
export function isTyping(active: Element | null, root: Element | null): boolean {
  if (!active || (root && root.contains(active))) return false
  const tag = active.tagName?.toLowerCase()
  if (tag === 'textarea') return true
  if (tag === 'input') return TEXT_INPUT_TYPES.has((active.getAttribute('type') ?? '').toLowerCase())
  return (active as HTMLElement).isContentEditable === true || active.getAttribute?.('contenteditable') === 'true'
}

/** The one floating pill: the task, Done, and I couldn't do this. Draggable; steps aside while the participant types in the page. */
export function Taskbar({ view, theme, offerMoreTime, busy, step, onEnd, onStep, onMoreTime }: TaskbarProps) {
  const [confirming, setConfirming] = useState(false)
  const lastStep = !step || step.index === step.count - 1
  const [reading, setReading] = useState(false)
  const [typing, setTyping] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const root = useRef<HTMLDivElement>(null)
  const yes = useRef<HTMLButtonElement>(null)
  // The pressed Done is gone once the question shows; focus moves to its answer, so a keyboard user is not sent back to the top.
  useEffect(() => { if (confirming) yes.current?.focus() }, [confirming])
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } } | undefined>(undefined)

  useEffect(() => {
    const check = () => setTyping(isTyping(document.activeElement, root.current))
    const later = () => setTimeout(check, 0)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', later)
    check()
    return () => {
      document.removeEventListener('focusin', check)
      document.removeEventListener('focusout', later)
    }
  }, [])

  const down = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, from: offset }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (start) setOffset({ x: start.from.x + e.clientX - start.x, y: start.from.y + e.clientY - start.y })
  }
  const up = () => { drag.current = undefined }

  return (
    <div
      ref={root}
      {...{ [ROOT_ATTRIBUTE]: '' }}
      className="uit-bar"
      role="region"
      aria-label={view.goal.name}
      style={{ ...chromeVars(theme), translate: `${offset.x}px ${offset.y}px`, ...(typing && { display: 'none' }) }}
    >
      <style>{css}</style>
      {reading && (
        <div className="uit-card">
          <p>{view.goal.scenario}</p>
          <p className="uit-dim">When you think you&apos;ve finished, press Done. If you get stuck, press I couldn&apos;t do this.</p>
        </div>
      )}
      <div className="uit-pill">
        <div className="uit-handle" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>⋮⋮</div>
        {confirming ? (
          <>
            <span className="uit-question">{lastStep ? 'Finished this task?' : 'Finished this step?'}</span>
            <button ref={yes} type="button" className="uit-primary" disabled={busy} onClick={() => { if (step && !lastStep) { setConfirming(false); onStep?.(step.index) } else onEnd('done') }}>Yes</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}>Not yet</button>
          </>
        ) : (
          <>
            <button type="button" className="uit-summary" aria-expanded={reading} onClick={() => setReading((open) => !open)}>{view.goal.name}</button>
            {step && <span className="uit-step">Step {step.index + 1} of {step.count}: {step.name}</span>}
            <button type="button" className="uit-primary" disabled={busy} onClick={() => setConfirming(true)}>Done</button>
            <button type="button" disabled={busy} onClick={() => onEnd('gave up')}>I couldn&apos;t do this</button>
            {offerMoreTime && <button type="button" className="uit-plain" disabled={busy} onClick={onMoreTime}>More time</button>}
          </>
        )}
        {view.brand.poweredBy && <span className="uit-dim">Powered by ui-tests</span>}
      </div>
    </div>
  )
}
