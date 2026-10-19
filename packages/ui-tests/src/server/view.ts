import { fillScenario, scenarioTemplate } from '../derive/scenario.ts'
import type { CompiledQuestion } from '../schema/compiled.ts'
import type { AttemptRow, RunRow } from '../store/types.ts'

/** What the participant's page may know. Built by allowlist in `participantView`; nothing else crosses the boundary. */
export type ParticipantView = {
  run: string
  attempt: string
  author: string
  product: string
  brand: { accent?: string; poweredBy: boolean }
  consent: { text: string[]; purposes: string[]; payout: string }
  screener: { id: string; text: string; options: string[]; multi: boolean }[]
  practice: boolean
  impression?: { page: string; flashMs: number; question: string }
  goal: {
    index: number
    name: string
    scenario: string
    start: string
    steps: string[]
    timeoutSeconds: number
  }
  hasVerification: boolean
  answer?: { question: string; choices: string[] }
  questions: CompiledQuestion[]
  status: AttemptRow['status']
  record: 'events' | 'video'
  rehearsal: boolean
}

/** The key in `attempt.answers` under which the participant asked for more time; the time limit grows by half, once. */
export const MORE_TIME = 'moreTime'

/** The limit in seconds after any extra time was granted. */
export function effectiveTimeout(base: number, attempt: AttemptRow): number {
  return attempt.answers[MORE_TIME] ? base + Math.ceil(base / 2) : base
}

/** Keeps the product's own name off participant surfaces: the tool is only named when branding says so. */
const neutral = (text: string) => text.replace(/ui-tests/gi, 'this tool')

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
  const last = attempt.goalIndex === study.goals.length - 1
  const impression = study.impression
  return {
    run: run.run,
    attempt: attempt.id,
    author: neutral(study.author),
    product: study.product,
    brand: { poweredBy: false },
    consent: { text: study.consent.text, purposes: study.consent.purposes, payout: study.consent.payout },
    screener: study.screener.map((q) => ({ id: q.id, text: q.text, options: q.choices ?? [], multi: false })),
    practice: false,
    ...(impression.on && { impression: { page: impression.page ?? goal.start, flashMs: impression.flashMs, question: impression.question } }),
    goal: {
      index: goal.index,
      name: neutral(goal.name),
      scenario: neutral(scenario),
      start: typeof startValue === 'string' ? startValue : goal.start,
      steps: goal.steps.map((s) => neutral(s.name)),
      timeoutSeconds: effectiveTimeout(goal.timeout.seconds, attempt),
    },
    hasVerification: goal.hasOutcome || Boolean(goal.answer),
    ...(goal.answer && { answer: { question: goal.answer.question, choices: goal.answer.choices } }),
    questions: last ? [...goal.questions, ...study.questions] : goal.questions,
    status: attempt.status,
    record: study.record,
    rehearsal: attempt.rehearsal || run.rehearsal,
  }
}
