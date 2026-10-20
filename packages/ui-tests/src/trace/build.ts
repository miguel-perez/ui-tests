import type { ScreenerResult } from '../derive/screener.ts'
import { fillScenario } from '../derive/scenario.ts'
import { sampleSentence, sentence } from '../derive/sentence.ts'
import { FIRST_LOOK_SKIPPED } from '../runner/screenshot.ts'
import { highlightReel, type ReelMoment } from './reel.ts'
import type { LintFinding } from '../lint.ts'
import type { CompiledStudy } from '../schema/compiled.ts'
import { attemptSignals, type Signal } from '../signals.ts'
import type { AttemptRow, RecordedEvent, Revision, RunRow, RunStore, Verification } from '../store/types.ts'

export type ImpressionResult = {
  text: string
  code: 'named the purpose' | 'did not name it' | 'no answer'
  codedBy: 'rule' | 'model'
  /** The first real click: the element, the address it led to, whether that is on the task's path (null: the task has no path), and when. Null when no click was asked, with the reason beside it. */
  firstClick?: { target: string; url: string; onPath: boolean | null; at: number } | null
  firstClickReason?: string
}

export type TraceAttempt = {
  attempt: AttemptRow
  /** What the person did, without the replay's own events. */
  events: RecordedEvent[]
  /** The recording of the page (rrweb events), in the order they happened. Absent when none was kept. */
  replay?: RecordedEvent[]
  /** The parts of the recording worth watching: a window around each signal, with the words said inside it. */
  reel: ReelMoment[]
  /** The pages the participant went through, in order. */
  path: string[]
  /** The path the author expected, when the task has one. */
  happyPath?: string[]
  /** Where the participant ended, from the stored end snapshot. */
  snapshotUrl?: string
  verification?: Verification
  signals: Signal[]
  /** What the screener made of this person: whether they match the users, which rules they fell outside, and how well they fit the purpose. Absent when none was asked. */
  screener?: ScreenerResult
  /** What the person said the page was for, how that was coded, and where they first clicked. Absent when the first look was off or unanswered. */
  impression?: ImpressionResult
  /** Why the first look was not asked of this person (its picture could not be taken). Absent when it was asked, or is off. */
  firstLookSkipped?: string
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

/** The screener's reading of a person, as the collector stored it with their answers. */
function screenerOf(attempt: AttemptRow): ScreenerResult | undefined {
  const stored = attempt.answers.screenerResult as ScreenerResult | undefined
  return stored && typeof stored.matches === 'boolean' ? stored : undefined
}

/** The first look's answer as the collector stored it with its code. */
function impressionOf(attempt: AttemptRow): ImpressionResult | undefined {
  const stored = attempt.answers.impression as ImpressionResult | undefined
  return stored && typeof stored === 'object' && typeof stored.code === 'string' ? stored : undefined
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
  const rows = await store.listAttempts(runId)
  const attempts: TraceAttempt[] = []
  for (const attempt of rows) {
    const goal = compiled.goals[attempt.goalIndex]
    // In the order they happened: an event sent on its own as a page unloads can reach the store before ones kept for a later flush.
    const everything = (await store.listEvents(attempt.id)).sort((x, y) => x.at - y.at)
    const events = everything.filter((event) => event.type !== 'rrweb')
    const replay = everything.filter((event) => event.type === 'rrweb')
    const verification = attempt.verification
    const end = await store.getSnapshot(attempt.id, 'end')
    const started = attempt.startedAt ? Date.parse(attempt.startedAt) : undefined
    const ended = attempt.endedAt ? Date.parse(attempt.endedAt) : undefined
    const signals = goal ? attemptSignals({ attempt, events, goal, ...(verification && { verification }) }) : []
    attempts.push({
      attempt,
      events,
      ...(replay.length > 0 && { replay }),
      path: visited(events),
      ...(goal?.path && { happyPath: goal.path }),
      ...(end && { snapshotUrl: end.url }),
      ...(verification && { verification }),
      ...(screenerOf(attempt) && { screener: screenerOf(attempt)! }),
      ...(impressionOf(attempt) && { impression: impressionOf(attempt)! }),
      ...(typeof attempt.answers[FIRST_LOOK_SKIPPED] === 'string' && { firstLookSkipped: attempt.answers[FIRST_LOOK_SKIPPED] as string }),
      signals,
      reel: highlightReel({ events: everything, signals, words: [] }),
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
