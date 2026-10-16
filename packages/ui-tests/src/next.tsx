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
type Participant = { id: string; author: string; purpose: string; status: string; scenario: string; tasks: string[]; timeBox: number; extended: boolean; startedAt: number; sequence: { index: number; total: number }; askConfidence: boolean; recording: RecordingState; verificationReady: boolean; validation?: { question: string; choices: string[] }; accent?: string }
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
 * - On a touch screen it hides while the person types in the host page, and the host page keeps focus clear of it (WCAG 2.4.11).
 */
export function TaskBar({ scenario, steps = [], index = 1, total = 1, interacted, onDone, onGiveUp, onStep, canExtend = false, onExtend, busy = false, contained = false, error, recording, chrome, accent }: { scenario: string; steps?: string[]; index?: number; total?: number; interacted: boolean; onDone: () => void; onGiveUp: (reason: "couldn't do this" | 'abandoned early') => void; onStep?: (step: number) => void; canExtend?: boolean; onExtend?: () => void; busy?: boolean; contained?: boolean; error?: string; recording?: BarRecording; chrome?: ChromeInput; accent?: string }) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const [confirm, setConfirm] = useState<'done' | 'leave' | null>(null)
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom')
  const [typing, setTyping] = useState(false)
  const [step, setStep] = useState(0)
  const drag = useRef<{ y: number; moved: boolean } | null>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // The confirmation replaces the controls in the pill; cancelling it puts focus back on the control that opened it, which is mounted again.
  const doneRef = useRef<HTMLButtonElement>(null), cantRef = useRef<HTMLButtonElement>(null), back = useRef<'done' | 'leave' | null>(null)
  const style = useChrome(chrome, accent)
  useEffect(() => { if (!contained) { const saved = sessionStorage.getItem('ui-tests-bar'); if (saved === 'top') setPosition('top') } }, [contained])
  useEffect(() => {
    if (confirm) { confirmRef.current?.focus(); return }
    if (back.current) { (back.current === 'done' ? doneRef : cantRef).current?.focus(); back.current = null }
  }, [confirm])
  useEffect(() => {
    if (contained) return
    // Focus is never hidden behind the bar (WCAG 2.4.11): the host page scrolls focused controls clear of it while it is shown.
    const root = document.documentElement, previous = root.style.scrollPaddingBottom
    root.style.scrollPaddingBottom = '72px'
    // A phone keyboard can leave a fixed bar over the field: on touch, the bar steps aside while a host input has focus.
    const touch = matchMedia('(pointer: coarse)')
    const field = (target: EventTarget | null) => target instanceof Element && !target.closest('[data-research-taskbar]') && target.matches('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]')
    const focusin = (event: FocusEvent) => setTyping(touch.matches && field(event.target))
    const focusout = () => setTyping(false)
    document.addEventListener('focusin', focusin); document.addEventListener('focusout', focusout)
    return () => { root.style.scrollPaddingBottom = previous; document.removeEventListener('focusin', focusin); document.removeEventListener('focusout', focusout) }
  }, [contained])
  function move(next: 'bottom' | 'top') { setPosition(next); if (!contained) sessionStorage.setItem('ui-tests-bar', next) }
  const onLastStep = step + 1 >= steps.length
  const doneLabel = steps.length && !onLastStep ? 'Done with this step' : 'Done'
  const summary = steps.length ? steps[step] : scenario
  return <aside data-research-taskbar aria-label={contained ? 'Example task bar' : 'Your task'} style={style} className={`uit uit-bar uit-${position}${contained ? ' uit-contained' : ''}${typing ? ' uit-hidden' : ''}`}>
    <PlayerStyles />
    {expanded && <div className="uit-sheet uit-task" id={`${id}-task`}><p>{scenario}</p>{steps.length > 0 && <p className="uit-hint">Step {step + 1}: {steps[step]}</p>}<Ending /></div>}
    <div className="uit-pill">
      <button className="uit-handle" aria-label={position === 'bottom' ? 'Move the task bar to the top' : 'Move the task bar to the bottom'}
        onPointerDown={event => { drag.current = { y: event.clientY, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={event => { if (drag.current && Math.abs(event.clientY - drag.current.y) > 16) drag.current.moved = true }}
        onPointerUp={event => { if (drag.current?.moved) move(event.clientY < innerHeight / 2 ? 'top' : 'bottom') }}
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
export type Answers = { seq: number; difficulty?: string; confidence?: number; afterGoal: { ease: number; usefulness: number }; words?: string; validation?: string; voice: { question: 'difficulty' | 'words'; clip: Clip }[] }
type Screen = 'seq' | 'difficulty' | 'confidence' | 'validation' | 'uxEase' | 'uxUse' | 'words'
const scales: Partial<Record<Screen, { question: string; points: number; low: string; high: string; hint?: string }>> = {
  // MeasuringU: the current Single Ease Question stem, seven numbered points, difficult on the left; asked after every attempt, including give-ups.
  seq: { question: 'Overall, how difficult or easy did you find this task?', points: 7, low: '1 Very difficult', high: '7 Very easy' },
  // MeasuringU: confidence 1 to 7, asked only when the outcome cannot be verified; never read as a completion rate.
  confidence: { question: 'How confident are you that you completed the task?', points: 7, low: '1 Not at all confident', high: '7 Very confident' },
  // PRD 02: after the goal, "Easy to use?" and "Would it help them?", two items on a 5-point agreement scale.
  uxEase: { question: 'This website is easy to use.', points: 5, low: '1 Strongly disagree', high: '5 Strongly agree', hint: 'How much do you agree?' },
  uxUse: { question: 'This website’s capabilities meet my requirements.', points: 5, low: '1 Strongly disagree', high: '5 Strongly agree', hint: 'How much do you agree?' },
}

/**
 * The questions after a task, one per screen in the Typeform register (issue #18, item 8; Lyssna, UXtweak and Maze show one question per step):
 * large targets, the scale selectable by keys 1 to 7 as well as by pointer, "Question n of N", a calm transition, the open question last.
 * "What made it difficult?" follows an ease rating of 4 or below (MeasuringU seq10). Optional questions show "Skip" (Maze). Every question that
 * takes words takes voice.
 */
export function Questions({ askConfidence = false, validation, ready = true, onSubmit, onVoiceState, submitLabel = 'Send answers', busy = false, autoFocus = false, chrome, accent }: { askConfidence?: boolean; validation?: { question: string; choices: string[] }; ready?: boolean; onSubmit: (answers: Answers) => void | Promise<void>; onVoiceState?: (state: { live: boolean; recorded: boolean }) => void; submitLabel?: string; busy?: boolean; autoFocus?: boolean; chrome?: ChromeInput; accent?: string }) {
  const id = useId()
  const [position, setPosition] = useState(0)
  const [values, setValues] = useState<Partial<Record<Screen, string>>>({})
  const [clips, setClips] = useState<Partial<Record<'difficulty' | 'words', Clip>>>({})
  const [consent, setConsent] = useState(false)
  const [live, setLive] = useState(false)
  const heading = useRef<HTMLElement>(null)
  const seq = Number(values.seq ?? 0)
  const screens: Screen[] = ['seq', ...(seq && seq <= 4 ? ['difficulty' as const] : []), ...(askConfidence ? ['confidence' as const] : []), ...(validation ? ['validation' as const] : []), 'uxEase', 'uxUse', 'words']
  const screen = screens[Math.min(position, screens.length - 1)]
  const scale = scales[screen]
  const optional = screen === 'difficulty' || screen === 'words'
  const answered = optional || !!values[screen]
  const lastScreen = position >= screens.length - 1
  // Focus follows the question, so the number keys and Enter act on it; the player page starts there, an embedded example waits for the visitor.
  useEffect(() => { if (position || autoFocus) heading.current?.focus() }, [position, autoFocus])
  useEffect(() => { onVoiceState?.({ live, recorded: Object.values(clips).some(Boolean) }) }, [live, clips, onVoiceState])
  /** Keys 1 to N choose a point on the scale while the question has focus; typing in a box is never captured. */
  function key(event: React.KeyboardEvent) {
    if (!scale || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLInputElement && event.target.type === 'text') || event.metaKey || event.ctrlKey || event.altKey) return
    const value = Number(event.key)
    if (Number.isInteger(value) && value >= 1 && value <= scale.points) { event.preventDefault(); set(String(value)); document.getElementById(`${id}-${screen}-${value}`)?.focus() }
  }
  async function next() {
    if (!answered || busy) return
    if (!lastScreen) { setPosition(position + 1); return }
    const voice = (['difficulty', 'words'] as const).flatMap(question => clips[question] && screens.includes(question) ? [{ question, clip: { ...clips[question]!, transcript: values[question] ?? clips[question]!.transcript } }] : [])
    await onSubmit({ seq, difficulty: screens.includes('difficulty') ? values.difficulty || undefined : undefined, confidence: askConfidence ? Number(values.confidence) : undefined, afterGoal: { ease: Number(values.uxEase), usefulness: Number(values.uxUse) }, words: values.words || undefined, validation: values.validation, voice })
  }
  const set = (value: string) => setValues(current => ({ ...current, [screen]: value }))
  const words = screen === 'difficulty' || screen === 'words'
  const style = useChrome(chrome, accent)
  return <form className="uit uit-sheet uit-questions" style={style} data-research-taskbar onKeyDown={key} onSubmit={event => { event.preventDefault(); void next() }}>
    <PlayerStyles />
    <p className="uit-progress" aria-live="polite">Question {position + 1} of {screens.length}</p>
    <div className="uit-q" key={screen}>
      {scale && <fieldset>
        <legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>{scale.question}</legend>
        {scale.hint && <p className="uit-hint">{scale.hint} Press a number key or choose a point.</p>}
        {!scale.hint && <p className="uit-hint">Press a number key from 1 to {scale.points}, or choose a point.</p>}
        <div className="uit-scale" style={{ '--uit-points': scale.points } as CSSProperties}>{Array.from({ length: scale.points }, (_, i) => i + 1).map(n => <label key={n}><input id={`${id}-${screen}-${n}`} type="radio" name={screen} value={n} checked={values[screen] === String(n)} onChange={() => set(String(n))} aria-label={n === 1 ? scale.low : n === scale.points ? scale.high : String(n)} /><span aria-hidden="true">{n}</span></label>)}</div>
        <div className="uit-anchors" aria-hidden="true"><span>{scale.low}</span><span>{scale.high}</span></div>
      </fieldset>}
      {screen === 'validation' && validation && <fieldset>
        <legend ref={heading as React.Ref<HTMLLegendElement>} tabIndex={-1}>{validation.question}</legend>
        <div className="uit-choices">{validation.choices.map(choice => <label key={choice}><input type="radio" name="validation" value={choice} checked={values.validation === choice} onChange={() => set(choice)} /><span>{choice}</span></label>)}</div>
      </fieldset>}
      {words && <>
        <label className="uit-label" htmlFor={`${id}-${screen}`} ref={heading as React.Ref<HTMLLabelElement>} tabIndex={-1}>{screen === 'difficulty' ? 'What made it difficult?' : 'Anything else you want to tell us?'} <span className="uit-hint">(optional)</span></label>
        <textarea id={`${id}-${screen}`} name={screen} maxLength={5000} rows={4} readOnly={live} value={values[screen] ?? ''} onChange={event => set(event.target.value)} />
        <TalkInstead key={screen} consent={consent} onConsent={() => setConsent(true)} clip={clips[screen as 'words']} onClip={clip => setClips(current => ({ ...current, [screen]: clip }))} onTranscript={set} onLive={setLive} />
      </>}
    </div>
    <div className="uit-actions">
      <span>
        {optional && !lastScreen && <button type="button" className="uit-quiet" disabled={live} onClick={() => { set(''); setClips(current => ({ ...current, [screen]: undefined })); setPosition(position + 1) }}>Skip</button>}
        <button type="submit" className="uit-primary" disabled={!answered || live || busy || (lastScreen && !ready)}>{lastScreen ? submitLabel : 'Next'}</button>
      </span>
    </div>
  </form>
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

/**
 * The participant player at `/ui-tests/[run]`: consent, the scenario card, then the questions and the upload wait.
 * It never shows the happy path, the hooks or the trace.
 */
export function Player({ runId, token }: { runId: string; token?: string }) {
  const [run, setRun] = useState<Participant>()
  const [stage, setStage] = useState(token ? 'consent' : 'questions')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
  const chrome = useChrome(undefined, run?.accent)
  const recording = run ? { ...run.recording, voice: run.recording.voice || voice.recorded } : { events: true as const, screen: false, voice: false, webcam: false }
  let body: ReactNode = null
  if (stage === 'consent') body = <section className="uit-sheet uit-consent" aria-labelledby="uit-consent-title">
    {/* Consent and recording: a list of what is recorded, each required or optional (Maze); "the website is being tested, not you" and
        "you can stop at any time" (Loop11's deployment; Optimal Workshop's guide); recording starts at the first task (Optimal Workshop).
        No camera preview is shown because this study never turns the camera on; webcam stays opt-in and off. */}
    <h1 id="uit-consent-title">Before you start</h1>
    <p>{run?.author ?? 'The author'} would like you to try {run && run.sequence.total > 1 ? `${run.sequence.total} short tasks` : 'a short task'} on their website. Purpose: {run?.purpose ?? 'Loading…'}</p>
    <p className="uit-reassure">The website is being tested, not you. There are no right or wrong answers, and you can stop at any time.</p>
    <table><caption className="uit-sr">What this study records</caption><tbody>
      <tr><th scope="row">Interactions</th><td>Required</td><td>Clicks, pages, scrolling and pauses, from the first task. Typing is masked; no input values are recorded.</td></tr>
      <tr><th scope="row">Screen</th><td>Not recorded</td><td>This rehearsal keeps a final page snapshot, not a video.</td></tr>
      <tr><th scope="row">Microphone</th><td>Optional</td><td>Only if you choose to talk an answer. You will be asked first.</td></tr>
      <tr><th scope="row">Webcam</th><td>Off</td><td>Not used in this study.</td></tr>
    </tbody></table>
    <p className="uit-hint">This rehearsal is stored on this computer.</p>
    <span><button className="uit-primary" disabled={!run} onClick={async () => { try { const value = await send({ action: 'consent', id: runId, token }); setRun(value); setStage('scenario') } catch (err) { setError(String(err)) } }}>I consent</button></span>
  </section>
  else if (stage === 'scenario' && run) body = <ScenarioCard level={1} accent={run.accent} scenario={run.scenario} index={run.sequence.index} total={run.sequence.total} busy={busy} onStart={async () => { setBusy(true); try { await send({ action: 'begin' }); location.assign('/') } catch (err) { setError(String(err)); setBusy(false) } }} />
  else if (stage === 'questions') body = <div className="uit-stack">
    <h1 className="uit-sr">A few final questions</h1>
    {run && <RecordingIndicator recording={recording} live={voice.live} accent={run.accent} still />}
    <Questions autoFocus accent={run?.accent} askConfidence={run?.askConfidence} validation={run?.validation} ready={!!run?.verificationReady} busy={busy} onVoiceState={setVoice} onSubmit={async answers => {
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
