import { fillScenario } from '../derive/scenario.ts'
import { sampleSentence, sentence } from '../derive/sentence.ts'
import type { LintFinding } from '../lint.ts'
import type { CompiledStudy } from '../schema/compiled.ts'
import { attemptSignals, type Signal } from '../signals.ts'
import { SCREENED_OUT, type AttemptRow, type RecordedEvent, type Revision, type RunRow, type RunStore, type Verification } from '../store/types.ts'

export type TraceAttempt = {
  attempt: AttemptRow
  events: RecordedEvent[]
  /** The pages the participant went through, in order. */
  path: string[]
  /** The path the author expected, when the task has one. */
  happyPath?: string[]
  /** Where the participant ended, from the stored end snapshot. */
  snapshotUrl?: string
  verification?: Verification
  signals: Signal[]
  timings: { onGoalMs?: number }
}

export type Trace = {
  run: RunRow
  compiled: CompiledStudy
  derivations: CompiledStudy['derivations']
  scenario: { shown: string; edits: Revision[] }
  attempts: TraceAttempt[]
  lint: LintFinding[]
  sentence: string
  sampleSentence: string
  actor: 'human' | 'agent'
}

const pathOf = (url: string) => new URL(url, 'http://placeholder').pathname.replace(/(.)\/$/, '$1')

function visited(events: RecordedEvent[]): string[] {
  const pages: string[] = []
  for (const event of events) {
    if (event.type !== 'url') continue
    const page = pathOf(event.url)
    if (page !== pages.at(-1)) pages.push(page)
  }
  return pages
}

/** Everything the trace shows for one run, read from the store: nothing here comes from the participant's browser. */
export async function buildTrace(store: RunStore, runId: string, lint: LintFinding[] = []): Promise<Trace> {
  const run = await store.getRun(runId)
  if (!run) throw new Error(`No run ${runId}`)
  const { compiled } = run
  // People the screener turned away took no task; the report counts them as screened, not as attempts.
  const rows = (await store.listAttempts(runId)).filter(a => !a.flags.includes(SCREENED_OUT))
  const attempts: TraceAttempt[] = []
  for (const attempt of rows) {
    const goal = compiled.goals[attempt.goalIndex]
    // In the order they happened: an event sent on its own as a page unloads can reach the store before ones kept for a later flush.
    const events = (await store.listEvents(attempt.id)).sort((x, y) => x.at - y.at)
    const verification = attempt.verification
    const end = await store.getSnapshot(attempt.id, 'end')
    const started = attempt.startedAt ? Date.parse(attempt.startedAt) : undefined
    const ended = attempt.endedAt ? Date.parse(attempt.endedAt) : undefined
    attempts.push({
      attempt,
      events,
      path: visited(events),
      ...(goal?.path && { happyPath: goal.path }),
      ...(end && { snapshotUrl: end.url }),
      ...(verification && { verification }),
      signals: goal ? attemptSignals({ attempt, events, goal, ...(verification && { verification }) }) : [],
      timings: { ...(started !== undefined && ended !== undefined && { onGoalMs: ended - started }) },
    })
  }
  const counted = attempts.filter(a => !a.attempt.rehearsal)
  const f = counted.filter(a => a.verification?.status === 'incorrect').length
  const x = counted.filter(a => a.verification?.status === 'correct').length
  const first = compiled.goals[0]
  const firstAttempt = rows.find(a => a.goalIndex === 0)
  const edits = await store.listRevisions(runId)
  return {
    run,
    compiled,
    derivations: compiled.derivations,
    scenario: { shown: first ? fillScenario(first.scenario.text, firstAttempt?.setupValues ?? {}) : '', edits },
    attempts,
    lint,
    sentence: sentence({ n: compiled.sample.n, affecting: compiled.sample.affecting, shape: first?.shape ?? 'goal-only', f, x, result: run.result, rehearsal: run.rehearsal, goal: (first?.name ?? '').toLowerCase() }),
    sampleSentence: sampleSentence(compiled.sample.n, compiled.sample.affecting),
    actor: run.actor,
  }
}
