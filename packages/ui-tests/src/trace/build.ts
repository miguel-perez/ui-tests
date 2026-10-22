import type { ScreenerResult } from '../derive/screener.ts'
import type { TourCode } from '../derive/code-impression.ts'
import { fillScenario } from '../derive/scenario.ts'
import { sentence } from '../derive/sentence.ts'
import { groupFigures, resultComplete, resultFigures } from '../runner/progress.ts'
import { primaryGoalIndex } from '../runner/sequence.ts'
import { videoSegments, type VideoSegments } from '../video.ts'
import { highlightReel, type ReelMoment } from './reel.ts'
import type { LintFinding } from '../lint.ts'
import type { CompiledStudy } from '../schema/compiled.ts'
import { attemptSignals, type Signal } from '../signals.ts'
import { inForce, numbered, type NumberedRevision, type Revision } from '../revisions.ts'
import type { AttemptRow, RecordedEvent, RunRow, RunStore, Verification } from '../store/types.ts'

/**
 * What a person made of the start page on the first look: their words, and each part coded against what the page says (what it is, who
 * it is from, an action, its purpose) by the model or the author; `parts` is null and `uncoded` says why when nobody has coded it yet.
 */
export type ImpressionResult = { text: string; parts: TourCode | null; codedBy?: 'model' | 'author'; uncoded?: string }

/** The first click of a task, on its own start page: the element, the address it led to, whether that is on the task's path (null: the task has no path), and when. */
export type FirstClick = { target: string; url: string; onPath: boolean | null; at: number }

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
  /** What the screener made of this person: their group, each criterion's value and whether it was met, and the option order they saw. Absent when none was asked. */
  screener?: ScreenerResult
  /** What the person made of the start page on the first look, and how it was coded. Absent when the first look was off or unanswered. */
  impression?: ImpressionResult
  /** The task's first click, on its own start page. Absent when nobody clicked. */
  firstClick?: FirstClick
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
  return stored && typeof stored === 'object' && 'criteria' in stored ? stored : undefined
}

/** The first look's answer as the collector stored it, with the author's own coding in place of the model's. */
function impressionOf(attempt: AttemptRow, recoded: Map<string, TourCode>): ImpressionResult | undefined {
  const stored = attempt.answers.impression as (ImpressionResult & { looked?: boolean }) | undefined
  if (!stored || typeof stored !== 'object' || typeof stored.text !== 'string') return undefined
  const parts = recoded.get(attempt.id)
  const { text, uncoded, codedBy } = stored
  if (parts) return { text, parts, codedBy: 'author' }
  return { text, parts: stored.parts ?? null, ...(codedBy && { codedBy }), ...(uncoded && !stored.parts && { uncoded }) }
}

const pathOf = (url: string) => new URL(url, 'http://placeholder').pathname.replace(/(.)\/$/, '$1')

/**
 * The task's first click on its own start page, and whether the address it led to is on the task's path: the page the next address
 * event names, else the page it was made on. Null when the task has no path; a click that stays on the start of a path that goes on
 * has not moved along it.
 */
export function firstClickOf(events: RecordedEvent[], path: string[] | undefined, start: string): FirstClick | undefined {
  const index = events.findIndex(e => e.type === 'click')
  const click = events[index]
  if (!click) return undefined
  // Only an address before the next click is this click's: a later one was led to by another click.
  const after = events.slice(index + 1)
  const next = after.findIndex(e => e.type === 'click')
  const led = (next < 0 ? after : after.slice(0, next)).find(e => e.type === 'url')?.url ?? click.url
  let onPath: boolean | null = null
  if (path) {
    const there = pathOf(led)
    onPath = path.length > 1 && there === pathOf(start) ? false : path.some(p => pathOf(p) === there)
  }
  return { target: click.target ?? '', url: led, onPath, at: click.at }
}

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
  const recoded = new Map<string, TourCode>()
  for (const { revision } of inEffect) if (revision.kind === 'code-impression') recoded.set(revision.attempt, revision.parts)
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
    const firstClick = goal ? firstClickOf(events, goal.path, typeof attempt.setupValues.start === 'string' ? attempt.setupValues.start : goal.start) : undefined
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
      ...(firstClick && { firstClick }),
      signals,
      reel: highlightReel({ events: everything, signals, words: [] }),
      timings: { ...(started !== undefined && ended !== undefined && { onGoalMs: ended - started }) },
    })
  }
  // The same figures as the check title: the primary goal's attempts counted in the result, by the one counting rule.
  const primary = compiled.goals[primaryGoalIndex(compiled)]
  const figures = resultFigures(rows, primaryGoalIndex(compiled), resultComplete(run))
  // A study of several groups says its result per group, of each group's own people and quota.
  const groups = groupFigures(rows, compiled.groups ?? [], primaryGoalIndex(compiled), resultComplete(run))
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
    sentence: sentence({ n: compiled.sample.n, affecting: compiled.sample.affecting, shape: primary?.shape ?? 'goal-only', ...figures, result: run.result, rehearsal: run.rehearsal, goal: (primary?.name ?? '').toLowerCase(), ...(groups && { groups }) }),
    sampleSentence: compiled.sample.sentence,
    actor: run.actor,
  }
}
