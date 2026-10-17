'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { chromeTheme, chromeVars, parseColour, playerCss, type ChromeInput } from './player-styles.ts'
export { weekboardChrome, type ChromeInput } from './player-styles.ts'

/**
 * The participant's surfaces, built to the specification in docs/discovery/participant-overlay-research.md, in the chrome of
 * docs/discovery/participant-chrome-research.md and design/artefacts/player-chrome.html.
 * Each choice carries its source in a short note beside the code that makes it.
 */

/** What is captured for the attempt. Interactions always; screen, voice and webcam each only with consent. */
export type RecordingState = { events: true; screen: boolean; voice: boolean; webcam: boolean }
/** The participant view served by the collector; see `participantView` for the allowlist. */
type Participant = { id: string; author: string; name: string; status: string; scenario: string; tasks: string[]; start: string; timeBox: number; extended: boolean; startedAt: number; sequence: { index: number; total: number }; askConfidence: boolean; video: boolean; recording: RecordingState; screener: ScreenerScreen[]; screened: boolean; impression: { page: string; flashMs: number; question: string; goal?: string } | null; source?: 'link' | 'prolific' | 'connect' | 'intercept'; minutes?: number; impressed: boolean; verificationReady: boolean; validation?: { question: string; choices: string[] }; accent?: string }
/** One screener question as the participant sees it: words and choices, never labels or rules. */
export type ScreenerScreen = { question: string; kind: 'single' | 'multi'; options: string[] }
const endpoint = '/api/ui-tests'
/** Posts a collector message and returns the updated participant view. */
async function send(body: unknown) {
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`Could not save (${response.status}). Please try again.`)
  return response.json() as Promise<Participant>
}
/** Serialises the current document with scripts, styles, the player surfaces, input values and sensitive attributes removed. */
function snapshot() {
  const root = document.documentElement.cloneNode(true) as HTMLElement
  root.querySelectorAll('script, style, noscript, [data-research-taskbar]').forEach(node => node.remove())
  root.querySelectorAll('input, textarea, select, [contenteditable]').forEach(node => {
    node.removeAttribute('value'); node.removeAttribute('checked'); node.textContent = '[masked]'
  })
  root.querySelectorAll('*').forEach(node => { for (const attribute of Array.from(node.attributes)) if (/^on|token|secret|password/i.test(attribute.name)) node.removeAttribute(attribute.name) })
  return { url: location.origin + location.pathname, dom: root.outerHTML }
}
/** The page body without the player's own surfaces, whose clock re-renders every second. */
function pageMarkup() {
  const body = document.body.cloneNode(true) as HTMLElement
  body.querySelectorAll('[data-research-taskbar]').forEach(node => node.remove())
  return body.innerHTML
}
/** A short, stable label for an element: tag, id and aria-label. */
function targetLabel(element: Element) {
  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.getAttribute('aria-label') ? `[${element.getAttribute('aria-label')}]` : ''}`.slice(0, 300)
}
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

/** The player's stylesheet, hoisted once into the document head by React however many surfaces render it. */
export function PlayerStyles() { return <style href="ui-tests-player" precedence="medium">{playerCss}</style> }

const icon = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
const Mic = () => <svg {...icon}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
const Grip = () => <svg {...icon}><circle cx="9" cy="6" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="18" r="1" /></svg>
const PauseIcon = () => <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg>
const ResumeIcon = () => <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" /></svg>

/**
 * The chrome's colours (participant-chrome research, white-labelling rules): an embedded example names its host page; on a real
 * page they are read from the host once mounted, its text and background turned over, its font, and the author's accent.
 */
export function useChrome(host?: ChromeInput, accent?: string) {
  const [theme, setTheme] = useState(() => host ? chromeTheme({ ...host, accent: accent ?? host.accent }) : undefined)
  useEffect(() => {
    if (host) { setTheme(chromeTheme({ ...host, accent: accent ?? host.accent })); return }
    const body = getComputedStyle(document.body), root = getComputedStyle(document.documentElement)
    const background = [body.backgroundColor, root.backgroundColor].find(value => parseColour(value))
    setTheme(chromeTheme({ hostInk: body.color, hostBackground: background, accent, font: body.fontFamily }))
  }, [host?.hostInk, host?.hostBackground, host?.accent, host?.font, accent])
  return theme && chromeVars(theme) as CSSProperties
}

/** The words that tell the participant how a task ends, quoting the bar's two labels. NN/g, unmoderated testing: nobody will move them on, so say it. */
export const endingLine = "When you think you've finished, press Done. If you get stuck, press I couldn't do this."
function Ending() { return <p className="uit-ends">When you think you&apos;ve finished, press <b>Done</b>. If you get stuck, press <b>I couldn&apos;t do this</b>.</p> }

/**
 * The scenario card, before each task, on the chrome's surface.
 * - "Task n of N": the only firm progress pattern in the audit (UserTesting's next/done switch; Userbrain).
 * - The scenario is the generator's or the author's pinned text: context, one action and every datum, no interface labels, no steps (NN/g task scenarios).
 * - One line on how the task ends, quoting the bar (NN/g, unmoderated) and one primary "Start task" (Maze "Get started", Qualtrics "Begin").
 */
export function ScenarioCard({ scenario, onStart, index = 1, total = 1, level = 2, busy = false, chrome, accent }: { scenario: string; onStart: () => void; index?: number; total?: number; level?: 1 | 2 | 3; busy?: boolean; chrome?: ChromeInput; accent?: string }) {
  const Heading = (['h1', 'h2', 'h3'] as const)[level - 1]
  return <section className="uit uit-sheet uit-card" style={useChrome(chrome, accent)} data-research-taskbar aria-label={`Task ${index} of ${total}`}>
    <PlayerStyles />
    <Heading className="uit-progress">Task {index} of {total}</Heading>
    <p className="uit-scenario">{scenario}</p>
    <Ending />
    <button className="uit-primary" disabled={busy} onClick={onStart}>Start task</button>
  </section>
}

/**
 * The join screen: the first thing a person sees when they open your link (design/artefacts/sources-section.html, the link's picture).
 * Who asked and for how long, what the attempt is, that the site is tested and not them, what is recorded, then Start. The screener
 * comes next ("A few questions about you first"), then the consent. The screen video line shows only when the run records it.
 */
export function JoinSheet({ name = 'this website', minutes, video = false, onStart, busy = false, level = 2, chrome, accent }: { name?: string; minutes: number; video?: boolean; onStart?: () => void; busy?: boolean; level?: 1 | 2 | 3; chrome?: ChromeInput; accent?: string }) {
  const Heading = (['h1', 'h2', 'h3'] as const)[level - 1]
  // One id per instance, so two join sheets on one page never label each other.
  const title = `${useId()}-join-title`
  return <section className="uit uit-sheet uit-join" style={useChrome(chrome, accent)} data-research-taskbar aria-labelledby={title}>
    <PlayerStyles />
    <p className="uit-progress">{capital(name)} · about {minutes} minutes</p>
    <Heading id={title}>{capital(name)} asked for your help with one thing on their site.</Heading>
    <p>You&apos;ll try it the way you normally would, then answer two short questions. There are no wrong moves. The website is being tested, not you.</p>
    <ul className="uit-list" aria-label="What is recorded">
      <li><i aria-hidden="true" /><span>What you do on their page is recorded</span><em>always</em></li>
      {video && <li><i aria-hidden="true" /><span>Your screen, as a video</span><em>needed</em></li>}
      <li><i className="uit-off" aria-hidden="true" /><span>Your voice, only if you choose to talk</span><em>optional</em></li>
    </ul>
    <div className="uit-actions"><span className="uit-hint">A few questions about you first.</span><button type="button" className="uit-primary" disabled={busy} onClick={onStart}>Start</button></div>
  </section>
}

/**
 * The invitation a visitor sees on your live site when a page has given them trouble twice (PRD 03, intercept; intercept-recruiting.md):
 * why they were asked, how long, that it is paid, and that the site is tested, not them. One string in PRD 03, this player and the demo.
 * "No thanks" is never asked again that visit; nothing from before a yes is kept.
 */
export const invitation = { title: 'This page seems to be giving you trouble.', body: 'Would you show us where? Five minutes, paid, in your own words. The site is being tested, not you.', accept: 'Sure', decline: 'No thanks' } as const
/** The invitation's words as one sentence pair, as PRD 03 and the demo carry them. */
export const invitationText = `${invitation.title} ${invitation.body}`
export function Invitation({ name = 'this website', onAccept, onDecline, contained = false, chrome, accent }: { name?: string; onAccept?: () => void; onDecline?: () => void; contained?: boolean; chrome?: ChromeInput; accent?: string }) {
  const body = `${useId()}-invite-body`
  return <section className={`uit uit-invite${contained ? ' uit-contained' : ''}`} style={useChrome(chrome, accent)} data-research-taskbar role="dialog" aria-label={`Invitation from ${capital(name)}`} aria-describedby={body}>
    <PlayerStyles />
    <h2>{invitation.title}</h2>
    <p id={body}>{invitation.body}</p>
    <div className="uit-invite-actions"><button type="button" className="uit-primary" onClick={onAccept}>{invitation.accept}</button><button type="button" onClick={onDecline}>{invitation.decline}</button></div>
  </section>
}

/** The elapsed time of the attempt, ticking once a second unless it is a still. */
function useElapsed(startedAt?: number, still = false) {
  const [now, setNow] = useState(() => startedAt ?? 0)
  useEffect(() => { if (!startedAt || still) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [startedAt, still])
  return startedAt ? Math.max(0, (now - startedAt) / 1000) : 0
}
const states = (recording: RecordingState, live = false) => `Screen ${recording.screen ? 'recorded' : 'not recorded'} · Voice ${live ? 'recording now' : recording.voice ? 'recorded' : 'off'} · Webcam ${recording.webcam ? 'recorded' : 'off'}`

/** What the bar shows of the recording: the attempt's start, what is captured, and the pause. */
export type BarRecording = { startedAt?: number; state: RecordingState; paused?: boolean; onPause?: () => void }
/**
 * The recording state as the bar's leading segment: a red dot, the elapsed time and a pause, no microphone during the task
 * (participant-chrome research, revision: voice is only captured when the person chooses "Talk instead" afterwards).
 * "Paused" replaces the time so colour is never the only signal (SC 1.4.1); what is captured is in the group's text for screen readers.
 */
function RecordingSegment({ startedAt, state, paused = false, onPause }: BarRecording) {
  const elapsed = useElapsed(startedAt)
  return <span className="uit-seg uit-recseg" role="group" aria-label="Recording">
    <span className={`uit-dot${paused ? ' uit-paused' : ''}`} aria-hidden="true" />
    {paused ? <span>Paused</span> : <time>{clock(elapsed)}</time>}
    <span className="uit-sr">{paused ? 'Recording paused. ' : 'Recording. '}{states(state)}</span>
    {onPause && <button className="uit-pause" aria-pressed={paused} aria-label={paused ? 'Resume recording' : 'Pause recording'} onClick={onPause}>{paused ? <ResumeIcon /> : <PauseIcon />}</button>}
  </span>
}

/**
 * The task bar: one small pill, bottom right, movable to the top, never removable (participant-chrome research, revision).
 * - The recording state leads; then the task summary, which expands the full card in place: participants must be able to reread the task (NN/g; UXtweak).
 * - Exactly two task controls, "Done" and "I couldn't do this", the labels the card's last line quotes. Done morphs the pill to
 *   "Finished this task?" in place, no dialog, because stressed or fast participants end tasks by accident (UXtweak, 2020; Cooper, single view).
 * - "I couldn't do this" is always available (O'Brien: always let participants give up; Tidwell, Escape Hatch). Before the first interaction it
 *   confirms and records an early abandonment; after one it records "couldn't do this"; both are distinct from not reaching the goal.
 * - No back, and no timer by default: limits shift ratings (Sauro). Only near the end of the time box does "Need more time?" appear, once.
 * - It hides while the person types in the host page, and the host page keeps focus clear of it (WCAG 2.4.11). The grip drags it anywhere.
 */
export function TaskBar({ scenario, steps = [], index = 1, total = 1, interacted, onDone, onGiveUp, onStep, canExtend = false, onExtend, busy = false, contained = false, error, recording, chrome, accent }: { scenario: string; steps?: string[]; index?: number; total?: number; interacted: boolean; onDone: () => void; onGiveUp: (reason: "couldn't do this" | 'abandoned early') => void; onStep?: (step: number) => void; canExtend?: boolean; onExtend?: () => void; busy?: boolean; contained?: boolean; error?: string; recording?: BarRecording; chrome?: ChromeInput; accent?: string }) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [confirm, setConfirm] = useState<'done' | 'leave' | null>(null)
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom')
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [typing, setTyping] = useState(false)
  const [step, setStep] = useState(0)
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number }; moved: boolean } | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // The confirmation replaces the controls in the pill; cancelling it puts focus back on the control that opened it, which is mounted again.
  const doneRef = useRef<HTMLButtonElement>(null), cantRef = useRef<HTMLButtonElement>(null), back = useRef<'done' | 'leave' | null>(null)
  const style = useChrome(chrome, accent)
  useEffect(() => {
    if (contained) return
    // Where the person put the bar is remembered for the attempt, across pages (Vercel toolbar; Cooper: remember the placement of palettes).
    const saved = sessionStorage.getItem('ui-tests-bar')
    if (saved === 'top') setPosition('top')
    try { const moved = JSON.parse(sessionStorage.getItem('ui-tests-bar-offset') ?? 'null'); if (moved && Number.isFinite(moved.x) && Number.isFinite(moved.y)) setOffset(moved) } catch { /* a stale value is ignored */ }
  }, [contained])
  useEffect(() => {
    if (confirm) { confirmRef.current?.focus(); return }
    if (back.current) { (back.current === 'done' ? doneRef : cantRef).current?.focus(); back.current = null }
  }, [confirm])
  useEffect(() => {
    if (contained) return
    // Focus is never hidden behind the bar (WCAG 2.4.11): the host page scrolls focused controls clear of it while it is shown.
    const root = document.documentElement, previous = root.style.scrollPaddingBottom
    root.style.scrollPaddingBottom = '72px'
    // While the person types in the host page the bar steps aside, so it never sits over the field or under a phone keyboard.
    const field = (target: EventTarget | null) => target instanceof Element && !target.closest('[data-research-taskbar]') && target.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), textarea, select, [contenteditable]:not([contenteditable=false])')
    const focusin = (event: FocusEvent) => setTyping(field(event.target))
    const focusout = () => setTyping(false)
    document.addEventListener('focusin', focusin); document.addEventListener('focusout', focusout)
    if (field(document.activeElement)) setTyping(true)
    return () => { root.style.scrollPaddingBottom = previous; document.removeEventListener('focusin', focusin); document.removeEventListener('focusout', focusout) }
  }, [contained])
  function move(next: 'bottom' | 'top') { setPosition(next); setOffset({ x: 0, y: 0 }); if (!contained) { sessionStorage.setItem('ui-tests-bar', next); sessionStorage.removeItem('ui-tests-bar-offset') } }
  const onLastStep = step + 1 >= steps.length
  const doneLabel = steps.length && !onLastStep ? 'Done with this step' : 'Done'
  const summary = steps.length ? steps[step] : scenario
  return <aside data-research-taskbar aria-label={contained ? 'Example task bar' : 'Your task'} style={{ ...style, '--uit-dx': `${offset.x}px`, '--uit-dy': `${offset.y}px` } as CSSProperties} className={`uit uit-bar uit-${position}${contained ? ' uit-contained' : ''}${typing ? ' uit-hidden' : ''}`}>
    <PlayerStyles />
    {expanded && <div className="uit-sheet uit-task" id={`${id}-task`}><p>{scenario}</p>{steps.length > 0 && <p className="uit-hint">Step {step + 1}: {steps[step]}</p>}<Ending /></div>}
    <div className="uit-pill">
      {/* Drag the grip to put the bar anywhere; pressing it (or Enter) moves it between bottom and top, the keyboard's way to move it. */}
      <button className="uit-handle" aria-label={position === 'bottom' ? 'Move the task bar to the top' : 'Move the task bar to the bottom'}
        onPointerDown={event => { drag.current = { x: event.clientX, y: event.clientY, from: offset, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={event => {
          const current = drag.current
          if (!current) return
          const dx = event.clientX - current.x, dy = event.clientY - current.y
          if (!current.moved && Math.hypot(dx, dy) < 6) return
          current.moved = true
          setOffset({ x: current.from.x + dx, y: current.from.y + dy })
        }}
        onPointerUp={event => {
          // Saved from the drag and this event, not from state, which can lag the last move by a frame.
          const current = drag.current
          if (current?.moved && !contained) sessionStorage.setItem('ui-tests-bar-offset', JSON.stringify({ x: current.from.x + event.clientX - current.x, y: current.from.y + event.clientY - current.y }))
        }}
        onClick={() => { if (drag.current?.moved) { drag.current = null; return } drag.current = null; move(position === 'bottom' ? 'top' : 'bottom') }}><Grip /></button>
      {recording && <RecordingSegment {...recording} />}
      <button className="uit-seg uit-summary" aria-expanded={expanded} aria-controls={`${id}-task`} onClick={() => setExpanded(!expanded)}>
        <span className="uit-sr">{expanded ? 'Hide task: ' : 'Show task: '}</span><b className="uit-progress">Task {index} of {total}{steps.length > 1 ? ` · step ${step + 1} of ${steps.length}` : ''}</b><span className="uit-summary-text">{summary}</span>
      </button>
      {confirm === 'done' ? <span className="uit-seg uit-confirm" role="group" aria-label="Finished this task?"><p>Finished this task?</p><button ref={confirmRef} className="uit-primary" disabled={busy} onClick={() => { setConfirm(null); onDone() }}>Yes, I&apos;ve finished</button><button onClick={() => { back.current = 'done'; setConfirm(null) }}>Not yet</button></span>
        : confirm === 'leave' ? <span className="uit-seg uit-confirm" role="group" aria-label="Leave this task before trying it?"><p>Leave this task before trying it?</p><button ref={confirmRef} disabled={busy} onClick={() => { setConfirm(null); onGiveUp('abandoned early') }}>Leave this task</button><button className="uit-primary" onClick={() => { back.current = 'leave'; setConfirm(null) }}>Stay and try</button></span>
        : <span className="uit-seg">
          {canExtend && onExtend && <button className="uit-quiet" onClick={onExtend} disabled={busy}>Need more time?</button>}
          <button ref={doneRef} className="uit-primary uit-done" disabled={busy} onClick={() => {
            if (steps.length && !onLastStep) { onStep?.(step); setStep(step + 1); return }
            setConfirm('done')
          }}>{doneLabel}</button>
          <button ref={cantRef} className="uit-quiet uit-cant" disabled={busy} onClick={() => interacted ? onGiveUp("couldn't do this") : setConfirm('leave')}>I couldn&apos;t do this</button>
        </span>}
    </div>
    {error && <p className="uit-error" role="alert">{error}</p>}
  </aside>
}

/**
 * The recording chip on its own, where the bar is not shown (the questions after the task): a recording dot with elapsed time and a
 * pause (Optimal Workshop's red icon; Userbrain's elapsed timer; Maze's mute and pause). It states, for screen, voice and webcam,
 * whether each is recorded: honest about what this attempt captures, which is the recording indicator the trace shows later.
 */
export function RecordingIndicator({ startedAt, recording, paused = false, onPause, live = false, contained = false, still = false, chrome, accent }: { startedAt?: number; recording: RecordingState; paused?: boolean; onPause?: () => void; live?: boolean; contained?: boolean; still?: boolean; chrome?: ChromeInput; accent?: string }) {
  const elapsed = useElapsed(startedAt, still)
  return <div className={`uit uit-rec${contained ? ' uit-contained' : ''}`} style={useChrome(chrome, accent)} data-research-taskbar role="group" aria-label={contained ? 'Example recording' : 'Recording'}>
    <PlayerStyles />
    <div className="uit-rec-row"><span className={`uit-dot${paused ? ' uit-paused' : ''}`} aria-hidden="true" /><span>{paused ? 'Paused' : 'Recording'}</span>{startedAt !== undefined && <time>{clock(elapsed)}</time>}{onPause && <button aria-pressed={paused} onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button>}</div>
    <p className="uit-states">{states(recording, live)}</p>
  </div>
}

/** A finished voice answer: the audio and the words, kept together with the attempt. */
export type Clip = { blob: Blob; mime: string; seconds: number; transcript: string }
type SpeechResult = { isFinal: boolean; 0: { transcript: string } }
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
function recognition(): Recognition | undefined {
  const Speech = (globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (globalThis as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition
  return Speech ? new Speech() : undefined
}
/**
 * "Talk instead": every question that takes words also takes voice (issue #18, item 8).
 * Microphone consent is asked once, in the flow, before the browser prompt (Maze lists optional permissions first; Optimal Workshop
 * lets each be declined). While recording a live dot and the elapsed time show with a Stop (Userbrain; Optimal Workshop), and the
 * transcript arrives in the answer box as it is spoken, where the person can correct it.
 */
export function TalkInstead({ consent, onConsent, clip, onClip, onTranscript, onLive }: { consent: boolean; onConsent: () => void; clip?: Clip; onClip: (clip: Clip | undefined) => void; onTranscript: (text: string) => void; onLive?: (live: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'asking' | 'recording'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [note, setNote] = useState('')
  const session = useRef<{ recorder: MediaRecorder; stream: MediaStream; speech?: Recognition; started: number; timer: ReturnType<typeof setInterval>; text: string } | null>(null)
  useEffect(() => () => { const current = session.current; if (current) { clearInterval(current.timer); current.speech?.stop(); if (current.recorder.state !== 'inactive') current.recorder.stop(); current.stream.getTracks().forEach(track => track.stop()) } }, [])
  async function start() {
    setNote('')
    let stream: MediaStream
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }) }
    catch { setState('idle'); setNote('The microphone is not available, so please type your answer.'); return }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(type => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) ?? ''
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    const speech = recognition()
    const started = Date.now()
    const current = { recorder, stream, speech, started, timer: setInterval(() => setSeconds((Date.now() - started) / 1000), 250), text: '' }
    session.current = current
    recorder.onstop = () => {
      clearInterval(current.timer); stream.getTracks().forEach(track => track.stop()); if (speech) speech.onresult = null
      const type = recorder.mimeType || mime || 'audio/webm'
      onClip({ blob: new Blob(chunks, { type }), mime: type.split(';')[0], seconds: (Date.now() - started) / 1000, transcript: current.text })
      onLive?.(false)
      setState('idle'); session.current = null
    }
    if (speech) {
      speech.continuous = true; speech.interimResults = true; speech.lang = document.documentElement.lang || 'en'
      let final = ''
      speech.onresult = event => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) { const result = event.results[i]; if (result.isFinal) final += result[0].transcript; else interim += result[0].transcript }
        current.text = (final + interim).trim(); onTranscript(current.text)
      }
      speech.onerror = () => setNote('No live transcript this time: type what you said, or leave the box empty. The recording is kept.')
      try { speech.start() } catch { setNote('No live transcript this time: type what you said, or leave the box empty. The recording is kept.') }
    } else setNote('No live transcript in this browser: type what you said, or leave the box empty. The recording is kept.')
    onTranscript(''); setSeconds(0); recorder.start(250); setState('recording'); onLive?.(true)
  }
  /** Stops listening first: a result the speech service delivers after Stop must not overwrite what the person then corrects. */
  function stop() { const current = session.current; if (!current) return; if (current.speech) current.speech.onresult = null; current.speech?.stop(); current.recorder.stop() }
  return <div className="uit-talk-wrap">
    {state === 'asking' && <div className="uit-talk-consent" role="group" aria-label="Talk instead of typing?">
      <p>Talk your answer instead of typing it? The microphone records only while the red dot shows. The audio and the words are kept with this attempt.</p>
      <span><button type="button" className="uit-primary" onClick={() => { onConsent(); void start() }}>Use the microphone</button><button type="button" onClick={() => setState('idle')}>Keep typing</button></span>
    </div>}
    {state !== 'asking' && <div className="uit-talk">
      {state === 'recording'
        ? <><span className="uit-live" role="status"><span className="uit-dot" aria-hidden="true" />Recording {clock(seconds)}</span><button type="button" onClick={stop}>Stop</button></>
        : clip
          ? <><span>Voice recorded · {clock(clip.seconds)}</span><button type="button" className="uit-link" onClick={() => { onClip(undefined); void (consent ? start() : setState('asking')) }}>Record again</button><button type="button" className="uit-link" onClick={() => onClip(undefined)}>Delete recording</button></>
          : <button type="button" onClick={() => consent ? void start() : setState('asking')}><Mic />Talk instead</button>}
    </div>}
    {note && <p className="uit-hint">{note}</p>}
  </div>
}

/** One post-task answer set, as the collector stores it. */
export type Answers = { seq: number; difficulty?: string; confidence?: number; afterGoal?: { ease: number; usefulness: number }; words?: string; validation?: string; voice: { question: 'difficulty' | 'words'; clip: Clip }[] }
type Screen = 'seq' | 'difficulty' | 'confidence' | 'validation' | 'uxUse' | 'uxEase' | 'words'
const agreement = ['Strongly disagree', 'Disagree', 'Neither', 'Agree', 'Strongly agree']
/** The questions in their settled words; `name` is the site the person tried, as the author names it. */
function wording(name: string) {
  return {
    // MeasuringU: the current Single Ease Question stem, seven numbered points, difficult on the left; asked after every attempt, including give-ups.
    seq: { question: 'Overall, how difficult or easy did you find this task?', points: 7, low: 'Very difficult', high: 'Very easy' },
    // MeasuringU: confidence 1 to 7, asked only when the outcome cannot be verified; never read as a completion rate.
    confidence: { question: 'How confident are you that you completed the task?', points: 7, low: 'Not at all confident', high: 'Very confident' },
    // PRD 02 and player-chrome.html: once after all goals, "Would it help them?" then "Easy to use?", five labelled choices.
    uxUse: { question: `Would ${name} be useful to you?`, points: 5, choices: agreement },
    uxEase: { question: `${capital(name)} is easy to use.`, points: 5, choices: agreement },
  } as Partial<Record<Screen, { question: string; points: number; low?: string; high?: string; choices?: string[] }>>
}
const capital = (text: string) => text ? text[0].toUpperCase() + text.slice(1) : text

/**
 * The questions after a task, one per screen (design/artefacts/player-chrome.html; issue #18, item 8; Lyssna, UXtweak and Maze show one
 * question per step): "After the task · n of N" for the attempt, "After all goals · n of 3" once at the end, nothing preselected
 * (Tidwell, Good Defaults), the scale selectable by keys as well as by pointer, the open question last with "Finish".
 * "What made it difficult?" follows an ease rating of 4 or below (MeasuringU seq10); it and the last box may be left empty.
 * Every question that takes words takes voice.
 */
export function Questions({ askConfidence = false, validation, ready = true, final = true, name = 'this website', onSubmit, onVoiceState, submitLabel = 'Finish', busy = false, autoFocus = false, chrome, accent }: { askConfidence?: boolean; validation?: { question: string; choices: string[] }; ready?: boolean; final?: boolean; name?: string; onSubmit: (answers: Answers) => void | Promise<void>; onVoiceState?: (state: { live: boolean; recorded: boolean }) => void; submitLabel?: string; busy?: boolean; autoFocus?: boolean; chrome?: ChromeInput; accent?: string }) {
  const id = useId()
  const [position, setPosition] = useState(0)
  const [values, setValues] = useState<Partial<Record<Screen, string>>>({})
  const [clips, setClips] = useState<Partial<Record<'difficulty' | 'words', Clip>>>({})
  const [consent, setConsent] = useState(false)
  const [live, setLive] = useState(false)
  const heading = useRef<HTMLElement>(null)
  const seq = Number(values.seq ?? 0)
  const attempt: Screen[] = ['seq', ...(seq && seq <= 4 ? ['difficulty' as const] : []), ...(askConfidence ? ['confidence' as const] : []), ...(validation ? ['validation' as const] : [])]
  const end: Screen[] = final ? ['uxUse', 'uxEase', 'words'] : []
  const screens = [...attempt, ...end]
  const screen = screens[Math.min(position, screens.length - 1)]
  const scale = wording(name)[screen]
  const optional = screen === 'difficulty' || screen === 'words'
  const answered = optional || !!values[screen]
  const lastScreen = position >= screens.length - 1
  const progress = position < attempt.length ? `After the task · ${position + 1} of ${attempt.length}` : `After all goals · ${position - attempt.length + 1} of ${end.length}`
  // Focus follows the question, so the number keys and Enter act on it; the player page starts there, an embedded example waits for the visitor.
  useEffect(() => { if (position || autoFocus) heading.current?.focus() }, [position, autoFocus])
  useEffect(() => { onVoiceState?.({ live, recorded: Object.values(clips).some(Boolean) }) }, [live, clips, onVoiceState])
  /** Keys 1 to N choose a point while the question has focus; typing in a box is never captured. */
  function key(event: React.KeyboardEvent) {
    if (!scale || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLInputElement && event.target.type === 'text') || event.metaKey || event.ctrlKey || event.altKey) return
    const value = Number(event.key)
    if (Number.isInteger(value) && value >= 1 && value <= scale.points) { event.preventDefault(); set(String(value)); document.getElementById(`${id}-${screen}-${value}`)?.focus() }
  }
  async function next() {
    if (!answered || busy) return
    if (!lastScreen) { setPosition(position + 1); return }
    const voice = (['difficulty', 'words'] as const).flatMap(question => clips[question] && screens.includes(question) ? [{ question, clip: { ...clips[question]!, transcript: values[question] ?? clips[question]!.transcript } }] : [])
    await onSubmit({ seq, difficulty: screens.includes('difficulty') ? values.difficulty || undefined : undefined, confidence: askConfidence ? Number(values.confidence) : undefined, afterGoal: final ? { ease: Number(values.uxEase), usefulness: Number(values.uxUse) } : undefined, words: values.words || undefined, validation: values.validation, voice })
  }
  const set = (value: string) => setValues(current => ({ ...current, [screen]: value }))
  const words = screen === 'difficulty' || screen === 'words'
  const style = useChrome(chrome, accent)
  return <form className="uit uit-sheet uit-questions" style={style} data-research-taskbar onKeyDown={key} onSubmit={event => { event.preventDefault(); void next() }}>
    <PlayerStyles />
    <p className="uit-progress" aria-live="polite">{progress}</p>
    <div className="uit-q" key={screen}>
      {scale && !scale.choices && <fieldset>
        <legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>{scale.question}</legend>
        <div className="uit-scale" style={{ '--uit-points': scale.points } as CSSProperties}>{Array.from({ length: scale.points }, (_, i) => i + 1).map(n => <label key={n}><input id={`${id}-${screen}-${n}`} type="radio" name={screen} value={n} checked={values[screen] === String(n)} onChange={() => set(String(n))} aria-label={n === 1 ? `1 ${scale.low}` : n === scale.points ? `${n} ${scale.high}` : String(n)} /><span aria-hidden="true">{n}</span></label>)}</div>
        <div className="uit-anchors" aria-hidden="true"><span>{scale.low}</span><span>{scale.high}</span></div>
      </fieldset>}
      {scale?.choices && <fieldset>
        <legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>{scale.question}</legend>
        <div className="uit-choices">{scale.choices.map((choice, i) => <label key={choice}><input id={`${id}-${screen}-${i + 1}`} type="radio" name={screen} value={i + 1} checked={values[screen] === String(i + 1)} onChange={() => set(String(i + 1))} /><span>{choice}</span></label>)}</div>
      </fieldset>}
      {screen === 'validation' && validation && <fieldset>
        <legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>{validation.question}</legend>
        <div className="uit-choices">{validation.choices.map(choice => <label key={choice}><input type="radio" name="validation" value={choice} checked={values.validation === choice} onChange={() => set(choice)} /><span>{choice}</span></label>)}</div>
      </fieldset>}
      {words && <>
        <label className="uit-label" htmlFor={`${id}-${screen}`} ref={heading as React.Ref<HTMLLabelElement>} tabIndex={-1}>{screen === 'difficulty' ? 'What made it difficult?' : `Anything you want to tell ${name === 'this website' ? 'us' : name}?`}</label>
        <textarea id={`${id}-${screen}`} name={screen} maxLength={5000} rows={4} readOnly={live} placeholder={screen === 'difficulty' ? 'In your own words.' : 'Type here, or talk.'} value={values[screen] ?? ''} onChange={event => set(event.target.value)} />
      </>}
    </div>
    <div className="uit-actions">
      {words ? <TalkInstead key={screen} consent={consent} onConsent={() => setConsent(true)} clip={clips[screen as 'words']} onClip={clip => setClips(current => ({ ...current, [screen]: clip }))} onTranscript={set} onLive={setLive} />
        : <span className="uit-hint">{screen === 'seq' || screen === 'confidence' ? 'Press a number key, or tap.' : 'Pick one.'}</span>}
      <button type="submit" className="uit-primary" disabled={!answered || live || busy || (lastScreen && !ready)}>{lastScreen ? submitLabel : 'Next'}</button>
    </div>
  </form>
}

/**
 * The screener, one question per screen (player-chrome.html: "A few questions first · n of 6"): the questions from `users`, then the
 * three fit questions from the purpose. Words and choices only: no labels, no rules, no drafting notes. Nothing is preselected.
 */
export function Screener({ screens, onSubmit, busy = false, chrome, accent }: { screens: ScreenerScreen[]; onSubmit: (answers: string[][]) => void | Promise<void>; busy?: boolean; chrome?: ChromeInput; accent?: string }) {
  const [position, setPosition] = useState(0)
  const [answers, setAnswers] = useState<string[][]>(() => screens.map(() => []))
  const heading = useRef<HTMLLegendElement>(null)
  useEffect(() => { heading.current?.focus() }, [position])
  const screen = screens[position], chosen = answers[position] ?? []
  const last = position >= screens.length - 1
  function toggle(option: string) {
    setAnswers(current => current.map((list, i) => i !== position ? list : screen.kind === 'single' ? [option] : list.includes(option) ? list.filter(item => item !== option) : [...list, option]))
  }
  return <form className="uit uit-sheet uit-questions uit-screener" style={useChrome(chrome, accent)} data-research-taskbar onSubmit={event => { event.preventDefault(); if (!chosen.length || busy) return; if (last) void onSubmit(answers); else setPosition(position + 1) }}>
    <PlayerStyles />
    <p className="uit-progress" aria-live="polite">A few questions first · {position + 1} of {screens.length}</p>
    <fieldset className="uit-q" key={position}>
      <legend ref={heading} tabIndex={-1}>{screen.question}</legend>
      <div className={`uit-choices${screen.kind === 'multi' ? ' uit-multi' : ''}`}>{screen.options.map(option => <label key={option}><input type={screen.kind === 'multi' ? 'checkbox' : 'radio'} name={`screener-${position}`} value={option} checked={chosen.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div>
    </fieldset>
    <div className="uit-actions"><span className="uit-hint">{screen.kind === 'multi' ? 'Pick all that apply.' : 'Pick one.'}</span><button type="submit" className="uit-primary" disabled={!chosen.length || busy}>Next</button></div>
  </form>
}

/** The first click on the page, as the player saw it: the element, a link's destination, where the page went, and where on the page. */
export type FirstClick = { target: string; href?: string; after?: string; x: number; y: number }
/** The first look, as the collector stores it: the words, the appeal rating and the first click (null when they chose not to click). */
export type ImpressionAnswer = { text: string; clip?: Clip; appeal: number; firstClick: FirstClick | null }
const appealPoints = 9
/**
 * The first impression (PRD 02, "The impression stage"; impression-research.md): the page flashed for half a second, one appeal item on a
 * 1 to 9 scale (Lindgaard 2006: reliable at 500 ms), the open question, typed or spoken, then the real page back for one first click
 * toward the first goal, unprimed by the card. The purpose it is read against is never shown here, as an option or a hint. The click is
 * read from the page itself when it is on the author's own site; on another site only where it landed is kept, and it is coded "couldn't tell".
 */
export function Impression({ page, flashMs = 500, question = 'What was that page for?', goal, onSubmit, busy = false, chrome, accent }: { page: string; flashMs?: number; question?: string; goal?: string; onSubmit: (answer: ImpressionAnswer) => void | Promise<void>; busy?: boolean; chrome?: ChromeInput; accent?: string }) {
  const id = useId()
  const [phase, setPhase] = useState<'ready' | 'flash' | 'appeal' | 'question' | 'click'>('ready')
  const [loaded, setLoaded] = useState(false)
  const [appeal, setAppeal] = useState(0)
  const [text, setText] = useState('')
  const [clip, setClip] = useState<Clip>()
  const [consent, setConsent] = useState(false)
  const [live, setLive] = useState(false)
  const heading = useRef<HTMLElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const clicked = useRef(false)
  const style = useChrome(chrome, accent)
  useEffect(() => { if (phase !== 'flash') return; const timer = setTimeout(() => setPhase('appeal'), flashMs); return () => clearTimeout(timer) }, [phase, flashMs])
  useEffect(() => { if (phase !== 'ready' && phase !== 'flash') heading.current?.focus() }, [phase])
  const answer = (firstClick: FirstClick | null) => { if (!busy) void onSubmit({ text, clip: clip && { ...clip, transcript: text || clip.transcript }, appeal, firstClick }) }
  useEffect(() => {
    if (phase !== 'click') return
    // The author's own page: read the element and where the page went. Another site's page cannot be read; the overlay below takes the click instead.
    let doc: Document | null = null
    try { doc = frame.current?.contentDocument ?? null } catch { doc = null }
    if (!doc) return
    const view = frame.current!.contentWindow!
    function first(event: MouseEvent) {
      if (clicked.current) return
      clicked.current = true
      // The page lives in its own window, so its elements are not this window's Element: test for the method instead.
      const node = event.target as Element | null
      const element = node && typeof node.closest === 'function' ? node.closest('a,button,input,select,textarea,[role=button],[role=link],[role=menuitem]') ?? node : null
      const href = element?.closest('a')?.href || undefined
      const x = Math.min(1, Math.max(0, event.clientX / (view.innerWidth || 1))), y = Math.min(1, Math.max(0, event.clientY / (view.innerHeight || 1)))
      // Wait for a client-side navigation to land before reading where the page went.
      setTimeout(() => { let after: string | undefined; try { after = view.location.href } catch { after = undefined } answer({ target: element ? targetLabel(element) || element.tagName.toLowerCase() : 'the page', href, after, x, y }) }, 600)
    }
    doc.addEventListener('click', first, true)
    return () => doc?.removeEventListener('click', first, true)
  }, [phase])
  const scale = <div className="uit-scale" style={{ '--uit-points': appealPoints } as CSSProperties}>{Array.from({ length: appealPoints }, (_, i) => i + 1).map(n => <label key={n}><input id={`${id}-appeal-${n}`} type="radio" name="appeal" value={n} checked={appeal === n} onChange={() => setAppeal(n)} aria-label={n === 1 ? '1 Not at all appealing' : n === appealPoints ? `${n} Very appealing` : String(n)} /><span aria-hidden="true">{n}</span></label>)}</div>
  return <>
    <iframe ref={frame} className={`uit-flash${phase === 'flash' || phase === 'click' ? ' uit-flash-on' : ''}${phase === 'click' ? ' uit-flash-live' : ''}`} title={phase === 'click' ? 'The page, back for one click' : 'The page, shown for half a second'} src={page} tabIndex={phase === 'click' ? 0 : -1} aria-hidden={phase !== 'flash' && phase !== 'click'} onLoad={() => setLoaded(true)} />
    {phase === 'ready' && <section className="uit uit-sheet uit-questions" style={style} data-research-taskbar aria-labelledby="uit-impression-ready">
      <PlayerStyles />
      <p className="uit-progress">First impression</p>
      <h1 id="uit-impression-ready">You will see a page for half a second, then a few questions about it.</h1>
      <div className="uit-actions"><span className="uit-hint">There is no right answer.</span><button className="uit-primary" disabled={!loaded} onClick={() => setPhase('flash')}>Show the page</button></div>
    </section>}
    {phase === 'appeal' && <form className="uit uit-sheet uit-questions" style={style} data-research-taskbar onKeyDown={event => { const n = Number(event.key); if (Number.isInteger(n) && n >= 1 && n <= appealPoints && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); setAppeal(n); document.getElementById(`${id}-appeal-${n}`)?.focus() } }} onSubmit={event => { event.preventDefault(); if (appeal) setPhase('question') }}>
      <PlayerStyles />
      <h1 className="uit-sr">First impression</h1>
      <p className="uit-progress">You saw a page for half a second</p>
      <fieldset className="uit-q">
        <legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>How appealing did that page look?</legend>
        {scale}
        <div className="uit-anchors" aria-hidden="true"><span>Not at all appealing</span><span>Very appealing</span></div>
      </fieldset>
      <div className="uit-actions"><span className="uit-hint">Press a number key, or tap.</span><button type="submit" className="uit-primary" disabled={!appeal}>Next</button></div>
    </form>}
    {phase === 'question' && <form className="uit uit-sheet uit-questions" style={style} data-research-taskbar onSubmit={event => { event.preventDefault(); if (!live) setPhase('click') }}>
      <PlayerStyles />
      <h1 className="uit-sr">First impression</h1>
      <p className="uit-progress">You saw a page for half a second</p>
      <div className="uit-q">
        <label className="uit-label" htmlFor="uit-impression" ref={heading as React.Ref<HTMLLabelElement>} tabIndex={-1}>{question}</label>
        <textarea id="uit-impression" maxLength={5000} rows={3} readOnly={live} placeholder="In your own words. There is no right answer." value={text} onChange={event => setText(event.target.value)} />
      </div>
      <div className="uit-actions">
        <TalkInstead consent={consent} onConsent={() => setConsent(true)} clip={clip} onClip={setClip} onTranscript={setText} onLive={setLive} />
        <button type="submit" className="uit-primary" disabled={live}>Next</button>
      </div>
    </form>}
    {phase === 'click' && <>
      {/* Another site's page cannot be read from here: a clear layer over it takes the one click and keeps only where it landed. */}
      <FirstClickLayer frame={frame} onClick={click => { if (!clicked.current) { clicked.current = true; answer(click) } }} />
      <section className="uit uit-sheet uit-first-click" style={style} data-research-taskbar aria-labelledby={`${id}-click`}>
        <PlayerStyles />
        <p className="uit-progress">The page is back</p>
        <h1 id={`${id}-click`} ref={heading as React.Ref<HTMLHeadingElement>} tabIndex={-1}>{goal ? `Where would you click first to ${goal}?` : 'Where would you click first?'}</h1>
        <div className="uit-actions"><span className="uit-hint">Click once on the page.</span><button type="button" className="uit-quiet" disabled={busy} onClick={() => { if (!clicked.current) { clicked.current = true; answer(null) } }}>I wouldn&apos;t click anything</button></div>
      </section>
    </>}
  </>
}
/** A clear layer over a page the player cannot read, for its first click; absent when the page is the author's own. */
function FirstClickLayer({ frame, onClick }: { frame: React.RefObject<HTMLIFrameElement | null>; onClick: (click: FirstClick) => void }) {
  const [readable, setReadable] = useState(true)
  useEffect(() => { try { setReadable(!!frame.current?.contentDocument) } catch { setReadable(false) } }, [frame])
  if (readable) return null
  return <div className="uit-click-layer" data-research-taskbar aria-hidden="true" onClick={event => { const box = event.currentTarget.getBoundingClientRect(); onClick({ target: 'a point on the page', x: (event.clientX - box.left) / (box.width || 1), y: (event.clientY - box.top) / (box.height || 1) }) }} />
}

async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

/** Mount once in the root layout. When the `ui-tests-run` cookie names an active run, records clicks, URL changes, scroll, masked input and pauses, and renders the task bar and the recording surface in a portal that survives App Router navigation. */
export function UiTests() {
  const [run, setRun] = useState<Participant>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [interacted, setInteracted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [now, setNow] = useState(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const pausedRef = useRef(false)
  useEffect(() => {
    fetch(endpoint).then(response => response.ok ? response.json() : null).then(value => { if (value?.status === 'active') setRun(value) }).catch(() => {})
  }, [])
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => { if (!run) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [run])
  useEffect(() => {
    if (!run || location.pathname.startsWith('/ui-tests/')) return
    let lastActivity = Date.now(), lastUrl = '', idle = false, cancelled = false
    const timers = new Set<ReturnType<typeof setTimeout>>()
    /** Queues one event for the collector, preserving order across navigation. A paused recording drops events. */
    function record(event: Record<string, unknown>) {
      if (cancelled || pausedRef.current) return
      queue.current = queue.current.then(() => send({ action: 'events', events: [{ at: Date.now(), url: location.origin + location.pathname, ...event }] })).catch(err => { setError(String(err)) })
    }
    /** Marks activity so the pause detector restarts. */
    function activity() { lastActivity = Date.now(); idle = false }
    /** Records a click with whether the page changed within 300 ms; clicks on the player's own surfaces are ignored. */
    function click(event: MouseEvent) {
      const element = event.target instanceof Element ? event.target.closest('button,a,input,[role=button]') ?? event.target : null
      if (!element || element.closest('[data-research-taskbar]')) return
      activity(); setInteracted(true)
      const before = pageMarkup(), url = location.href, target = targetLabel(element)
      const timer = setTimeout(() => { record({ type: 'click', target, changed: before !== pageMarkup() || url !== location.href }); timers.delete(timer) }, 300)
      timers.add(timer)
    }
    /** Records that an input changed, without its value. */
    function input(event: globalThis.Event) { activity(); if (event.target instanceof Element && !event.target.closest('[data-research-taskbar]')) { setInteracted(true); record({ type: 'input', target: targetLabel(event.target) }) } }
    let lastScroll = 0
    /** Records scroll position at most twice a second. */
    function scroll() { activity(); if (Date.now() - lastScroll > 500) { lastScroll = Date.now(); record({ type: 'scroll', target: `y=${Math.round(window.scrollY)}` }) } }
    const interval = setInterval(() => {
      if (location.pathname !== lastUrl) { lastUrl = location.pathname; record({ type: 'url' }) }
      if (!idle && Date.now() - lastActivity > 5000) { idle = true; record({ type: 'pause', stoppedMs: Date.now() - lastActivity }) }
    }, 250)
    document.addEventListener('click', click, true); document.addEventListener('input', input, true); window.addEventListener('scroll', scroll); document.addEventListener('keydown', activity)
    return () => { cancelled = true; clearInterval(interval); timers.forEach(clearTimeout); document.removeEventListener('click', click, true); document.removeEventListener('input', input, true); window.removeEventListener('scroll', scroll); document.removeEventListener('keydown', activity) }
  }, [run])
  /** Ends the attempt with the given reason, sends the end-state snapshot and moves to the questions. */
  async function finish(reason: 'done' | "couldn't do this" | 'abandoned early' | 'ran out of time') {
    if (!run || busy) return
    setBusy(true)
    try { await queue.current; await send({ action: 'end', reason, snapshot: snapshot() }); location.assign(`/ui-tests/${run.id}?stage=questions`) }
    catch (err) { setError(String(err)); setBusy(false) }
  }
  useEffect(() => {
    if (!run) return
    const timer = setTimeout(() => { void finish('ran out of time') }, Math.max(0, run.startedAt + run.timeBox * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [run, busy]) // attempt deadline persists through navigation
  if (!run || typeof document === 'undefined' || location.pathname.startsWith('/ui-tests/')) return null
  const remaining = run.startedAt + run.timeBox * 1000 - now
  return createPortal(<>
    <TaskBar scenario={run.scenario} steps={run.tasks} index={run.sequence.index} total={run.sequence.total} interacted={interacted} busy={busy} error={error} accent={run.accent}
      recording={{ startedAt: run.startedAt, state: run.recording, paused, onPause: () => setPaused(!paused) }}
      canExtend={!run.extended && now > 0 && remaining <= 60_000}
      onExtend={async () => { try { setRun(await send({ action: 'extend' })) } catch (err) { setError(String(err)) } }}
      onStep={async step => { try { await queue.current; await send({ action: 'events', events: [{ type: 'step', at: Date.now(), url: location.origin + location.pathname, step, snapshot: snapshot() }] }) } catch (err) { setError(String(err)) } }}
      onDone={async () => {
        if (run.tasks.length) {
          try { await queue.current; await send({ action: 'events', events: [{ type: 'step', at: Date.now(), url: location.origin + location.pathname, step: run.tasks.length - 1, snapshot: snapshot() }] }) }
          catch (err) { setError(String(err)); return }
        }
        await finish('done')
      }}
      onGiveUp={reason => void finish(reason)} />
  </>, document.body)
}

/** After consent, the stages that come once before the first task: the screener, then the first impression, then the card. */
function nextStage(run: Participant) { return run.screener.length && !run.screened ? 'screener' : run.impression && !run.impressed ? 'impression' : 'scenario' }

/**
 * The participant player at `/ui-tests/[run]`: consent, the screener, the first impression, the scenario card, then the questions and
 * the upload wait. It never shows the happy path, the hooks, the purpose or the trace.
 */
export function Player({ runId, token }: { runId: string; token?: string }) {
  const [run, setRun] = useState<Participant>()
  const [stage, setStage] = useState(token ? 'consent' : 'questions')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [details, setDetails] = useState(false)
  const [voice, setVoice] = useState({ live: false, recorded: false })
  useEffect(() => {
    if (token) history.replaceState(null, '', `/ui-tests/${runId}`)
    fetch(endpoint, token ? { headers: { Authorization: `Bearer ${runId}.${token}` } } : undefined).then(r => r.ok ? r.json() : Promise.reject(new Error('Start this rehearsal from the command line.'))).then(setRun).catch(err => setError(String(err)))
  }, [token, runId])
  useEffect(() => {
    if (!['questions', 'checking'].includes(stage)) return
    const timer = setInterval(() => {
      fetch(endpoint).then(r => r.ok ? r.json() : null).then((value: Participant | null) => {
        if (!value) return
        setRun(value)
        if (stage === 'checking' && value.verificationReady) setStage(value.validation ? 'questions' : 'thanks')
      }).catch(err => setError(String(err)))
    }, 250)
    return () => clearInterval(timer)
  }, [stage])
  // Someone who opens your link meets the join screen first; a rehearsal on your own machine starts at the consent.
  const joined = useRef(false)
  useEffect(() => { if (run?.source === 'link' && run.status === 'created' && stage === 'consent' && !joined.current) setStage('join') }, [run, stage])
  const chrome = useChrome(undefined, run?.accent)
  const recording = run ? { ...run.recording, voice: run.recording.voice || voice.recorded } : { events: true as const, screen: false, voice: false, webcam: false }
  /** Sends one stage's answers and moves on, keeping the person on the stage if it cannot be saved. */
  async function save(body: unknown, after: (value: Participant) => string) {
    setBusy(true)
    try { const value = await send(body); setRun(value); setStage(after(value)) } catch (err) { setError(String(err)) } finally { setBusy(false) }
  }
  const name = run?.name ?? 'this website'
  let body: ReactNode = null
  if (stage === 'join' && run) body = <JoinSheet level={1} name={run.name} minutes={run.minutes ?? 10} video={run.video} accent={run.accent} onStart={() => { joined.current = true; setStage('consent') }} />
  else if (stage === 'consent') body = <section className="uit-sheet uit-consent" aria-labelledby="uit-consent-title">
    {/* Consent (player-chrome.html): what is always recorded first, in plain words, then the screen as video only when the author wrote
        video: true, voice the person's choice, the camera off (Maze lists required and optional; Optimal Workshop lets each be declined).
        "The website is being tested, not you" and "you can stop at any time" (Loop11; Optimal Workshop). The purpose is not shown:
        the first impression is read against it. */}
    <p className="uit-progress">{capital(name)} · before you start</p>
    <h1 id="uit-consent-title">{capital(name)} would like to watch you try something on their site.</h1>
    <ul className="uit-list" aria-label="What is recorded">
      <li><i aria-hidden="true" /><span>What you do on their page: where you click, what you type, which pages you open</span><em>always</em></li>
      {run?.video && <li><i aria-hidden="true" /><span>Your screen, as a video, while you try it</span><em>needed</em></li>}
      <li><i className="uit-off" aria-hidden="true" /><span>Your voice, only if you choose to talk later</span><em>optional</em></li>
      <li><i className="uit-off" aria-hidden="true" /><span>Your camera</span><em>off</em></li>
    </ul>
    <p className="uit-hint">The website is being tested, not you. You can stop at any time.</p>
    {details && <p className="uit-hint" id="uit-recorded">Typing is kept as the fact that you typed, never what you typed. {run?.video ? 'With people, the screen video starts with the task and your browser asks first; this rehearsal keeps the final page instead. ' : ''}Your voice is recorded only if you press Talk instead, and you are asked first. This rehearsal is stored on this computer.</p>}
    <div className="uit-actions"><button className="uit-quiet" aria-expanded={details} aria-controls="uit-recorded" onClick={() => setDetails(!details)}>What is recorded?</button><button className="uit-primary" disabled={!run || busy} onClick={() => save({ action: 'consent', id: runId, token }, nextStage)}>Continue</button></div>
  </section>
  else if (stage === 'screener' && run) body = <><h1 className="uit-sr">A few questions first</h1><Screener accent={run.accent} screens={run.screener} busy={busy} onSubmit={answers => save({ action: 'screener', answers }, nextStage)} /></>
  else if (stage === 'impression' && run?.impression) body = <Impression accent={run.accent} page={run.impression.page} flashMs={run.impression.flashMs} question={run.impression.question} goal={run.impression.goal} busy={busy} onSubmit={async ({ text, clip, appeal, firstClick }) => {
    if (clip) { try { await send({ action: 'voice', question: 'impression', mime: clip.mime, audio: await base64(clip.blob), transcript: clip.transcript, seconds: clip.seconds }) } catch (err) { setError(String(err)); return } }
    await save({ action: 'impression', answer: text, spoken: !!clip, appeal, firstClick }, nextStage)
  }} />
  // "Start task" opens the goal's start: where the person lands, never the path the author expects them to take.
  else if (stage === 'scenario' && run) body = <ScenarioCard level={1} accent={run.accent} scenario={run.scenario} index={run.sequence.index} total={run.sequence.total} busy={busy} onStart={async () => { setBusy(true); try { await send({ action: 'begin' }); location.assign(run.start) } catch (err) { setError(String(err)); setBusy(false) } }} />
  else if (stage === 'questions') body = <div className="uit-stack">
    <h1 className="uit-sr">A few final questions</h1>
    {run && <RecordingIndicator recording={recording} live={voice.live} accent={run.accent} still />}
    <Questions autoFocus accent={run?.accent} name={run?.name} final={!run || run.sequence.index === run.sequence.total} askConfidence={run?.askConfidence} validation={run?.validation} ready={!!run?.verificationReady} busy={busy} onVoiceState={setVoice} onSubmit={async answers => {
      setBusy(true)
      try {
        for (const { question, clip } of answers.voice) await send({ action: 'voice', question, mime: clip.mime, audio: await base64(clip.blob), transcript: clip.transcript, seconds: clip.seconds })
        await send({ action: 'questions', seq: answers.seq, difficulty: answers.difficulty, confidence: answers.confidence, afterGoal: answers.afterGoal, words: answers.words, answers: run?.validation ? { [run.validation.question]: answers.validation ?? '' } : undefined })
        setStage('checking')
      } catch (err) { setError(String(err)) } finally { setBusy(false) }
    }} />
  </div>
  // The upload wait asks the participant to keep the tab open (Optimal Workshop).
  else if (stage === 'checking') body = <section className="uit-sheet uit-wait"><h1>Saving your answers</h1><p role="status">Please keep this tab open until this finishes.</p></section>
  else if (stage === 'thanks') body = <section className="uit-sheet uit-wait"><h1>Thank you</h1><p>Your rehearsal is saved. You can close this tab and return to your terminal.</p></section>
  return <main className="uit uit-page" style={chrome}><PlayerStyles />{body}{error && <p className="uit-error" role="alert">{error}</p>}</main>
}
