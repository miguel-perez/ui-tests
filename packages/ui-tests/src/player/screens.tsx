import { useState, type CSSProperties, type ReactNode } from 'react'
import type { ParticipantView } from '../server/view.ts'
import { answerKey } from './flow.ts'
import { VoiceAnswer } from './voice.tsx'
import type { Screen } from './flow.ts'
import {
  AGREE, AGREEMENT_ENDS, CARD_FOOTER, CARD_TITLE, CONFIDENCE_ENDS, CONSENT_TITLE, CONTINUE, EASE_ENDS, RECORDING, SCREEN_PROMPT, SCREENER_TITLE,
  PRACTICE_CONFIRM, PRACTICE_DONE, PRACTICE_DONE_NOTE, PRACTICE_INTRO, PRACTICE_NOT_YET, PRACTICE_STUCK, PRACTICE_STUCK_NOTE, PRACTICE_TITLE, PRACTICE_YES,
  DRAFT, FULL_BODY, FULL_TITLE, OPEN_PAGE, START_TASK, SUBMIT, TEXT_LABEL, THANKS_BODY, THANKS_TITLE, TOUR_BODY, TOUR_TITLE, USEFUL_ENDS, WITHDRAW, WITHDRAWN_BODY, WITHDRAWN_TITLE, contact, duration,
} from './copy.ts'

export type ScreenProps = {
  view: ParticipantView
  screen: Screen
  /** Answers given so far, keyed by question id. */
  answers: Record<string, unknown>
  onAnswer: (id: string, value: string | number | string[]) => void
  /** Moves on from this screen; the player sends what the screen collected. */
  onNext: () => void
  /** Consent was given and the person pressed Start task. */
  onStart: () => void
  /** Stops and deletes the recording; offered on every screen after consent. */
  onWithdraw?: () => void
  /** A spoken answer to an open question after the task or to the first look's prompt; `typed` is what was already written. */
  onVoice?: (id: string, blob: Blob, typed?: string) => void
  /** Opens the first look's page on the author's own site, for the tour. */
  onOpenPage?: () => void
  busy?: boolean
  error?: string
}

/** The author's brand sets --pl-accent, --pl-bg, --pl-ink and --pl-font; without them the host's variables, then neutral fallbacks. */
const css = `
.pl{--pl-surface:var(--pl-bg,var(--background,#fff));--pl-fg:var(--pl-ink,var(--foreground,#16181d));--pl-dim:color-mix(in srgb,var(--pl-fg) 68%,var(--pl-surface));--pl-hair:color-mix(in srgb,var(--pl-fg) 18%,var(--pl-surface));
  box-sizing:border-box;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:32px 16px;background:var(--pl-surface);color:var(--pl-fg);font:16px/1.5 var(--pl-font,var(--font-sans,system-ui,sans-serif))}
.pl-brand{width:100%;max-width:34rem;display:flex;align-items:center;gap:10px;margin-bottom:24px;font-weight:600}
.pl-brand img{display:block;max-height:32px;max-width:160px;width:auto;height:auto}
.pl *{box-sizing:border-box}
.pl-card{width:100%;max-width:34rem;display:flex;flex-direction:column;gap:16px}
.pl h1{font-size:1.5rem;line-height:1.25;margin:0;font-weight:600}
.pl p,.pl ul{margin:0}
.pl ul{padding-left:1.25rem;display:flex;flex-direction:column;gap:8px}
.pl-dim{color:var(--pl-dim);font-size:.9375rem}
.pl-scale{display:flex;gap:8px;flex-wrap:wrap}
.pl-scale label,.pl-choice{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid var(--pl-hair);border-radius:8px;cursor:pointer}
.pl-scale label{flex-direction:column;justify-content:center;gap:2px;min-width:44px;padding:6px 10px}
.pl-ends{display:flex;justify-content:space-between;gap:16px;font-size:.875rem;color:var(--pl-dim)}
.pl-choices{display:flex;flex-direction:column;gap:8px}
.pl textarea{width:100%;min-height:7rem;padding:10px 12px;font:inherit;color:inherit;background:transparent;border:1px solid var(--pl-hair);border-radius:8px}
.pl button{align-self:flex-start;min-height:44px;padding:0 20px;font:inherit;font-weight:600;color:var(--pl-surface);background:var(--pl-accent,var(--pl-fg));border:0;border-radius:8px;cursor:pointer}
.pl button:disabled{opacity:.5;cursor:default}
.pl :focus-visible{outline:2px solid var(--pl-accent,var(--pl-fg));outline-offset:2px}
.pl button.pl-withdraw{margin-top:16px;min-height:44px;color:var(--pl-fg);background:transparent;border:1px solid var(--pl-hair)}
.pl-error{color:#b3261e}
.pl-draft{width:100%;max-width:34rem;margin:0 0 16px;padding:8px 12px;border:1px dashed var(--pl-hair);border-radius:8px;font-size:.875rem}
.pl-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px;border:1px solid var(--pl-hair);border-radius:999px}
.pl button.pl-ghost{color:var(--pl-fg);background:transparent;border:1px solid var(--pl-hair)}
.pl-voice{display:flex;flex-direction:column;gap:8px}
.pl-row{display:flex;flex-wrap:wrap;gap:8px}
`

/** Ids and names from question text or ids: no spaces or punctuation, so they can be referenced. */
const slug = (id: string) => id.replace(/[^A-Za-z0-9_-]+/g, '-')

function Frame({ view, children, error, onWithdraw }: { view: ParticipantView; children: ReactNode; error?: string; onWithdraw?: () => void }) {
  const { brand } = view
  const style = Object.fromEntries([['--pl-accent', brand.accent], ['--pl-bg', brand.background], ['--pl-ink', brand.text], ['--pl-font', brand.font?.family]].filter(([, value]) => value)) as CSSProperties
  return (
    <main className="pl" style={style}>
      <style>{css}</style>
      <header className="pl-brand">
        {brand.logo && <img src={brand.logo} alt={brand.name} />}
        <span>{brand.name}</span>
      </header>
      {view.draft && <p className="pl-draft" role="note">{DRAFT}</p>}
      <div className="pl-card">
        {children}
        {error && <p role="alert" className="pl-error">{error}</p>}
        {onWithdraw && <button type="button" className="pl-withdraw" onClick={onWithdraw}>{WITHDRAW}</button>}
      </div>
    </main>
  )
}

function Scale({ id, question, ends, points, value, onAnswer }: { id: string; question: string; ends: { low: string; high: string }; points: number; value: unknown; onAnswer: ScreenProps['onAnswer'] }) {
  const title = `title-${slug(id)}`
  return (
    <>
      <h1 id={title}>{question}</h1>
      <div role="radiogroup" aria-labelledby={title} aria-describedby={`${title}-ends`} className="pl-scale">
        {Array.from({ length: points }, (_, i) => i + 1).map((n) => (
          <label key={n}>
            <input type="radio" name={slug(id)} value={n} checked={value === n} onChange={() => onAnswer(id, n)} />
            <span>{n}</span>
          </label>
        ))}
      </div>
      <div className="pl-ends" id={`${title}-ends`}><span>1, {ends.low}</span><span>{points}, {ends.high}</span></div>
    </>
  )
}

function Choice({ id, question, options, multi, value, onAnswer }: { id: string; question: string; options: string[]; multi: boolean; value: unknown; onAnswer: ScreenProps['onAnswer'] }) {
  const title = `title-${slug(id)}`
  const chosen = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return (
    <>
      <h1 id={title}>{question}</h1>
      <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={title} className="pl-choices">
        {options.map((option) => (
          <label key={option} className="pl-choice">
            <input
              type={multi ? 'checkbox' : 'radio'}
              name={slug(id)}
              value={option}
              checked={chosen.includes(option)}
              onChange={() => onAnswer(id, multi ? (chosen.includes(option) ? chosen.filter((c) => c !== option) : [...chosen, option]) : option)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </>
  )
}

function Open({ id, question, value, onAnswer }: { id: string; question: string; value: unknown; onAnswer: ScreenProps['onAnswer'] }) {
  const title = `title-${slug(id)}`
  return (
    <>
      <h1 id={title}>{question}</h1>
      <textarea aria-labelledby={title} name={slug(id)} placeholder={TEXT_LABEL} value={typeof value === 'string' ? value : ''} onChange={(e) => onAnswer(id, e.target.value)} />
    </>
  )
}

/** The bar the person will meet during the task, with the same two buttons and the same confirmation, that records nothing. */
function PracticeBar() {
  const [state, setState] = useState<'idle' | 'confirm' | 'done' | 'stuck'>('idle')
  return (
    <>
      <div role="group" aria-label="Practice bar" className="pl-bar">
        {state === 'confirm' ? (
          <>
            <span>{PRACTICE_CONFIRM}</span>
            <button type="button" onClick={() => setState('done')}>{PRACTICE_YES}</button>
            <button type="button" className="pl-ghost" onClick={() => setState('idle')}>{PRACTICE_NOT_YET}</button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setState('confirm')}>{PRACTICE_DONE}</button>
            <button type="button" className="pl-ghost" onClick={() => setState('stuck')}>{PRACTICE_STUCK}</button>
          </>
        )}
      </div>
      <p className="pl-dim" role="status">{state === 'done' ? PRACTICE_DONE_NOTE : state === 'stuck' ? PRACTICE_STUCK_NOTE : ''}</p>
    </>
  )
}

const questionOf = (view: ParticipantView, id: string) => view.questions.find((q) => q.id === id)

/** One screen of the player. Pure: the player owns the state and the requests. */
export function PlayerScreen(props: ScreenProps) {
  const { view, screen, answers, onAnswer, onNext, onStart, onWithdraw, busy, error } = props
  const given = (id: string) => answers[id]
  const answered = (id: string) => given(id) !== undefined && given(id) !== '' && !(Array.isArray(given(id)) && (given(id) as unknown[]).length === 0)
  const next = (label: string, enabled = true) => <button type="button" disabled={busy || !enabled} onClick={onNext}>{label}</button>

  const scale = (id: string, ends: { low: string; high: string }) => {
    const q = questionOf(view, id)
    return q ? <><Scale id={id} question={q.text} ends={ends} points={q.points ?? 7} value={given(id)} onAnswer={onAnswer} />{next(SUBMIT, answered(id))}</> : null
  }
  const open = (id: string, required: boolean) => {
    const q = questionOf(view, id)
    return q ? <><Open id={id} question={q.text} value={given(id)} onAnswer={onAnswer} />{props.onVoice && <VoiceAnswer participant={view.run} disabled={busy} onAnswer={(blob) => props.onVoice?.(id, blob, typeof given(id) === 'string' ? (given(id) as string) : undefined)} />}{next(SUBMIT, !required || answered(id))}</> : null
  }

  let body: ReactNode
  switch (screen.kind) {
    case 'consent':
      body = (
        <>
          <h1>{CONSENT_TITLE}</h1>
          <p>{duration(view.minutes)}</p>
          <p>{RECORDING[view.record]}</p>
          <ul aria-label="What you agree to">
            {view.consent.text.map((line) => <li key={line}>{line}</li>)}
            {!view.consent.text.includes(view.consent.payout) && <li>{view.consent.payout}</li>}
          </ul>
          <p className="pl-dim">{contact(view.brand.name)}</p>
          {next(AGREE)}
        </>
      )
      break
    case 'screener': {
      const q = view.screener[screen.index]
      body = q ? (
        <>
          <p className="pl-dim">{SCREENER_TITLE}</p>
          <Choice id={q.id} question={q.text} options={q.options} multi={q.multi} value={given(q.id)} onAnswer={onAnswer} />
          {next(CONTINUE, answered(q.id))}
        </>
      ) : null
      break
    }
    case 'assistive': {
      const q = view.assistive
      body = q ? <><Choice id={q.id} question={q.text} options={q.options} multi value={given(q.id)} onAnswer={onAnswer} />{next(CONTINUE)}</> : null
      break
    }
    case 'practice':
      body = <><h1>{PRACTICE_TITLE}</h1><p>{PRACTICE_INTRO}</p><PracticeBar />{next(CONTINUE)}</>
      break
    case 'impression': {
      const imp = view.impression
      if (!imp) { body = null; break }
      if (screen.phase === 'look') body = <><h1>{TOUR_TITLE}</h1><p>{TOUR_BODY}</p><button type="button" disabled={busy} onClick={props.onOpenPage}>{OPEN_PAGE}</button></>
      else body = (
        <>
          <Open id="impression" question={imp.prompt} value={given('impression')} onAnswer={onAnswer} />
          {props.onVoice && <VoiceAnswer participant={view.run} disabled={busy} onAnswer={(blob) => props.onVoice?.('impression', blob, typeof given('impression') === 'string' ? (given('impression') as string) : undefined)} />}
          {next(CONTINUE)}
        </>
      )
      break
    }
    case 'card':
    case 'step':
      body = (
        <>
          <h1>{CARD_TITLE}</h1>
          <p>{view.goal.scenario}</p>
          <p className="pl-dim">{CARD_FOOTER}</p>
          {view.record === 'video' && <p className="pl-dim">{SCREEN_PROMPT}</p>}
          <button type="button" disabled={busy} onClick={onStart}>{START_TASK}</button>
        </>
      )
      break
    case 'answer':
      body = view.answer ? (
        <>
          <Choice id={answerKey(view)} question={view.answer.question} options={view.answer.choices} multi={false} value={given(answerKey(view))} onAnswer={onAnswer} />
          {next(CONTINUE, answered(answerKey(view)))}
        </>
      ) : null
      break
    case 'ease':
      body = scale(`goal${view.goal.index}.ease`, EASE_ENDS)
      break
    case 'difficulty':
      body = open(`goal${view.goal.index}.difficulty`, false)
      break
    case 'confidence':
      body = scale(`goal${view.goal.index}.confidence`, CONFIDENCE_ENDS)
      break
    case 'uxlite': {
      const id = (['useful', 'easy'] as const)[screen.item]
      body = scale(id, id === 'useful' ? USEFUL_ENDS : AGREEMENT_ENDS)
      break
    }
    case 'comment':
      body = open('anything', false)
      break
    case 'thanks':
      body = <><h1>{THANKS_TITLE}</h1><p>{THANKS_BODY}</p></>
      break
    case 'withdrawn':
      body = <><h1>{WITHDRAWN_TITLE}</h1><p>{WITHDRAWN_BODY}</p></>
      break
    case 'full':
      body = <><h1>{FULL_TITLE}</h1><p>{FULL_BODY}</p></>
      break
  }
  const after = view.status !== 'created' && !['screener', 'consent', 'withdrawn', 'full'].includes(screen.kind)
  return <Frame view={view} error={error} onWithdraw={after ? onWithdraw : undefined}>{body}</Frame>
}
