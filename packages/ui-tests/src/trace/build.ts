import type { ScreenerResult } from '../derive/screener.ts'
import { fillScenario } from '../derive/scenario.ts'
import { sampleSentence, sentence } from '../derive/sentence.ts'
import { FIRST_LOOK_SKIPPED } from '../runner/screenshot.ts'
import { resultComplete, resultFigures } from '../runner/progress.ts'
import { primaryGoalIndex } from '../runner/sequence.ts'
import { videoSegments, type VideoSegments } from '../video.ts'
import { highlightReel, type ReelMoment } from './reel.ts'
import type { LintFinding } from '../lint.ts'
import type { CompiledStudy } from '../schema/compiled.ts'
import { attemptSignals, type Signal } from '../signals.ts'
import { inForce, numbered, type NumberedRevision, type Revision } from '../revisions.ts'
import type { AttemptRow, RecordedEvent, RunRow, RunStore, Verification } from '../store/types.ts'

export type ImpressionResult = {
  text: string
  code: 'named the purpose' | 'did not name it' | 'no answer'
  codedBy: 'rule' | 'model' | 'author'
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
  /** The screen video, one entry for each time the person shared their screen. Absent when none was kept. */
  video?: VideoSegments
  /** The replay stopped early because a page was too large to record. */
  replayTruncated?: boolean
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
  /** `edits`: the scenario wording the author has revised, in force, with who made each. */
  scenario: { shown: string; edits: (Extract<Revision, { kind: 'scenario' }> & { number: number })[] }
  /** Every revision of the run, numbered, with the ones taken back marked. */
  revisions: NumberedRevision[]
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
function impressionOf(attempt: AttemptRow, recoded: Map<string, ImpressionResult['code']>): ImpressionResult | undefined {
  const stored = attempt.answers.impression as ImpressionResult | undefined
  if (!stored || typeof stored !== 'object' || typeof stored.code !== 'string') return undefined
  const code = recoded.get(attempt.id)
  return code ? { ...stored, code, codedBy: 'author' } : stored
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
  const revisions = await store.listRevisions(runId)
  const inEffect = inForce(revisions)
  const recoded = new Map<string, ImpressionResult['code']>()
  for (const { revision } of inEffect) if (revision.kind === 'code-impression') recoded.set(revision.attempt, revision.code)
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
      ...(videoSegments(attempt.answers).length > 0 && { video: videoSegments(attempt.answers) }),
      ...(attempt.answers['replay-truncated'] === true && { replayTruncated: true }),
      path: visited(events),
      ...(goal?.path && { happyPath: goal.path }),
      ...(end && { snapshotUrl: end.url }),
      ...(verification && { verification }),
      ...(screenerOf(attempt) && { screener: screenerOf(attempt)! }),
      ...(impressionOf(attempt, recoded) && { impression: impressionOf(attempt, recoded)! }),
      ...(typeof attempt.answers[FIRST_LOOK_SKIPPED] === 'string' && { firstLookSkipped: attempt.answers[FIRST_LOOK_SKIPPED] as string }),
      signals,
      reel: highlightReel({ events: everything, signals, words: [] }),
      timings: { ...(started !== undefined && ended !== undefined && { onGoalMs: ended - started }) },
    })
  }
  // The same figures as the check title: the primary goal's attempts counted in the result, by the one counting rule.
  const primary = compiled.goals[primaryGoalIndex(compiled)]
  const figures = resultFigures(rows, primaryGoalIndex(compiled), resultComplete(run))
  const first = compiled.goals[0]
  const firstAttempt = rows.find(a => a.goalIndex === 0)
  return {
    run,
    compiled,
    derivations: compiled.derivations,
    scenario: {
      shown: first ? fillScenario(first.scenario.text, firstAttempt?.setupValues ?? {}) : '',
      edits: inEffect.flatMap(({ number, revision }) => (revision.kind === 'scenario' ? [{ ...revision, number }] : [])),
    },
    revisions: numbered(revisions),
    attempts,
    lint,
    sentence: sentence({ n: compiled.sample.n, affecting: compiled.sample.affecting, shape: primary?.shape ?? 'goal-only', ...figures, result: run.result, rehearsal: run.rehearsal, goal: (primary?.name ?? '').toLowerCase() }),
    sampleSentence: sampleSentence(compiled.sample.n, compiled.sample.affecting),
    actor: run.actor,
  }
}
