import { resultOf } from '../derive/sentence.ts'
import type { AttemptRow, RunHandle, RunRow, RunStore } from '../store/types.ts'
import { primaryGoalIndex } from './sequence.ts'

/** The run handle of PRD 05: the stored run without the compiled study, hooks, target and other internals. */
export function handleOf(run: RunRow): RunHandle {
  const { run: id, key, context, build, actor, states, result, deadline, revision } = run
  return { run: id, key, context, build, actor, states, result, deadline, revision }
}

/** What the counting rules read of an attempt: an attempt row, or the record's copy of one (`startedAt` from its timings). */
export type Countable = Pick<AttemptRow, 'rehearsal' | 'status' | 'flags'> & { reason?: AttemptRow['reason'] | null; startedAt?: string | undefined; verification?: unknown }

/** Whether an attempt counts toward n: real, finished, started, verified, and neither withdrawn, disconnected, retired nor excluded by the author. One predicate for the run's states and the run record. */
export function countsTowardN(a: Countable): boolean {
  return !a.rehearsal && a.status === 'finished' && a.reason !== 'withdrew' && a.reason !== 'disconnected' && !a.flags.includes('retired') && !a.flags.includes('excluded') && a.startedAt !== undefined && a.verification != null
}

/** Whether a run's result is complete: n people were counted, so a later withdrawal does not change it (PRD 03). */
export const resultComplete = (run: { rehearsal?: boolean; states: { collection: string }; result: string }): boolean =>
  !run.rehearsal && run.states.collection === 'complete' && run.result !== 'pending'

/** A withdrawn person who had been verified keeps their place in n on a completed run: their recordings and words are gone, their verdict is not. */
export const holdsPlaceInN = (a: Countable): boolean =>
  a.reason === 'withdrew' && !a.rehearsal && a.startedAt !== undefined && a.verification != null && !a.flags.includes('retired') && !a.flags.includes('excluded')

/** The one rule for who is in n and in the result: who counts toward n, and on a completed run the withdrawn who held their place. */
export const countedInResult = (a: Countable, complete: boolean): boolean => countsTowardN(a) || (complete && holdsPlaceInN(a))

/** What a result says, from one rule: the primary goal's attempts counted in the result, how many reached the outcome, failed it, or could not be read. */
export type ResultFigures = { attempted: number; reached: number; failed: number; unknown: number }

/**
 * The figures of a run's result, read by the check title and by the result sentence alike, so the two never disagree: only the
 * primary goal's attempts (its result is the study's; other goals are reported beside it), and only those `countedInResult`.
 */
export function resultFigures(attempts: (Countable & { goalIndex: number; verification?: { status: string } | null })[], primary: number, complete: boolean): ResultFigures {
  const counted = attempts.filter(a => a.goalIndex === primary && countedInResult(a, complete))
  const with_ = (status: string) => counted.filter(a => a.verification?.status === status).length
  return { attempted: counted.length, reached: with_('correct'), failed: with_('incorrect'), unknown: with_('unknown') }
}

/**
 * Brings a run's states and result in line with its attempts and the deadline. Only attempts that are not rehearsals, passed the
 * link screener (which asks and filters nobody; they began), were not withdrawn or disconnected, and were verified count toward n. A rehearsal never changes the result.
 */
async function settle(store: RunStore, runId: string, now: Date): Promise<RunRow> {
  for (let tries = 0; tries < 5; tries++) {
    const run = await store.getRun(runId)
    if (!run) throw new Error(`No such run: ${runId}`)
    // An agent run's result is read from its trials by `agentResult` (pass^k), never from people's counting rules.
    if (run.actor === 'agent') return run
    // Invite slots are made up front as `created`; only an attempt that has consented and moved on means people are collecting.
    const all = await store.listAttempts(runId)
    // Every person attempts every goal; n and the result are the primary goal's (PRD 02), so only its attempts are counted.
    const primary = primaryGoalIndex(run.compiled)
    const live = all.filter(a => a.reason !== 'withdrew' && a.status !== 'created' && a.status !== 'consented')
    const finished = live.filter(a => a.status === 'finished')
    const pending = finished.some(a => a.reason !== 'disconnected' && !a.verification)
    const counted = finished.filter(a => a.goalIndex === primary && countsTowardN(a))
    // A withdrawal after the result is complete removes recordings and marks the attempt; it does not change n or the result (PRD 03).
    const heldForN = resultComplete(run) ? all.filter(a => a.goalIndex === primary && holdsPlaceInN(a)) : []
    const inN = [...counted, ...heldForN]
    const verification = finished.length && !pending ? 'complete' : 'pending'
    const n = run.compiled.sample.n
    const collection = !live.length ? 'waiting' : run.rehearsal ? (finished.length ? 'complete' : 'collecting') : inN.length >= n ? 'complete' : 'collecting'
    const deadlinePassed = Date.parse(run.deadline) < now.getTime()
    const recruitment = run.rehearsal || run.states.recruitment !== 'open' ? run.states.recruitment : inN.length >= n ? 'filled' : deadlinePassed ? 'stopped' : 'open'
    const result = run.rehearsal ? run.result : resultOf({ n, verified: inN.map(a => a.verification!.status), deadlinePassed })
    if (verification === run.states.verification && collection === run.states.collection && recruitment === run.states.recruitment && result === run.result) return run
    if (await store.updateRun(runId, { states: { ...run.states, recruitment, verification, collection }, result }, run.revision)) return (await store.getRun(runId))!
  }
  throw new Error(`Run ${runId} kept changing; try again`)
}

/** Called when a run has left `pending`; it tells the check, the comment and the webhook. It must be safe to call again for the same result. */
export type ResultHook = (run: RunRow, store: RunStore) => Promise<void>

/** Settles the run as above and, once its result is out of `pending`, calls `onResult` (a rehearsal never does). */
export async function refreshRun(store: RunStore, runId: string, now: Date = new Date(), options: { onResult?: ResultHook } = {}): Promise<RunRow> {
  const run = await settle(store, runId, now)
  if (!options.onResult || run.result === 'pending' || run.rehearsal) return run
  await options.onResult(run, store)
  return (await store.getRun(runId)) ?? run
}
