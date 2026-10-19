import type { ParticipantView } from '../server/view.ts'

export type Screen =
  | { kind: 'consent' }
  | { kind: 'screener'; index: number }
  | { kind: 'practice' }
  | { kind: 'impression'; phase: 'fixation' | 'flash' | 'question' | 'click' }
  | { kind: 'card' }
  | { kind: 'step'; index: number }
  | { kind: 'answer' }
  | { kind: 'ease' }
  | { kind: 'difficulty' }
  | { kind: 'confidence' }
  | { kind: 'uxlite'; item: 0 | 1 }
  | { kind: 'comment' }
  | { kind: 'thanks' }
  | { kind: 'withdrawn' }

const UXLITE = ['useful', 'easy'] as const

const has = (view: ParticipantView, id: string) => view.questions.some((q) => q.id === id)
const easeId = (view: ParticipantView) => `goal${view.goal.index}.ease`

/** Screens between consent and the card: practice, then the first look, when the view carries them. */
function beforeCard(view: ParticipantView): Screen {
  if (view.practice) return { kind: 'practice' }
  return afterPractice(view)
}
function afterPractice(view: ParticipantView): Screen {
  return view.impression ? { kind: 'impression', phase: 'fixation' } : { kind: 'card' }
}

/** The first screen of the questions that follow the task. */
export function afterTask(view: ParticipantView): Screen {
  return view.answer ? { kind: 'answer' } : { kind: 'ease' }
}

/** After the ease (and its follow-up): confidence only for a task nothing verifies, then the once-per-study questions. */
function afterEase(view: ParticipantView): Screen {
  if (!view.hasVerification && has(view, `goal${view.goal.index}.confidence`)) return { kind: 'confidence' }
  return afterConfidence(view)
}
function afterConfidence(view: ParticipantView): Screen {
  const item = UXLITE.findIndex((id) => has(view, id))
  if (item >= 0) return { kind: 'uxlite', item: item as 0 | 1 }
  return has(view, 'anything') ? { kind: 'comment' } : { kind: 'thanks' }
}

/** Where a visitor lands given where the attempt stands: a reload resumes rather than restarts. */
export function entryScreen(view: ParticipantView): Screen {
  switch (view.status) {
    case 'created':
      return view.screener.length ? { kind: 'screener', index: 0 } : { kind: 'consent' }
    case 'consented':
      return beforeCard(view)
    case 'active':
      return { kind: 'card' }
    case 'questions':
      return afterTask(view)
    default:
      return { kind: 'thanks' }
  }
}

/**
 * The screen after `current`. Link runs go screener, consent, practice, first look, card; the task itself happens in the
 * target; then answer (when the task asks one), ease, difficulty at 4 or below, confidence when nothing verifies the task,
 * the study's own questions, thanks. `answers` is keyed by question id, as the collector stores it.
 */
export function nextScreen(view: ParticipantView, current: Screen, answers: Record<string, unknown>): Screen {
  switch (current.kind) {
    case 'screener':
      return current.index + 1 < view.screener.length ? { kind: 'screener', index: current.index + 1 } : { kind: 'consent' }
    case 'consent':
      return beforeCard(view)
    case 'practice':
      return afterPractice(view)
    case 'impression': {
      // The first click needs a picture of the page to point at; until the first look can show one, the question is the last phase.
      const order = ['fixation', 'flash', 'question'] as const
      const at = order.indexOf(current.phase as (typeof order)[number])
      return at >= 0 && at + 1 < order.length ? { kind: 'impression', phase: order[at + 1]! } : { kind: 'card' }
    }
    case 'card':
    case 'step':
      return afterTask(view)
    case 'answer':
      return { kind: 'ease' }
    case 'ease': {
      const ease = answers[easeId(view)]
      return typeof ease === 'number' && ease <= 4 ? { kind: 'difficulty' } : afterEase(view)
    }
    case 'difficulty':
      return afterEase(view)
    case 'confidence':
      return afterConfidence(view)
    case 'uxlite': {
      const next = UXLITE.findIndex((id, i) => i > current.item && has(view, id))
      if (next >= 0) return { kind: 'uxlite', item: next as 0 | 1 }
      return has(view, 'anything') ? { kind: 'comment' } : { kind: 'thanks' }
    }
    case 'comment':
    case 'thanks':
      return { kind: 'thanks' }
    case 'withdrawn':
      return { kind: 'withdrawn' }
  }
}

/** The answers key for the task's own question; a stable, space-free id for the control. */
export const answerKey = (view: ParticipantView) => `goal${view.goal.index}.answer`

/** The collector message for what a screen collected, or none when the screen collects nothing to send. */
export function messageFor(view: ParticipantView, screen: Screen, answers: Record<string, unknown>): Record<string, unknown> | undefined {
  const goal = `goal${view.goal.index}`
  switch (screen.kind) {
    case 'consent':
      return { action: 'consent' }
    case 'screener':
      return screen.index + 1 < view.screener.length ? undefined : { action: 'answers', screener: Object.fromEntries(view.screener.map((q) => [q.id, answers[q.id]]).filter(([, v]) => v !== undefined)) }
    case 'impression':
      return screen.phase === 'question' ? { action: 'answers', impression: String(answers.impression ?? '') } : undefined
    case 'answer':
      return view.answer ? { action: 'answers', answer: String(answers[answerKey(view)]) } : undefined
    case 'ease':
      return { action: 'answers', ease: answers[`${goal}.ease`] }
    case 'difficulty':
      return { action: 'answers', difficulty: String(answers[`${goal}.difficulty`] ?? '') }
    case 'confidence':
      return { action: 'answers', confidence: answers[`${goal}.confidence`] }
    case 'uxlite': {
      const id = (['useful', 'easy'] as const)[screen.item]
      return { action: 'answers', uxlite: { [id]: answers[id] } }
    }
    case 'comment':
      return { action: 'answers', comment: String(answers.anything ?? '') }
    default:
      return undefined
  }
}
