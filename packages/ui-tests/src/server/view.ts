import { fillScenario, scenarioTemplate } from '../derive/scenario.ts'
import type { CompiledBrand, CompiledQuestion } from '../schema/compiled.ts'
import { optionOrder, type ScreenerResult } from '../derive/screener.ts'
import type { AttemptRow, AttemptStatus, RunRow } from '../store/types.ts'
import { placeOf } from '../runner/sequence.ts'

/** What the participant's page may know. Built by allowlist in `participantView`; nothing else crosses the boundary. */
export type ParticipantView = {
  run: string
  attempt: string
  author: string
  product: string
  brand: CompiledBrand
  consent: { text: string[]; purposes: string[]; payout: string }
  /** The screens before consent, each with its options in the order this person sees them. */
  screener: { id: string; text: string; options: string[]; multi: boolean }[]
  /** Asked once after consent, before the practice; optional. Absent once answered, and for a rehearsal or an agent. */
  assistive?: { id: string; text: string; options: string[] }
  /** A rehearsal of a study whose screener snapshot is missing or out of date: its screens are drafts, and say so. */
  draft: boolean
  practice: boolean
  /** About how long the whole study takes; the consent screen says so. */
  minutes: number
  /**
   * The first look, a home page tour, until it is answered: the page is toured live on the author's own site, with nothing clickable,
   * for as long as the person likes, then the one open prompt. Present only on the person's first goal.
   */
  impression?: {
    page: string; prompt: string
    /** The person has had their look at the page; what remains is the prompt. */
    looked: boolean
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

/** The key in `attempt.answers` under which the participant asked for more time; the time limit grows by half, once. */
export const MORE_TIME = 'moreTime'

/** The first look's answer as stored: the look, then the words. */
const toured = (attempt: AttemptRow) => attempt.answers.impression as { looked?: unknown; text?: unknown } | undefined

/** The order this person sees each screener question's options in: as stored with their answers, else shuffled for them by their attempt. */
export function screenerOrder(run: RunRow, attempt: AttemptRow): Record<string, string[]> {
  return (attempt.answers.screenerResult as ScreenerResult | undefined)?.order ?? optionOrder(run.compiled.screener, attempt.id)
}

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
    : scenarioTemplate({ are: study.users.are, purpose: study.purposeToYou, goal: goal.name, values })
  const startValue = values.start
  // The study's own questions come once, after the last goal this person does: the declared last, or the last of their own order.
  const sequence = placeOf(study, attempt)
  const last = sequence.position === sequence.of - 1
  const impression = study.impression
  const first = sequence.position === 0
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
    // Only link participants are screened and practise; a rehearsal is the author taking their own study. Each sees their own order.
    screener: !asked ? [] : (() => { const order = screenerOrder(run, attempt); return study.screener.map((q) => ({ id: q.id, text: q.text, options: order[q.id] ?? q.options.map((o) => o.label), multi: q.multi })) })(),
    ...(asked && first && attempt.answers[study.assistive.id] === undefined && { assistive: { id: study.assistive.id, text: study.assistive.text, options: study.assistive.options } }),
    draft: rehearsal && study.draft,
    // The practice comes once, before the first goal.
    practice: study.practice && asked && first,
    minutes: Math.max(1, study.goals.reduce((sum, g) => sum + (g.minutes ?? Math.ceil(g.timeout.seconds / 60)), 0)),
    ...(impression.on && run.actor !== 'agent' && first && typeof toured(attempt)?.text !== 'string' && {
      impression: { page: impression.page ?? goal.start, prompt: impression.prompt, looked: toured(attempt)?.looked === true },
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
  brand: CompiledBrand
  /** The bar is there for the first look: the page is toured with nothing clickable until the person says they have had a look. */
  tour: boolean
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
    tour: Boolean(view.status === 'consented' && view.impression && !view.impression.looked),
    rehearsal: view.rehearsal,
  }
}
