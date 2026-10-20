import { fillScenario, scenarioTemplate } from '../derive/scenario.ts'
import type { CompiledQuestion } from '../schema/compiled.ts'
import { FIRST_LOOK_SHOT } from '../runner/screenshot.ts'
import type { AttemptRow, AttemptStatus, RunRow } from '../store/types.ts'
import { placeOf } from '../runner/sequence.ts'

/** What the participant's page may know. Built by allowlist in `participantView`; nothing else crosses the boundary. */
export type ParticipantView = {
  run: string
  attempt: string
  author: string
  product: string
  brand: { accent?: string; poweredBy: boolean }
  consent: { text: string[]; purposes: string[]; payout: string }
  screener: { id: string; text: string; options: string[]; multi: boolean; open?: boolean }[]
  practice: boolean
  /** About how long the whole study takes; the consent screen says so. */
  minutes: number
  /** Present only when the first look is on and a picture of the page was taken: the picture is served by the collector, never fetched from the page itself. */
  impression?: {
    page: string; flashMs: number; question: string
    /** The open question was answered; what remains is the click. */
    asked: boolean
    /** The first click happens on the author's own site: the player opens the start page and the SDK takes the click. */
    click: boolean
  }
  goal: {
    index: number
    name: string
    scenario: string
    start: string
    steps: string[]
    timeoutSeconds: number
  }
  /** Where this goal stands among the goals this person does: `position` from 0, of `of`. The study's own questions follow the last. */
  sequence: { position: number; of: number }
  hasVerification: boolean
  answer?: { question: string; choices: string[] }
  questions: CompiledQuestion[]
  status: AttemptRow['status']
  record: 'events' | 'video'
  rehearsal: boolean
}

/** Whether `page` is on the target's own site, so the SDK can be there to take a first click; any other public URL is only flashed. */
export function isOwnSite(page: string, target: string): boolean {
  try { return new URL(page, target).origin === new URL(target).origin } catch { return false }
}

/** The key in `attempt.answers` under which the participant asked for more time; the time limit grows by half, once. */
export const MORE_TIME = 'moreTime'

/** The first look is over once its first click, or the reason there was none, is stored. */
const firstLookDone = (attempt: AttemptRow) => (attempt.answers.impression as { firstClick?: unknown } | undefined)?.firstClick !== undefined

/** The limit in seconds after any extra time was granted. */
export function effectiveTimeout(base: number, attempt: AttemptRow): number {
  return attempt.answers[MORE_TIME] ? base + Math.ceil(base / 2) : base
}

/**
 * Projects a run and an attempt onto the participant. An explicit allowlist: no path, expected answer, hook,
 * label, rule or `purpose` field is copied, and the scenario is filled with the attempt's own setup values.
 */
export function participantView(run: RunRow, attempt: AttemptRow): ParticipantView {
  const study = run.compiled
  const goal = study.goals[attempt.goalIndex]!
  const values = attempt.setupValues
  const scenario = goal.scenario.pinned
    ? fillScenario(goal.scenario.text, values)
    : scenarioTemplate({ are: study.users.are, purpose: study.purpose, goal: goal.name, values })
  const startValue = values.start
  // The study's own questions come once, after the last goal this person does: the declared last, or the last of their own order.
  const sequence = placeOf(study, attempt)
  const last = sequence.position === sequence.of - 1
  const impression = study.impression
  const rehearsal = attempt.rehearsal || run.rehearsal
  // An agent is not screened and does not practise: it is put through the task, and it consented when its attempt was made.
  const asked = !rehearsal && run.actor !== 'agent'
  return {
    run: run.run,
    attempt: attempt.id,
    author: study.author,
    product: study.product,
    brand: study.brand,
    consent: { text: study.consent.text, purposes: study.consent.purposes, payout: study.consent.payout },
    // Only link participants are screened and practise; a rehearsal is the author taking their own study.
    screener: !asked ? [] : study.screener.map((q) => ({ id: q.id, text: q.text, options: q.options.map((o) => o.label), multi: q.multi, ...(q.open && { open: true }) })),
    // The practice comes once, before the first goal.
    practice: study.practice && asked && sequence.position === 0,
    minutes: Math.max(1, study.goals.reduce((sum, g) => sum + (g.minutes ?? Math.ceil(g.timeout.seconds / 60)), 0)),
    ...(impression.on && attempt.answers[FIRST_LOOK_SHOT] !== undefined && !firstLookDone(attempt) && {
      impression: { page: impression.page ?? goal.start, flashMs: impression.flashMs, question: impression.question, asked: typeof (attempt.answers.impression as { text?: unknown } | undefined)?.text === 'string', click: isOwnSite(impression.page ?? goal.start, run.target) },
    }),
    goal: {
      index: goal.index,
      name: goal.name,
      scenario: scenario,
      start: typeof startValue === 'string' ? startValue : goal.start,
      steps: goal.steps.map((s) => s.name),
      timeoutSeconds: effectiveTimeout(goal.timeout.seconds, attempt),
    },
    sequence,
    hasVerification: goal.hasOutcome || Boolean(goal.answer),
    ...(goal.answer && { answer: { question: goal.answer.question, choices: goal.answer.choices } }),
    questions: last ? [...goal.questions, ...study.questions] : goal.questions,
    status: attempt.status,
    record: study.record,
    rehearsal,
  }
}

/**
 * What the bar on the app's page may know: the page holds only an attempt key, so no consent text, screener, question, answer or start
 * address crosses here. The scenario does, filled as the person read it: the bar shows it again on request.
 */
export type BarView = {
  run: string
  attempt: string
  status: AttemptStatus
  goal: { name: string; scenario: string; steps: string[]; timeoutSeconds: number }
  record: 'events' | 'video'
  brand: ParticipantView['brand']
  /** The bar is there to take the first click on the author's own site: the question was answered and the click is pending. */
  firstClick: boolean
  rehearsal: boolean
}

/** Projects a run and an attempt onto the bar. An allowlist taken from the participant's own view. */
export function barView(run: RunRow, attempt: AttemptRow): BarView {
  const view = participantView(run, attempt)
  return {
    run: view.run,
    attempt: view.attempt,
    status: view.status,
    goal: { name: view.goal.name, scenario: view.goal.scenario, steps: view.goal.steps, timeoutSeconds: view.goal.timeoutSeconds },
    record: view.record,
    brand: view.brand,
    firstClick: Boolean(view.status === 'consented' && view.impression?.asked && view.impression.click),
    rehearsal: view.rehearsal,
  }
}
