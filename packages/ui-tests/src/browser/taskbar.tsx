import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { BarView } from '../server/view.ts'
import { FIRST_CLICK_PROMPT } from '../player/copy.ts'
import { ROOT_ATTRIBUTE } from './recorder.ts'
import { chromeVars } from './theme.ts'
import type { ChromeTheme } from './theme.ts'

export type EndReason = 'done' | 'gave up'

/** The step on now, when the task has steps: one at a time, each with its own Done. */
export type CurrentStep = { index: number; count: number; name: string }

/** The screen video on the bar: the question before it begins, then the red dot, the time and a pause while it runs. */
export type ScreenBar =
  | { state: 'asking'; onShare(): void; onDecline(): void }
  | { state: 'on' | 'paused'; seconds: number; onPause(): void; onResume(): void }

export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, '0')}`

export type TaskbarProps = {
  /** No scenario: the player shows it before the task, and the app's page may not know it. */
  view: { goal: { name: string }; brand: BarView['brand'] }
  theme: ChromeTheme
  /** Shown once the time is nearly spent and the participant has not yet asked for more. */
  offerMoreTime: boolean
  busy: boolean
  /** The step on now; Done on any step but the last moves to the next one. */
  step?: CurrentStep
  onEnd(reason: EndReason): void
  onStep?(index: number): void
  onMoreTime(): void
  /** Present only when the study records the screen and the person has not said no. */
  screen?: ScreenBar
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
.uit-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.uit-handle { width: 20px; align-self: stretch; cursor: grab; touch-action: none; display: grid; place-items: center; color: var(--uit-dim); user-select: none; }
.uit-dot { width: 10px; height: 10px; border-radius: 50%; background: #d92d20; flex: none; }
.uit-dot[data-paused] { background: transparent; box-shadow: inset 0 0 0 2px var(--uit-dim); }
.uit-rec { display: inline-flex; align-items: center; gap: 6px; padding: 0 6px; font-variant-numeric: tabular-nums; }
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
export function Taskbar({ view, theme, offerMoreTime, busy, step, onEnd, onStep, onMoreTime, screen }: TaskbarProps) {
  const [confirming, setConfirming] = useState(false)
  const lastStep = !step || step.index === step.count - 1
  const [reading, setReading] = useState(false)
  // A change of step is announced; the step on at the start is not, since the bar's own label and the visible text say it.
  const [stepNote, setStepNote] = useState('')
  const stepNow = useRef(step?.index)
  useEffect(() => {
    if (step && stepNow.current !== step.index) { stepNow.current = step.index; setStepNote(`Now on step ${step.index + 1} of ${step.count}, ${step.name}.`) }
  }, [step])
  const [typing, setTyping] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const root = useRef<HTMLDivElement>(null)
  const yes = useRef<HTMLButtonElement>(null)
  const done = useRef<HTMLButtonElement>(null)
  /** Set when the question closes or More time is taken and the bar stays: focus goes back to Done once it is enabled again. */
  const backToDone = useRef(false)
  // The pressed button is gone once the question shows or closes; focus moves with it, so a keyboard user is not sent back to the top.
  useEffect(() => {
    if (confirming) yes.current?.focus()
    else if (backToDone.current && !busy) { backToDone.current = false; done.current?.focus() }
  }, [confirming, busy])
  const close = () => { backToDone.current = true; setConfirming(false) }
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
          <p className="uit-dim">When you think you&apos;ve finished, press Done. If you get stuck, press I couldn&apos;t do this.</p>
        </div>
      )}
      {screen?.state === 'asking' && (
        <div className="uit-card" role="group" aria-label="Share your screen">
          <p>The team would like to see your screen while you do this task. Your browser will ask you first, and you choose what to share. There is no sound.</p>
          <p className="uit-dim">If you would rather not, press No thanks. You can still take part.</p>
          <p>
            <button type="button" className="uit-primary" onClick={screen.onShare}>Share my screen</button>{' '}
            <button type="button" onClick={screen.onDecline}>No thanks</button>
          </p>
        </div>
      )}
      <div className="uit-pill">
        <div className="uit-handle" aria-hidden="true" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>⋮⋮</div>
        {/* Always present, so a change of text is announced: the question when it opens, and that more time can be asked for. */}
        <span role="status" aria-live="polite" className={confirming ? 'uit-question' : undefined}>
          {confirming ? (lastStep ? 'Finished this task?' : 'Finished this step?') : (stepNote || offerMoreTime) && <span className="uit-sr">{stepNote}{offerMoreTime && ' Time is nearly up. You can ask for more time once.'}</span>}
        </span>
        {confirming ? (
          <>
            <button ref={yes} type="button" className="uit-primary" disabled={busy} onClick={() => { if (step && !lastStep) { close(); onStep?.(step.index) } else onEnd('done') }}>Yes</button>
            <button type="button" disabled={busy} onClick={close}>Not yet</button>
          </>
        ) : (
          <>
            <button type="button" className="uit-summary" aria-expanded={reading} onClick={() => setReading((open) => !open)}>{view.goal.name}</button>
            {step && <span className="uit-step">Step {step.index + 1} of {step.count}: {step.name}</span>}
            {screen && screen.state !== 'asking' && (
              <>
                <span className="uit-rec" role="status" aria-label={`${screen.state === 'paused' ? 'Screen recording paused' : 'Recording your screen'}, ${clock(screen.seconds)}`}>
                  <span className="uit-dot" aria-hidden="true" {...(screen.state === 'paused' && { 'data-paused': '' })} />
                  <span aria-hidden="true">{clock(screen.seconds)}</span>
                </span>
                <button type="button" onClick={screen.state === 'paused' ? screen.onResume : screen.onPause}>{screen.state === 'paused' ? 'Resume recording' : 'Pause recording'}</button>
              </>
            )}
            <button ref={done} type="button" className="uit-primary" disabled={busy} onClick={() => setConfirming(true)}>Done</button>
            <button type="button" disabled={busy} onClick={() => onEnd('gave up')}>I couldn&apos;t do this</button>
            {offerMoreTime && <button type="button" className="uit-plain" disabled={busy} onClick={() => { backToDone.current = true; onMoreTime() }}>More time</button>}
          </>
        )}
        {view.brand.poweredBy && <span className="uit-dim">Powered by ui-tests</span>}
      </div>
    </div>
  )
}

/** The bar while the first click is taken: one line, no Done and no way out of the task, since the task has not begun. */
export function FirstClickBar({ theme, poweredBy }: { theme: ChromeTheme; poweredBy: boolean }) {
  return (
    <div {...{ [ROOT_ATTRIBUTE]: '' }} className="uit-bar" role="region" aria-label={FIRST_CLICK_PROMPT} style={chromeVars(theme)}>
      <style>{css}</style>
      <div className="uit-pill">
        <span className="uit-question">{FIRST_CLICK_PROMPT}</span>
        {poweredBy && <span className="uit-dim">Powered by ui-tests</span>}
      </div>
    </div>
  )
}
