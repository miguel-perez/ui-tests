import { resultOf } from '../derive/sentence.ts'
import { SCREENED_OUT, type RunHandle, type RunRow, type RunStore } from '../store/types.ts'

/** The run handle of PRD 05: the stored run without the compiled study, hooks, target and other internals. */
export function handleOf(run: RunRow): RunHandle {
  const { run: id, key, context, build, actor, states, result, deadline, revision } = run
  return { run: id, key, context, build, actor, states, result, deadline, revision }
}

/**
 * Brings a run's states and result in line with its attempts and the deadline. Only attempts that are not rehearsals, passed the
 * screener (not flagged screened-out, and they began), were not withdrawn or disconnected, and were verified count toward n. A rehearsal never changes the result.
 */
export async function refreshRun(store: RunStore, runId: string, now: Date = new Date()): Promise<RunRow> {
  for (let tries = 0; tries < 5; tries++) {
    const run = await store.getRun(runId)
    if (!run) throw new Error(`No such run: ${runId}`)
    // Invite slots are made up front as `created`; only an attempt that has consented and moved on means people are collecting.
    const live = (await store.listAttempts(runId)).filter(a => a.reason !== 'withdrew' && !a.flags.includes(SCREENED_OUT) && a.status !== 'created' && a.status !== 'consented')
    const finished = live.filter(a => a.status === 'finished')
    const pending = finished.some(a => a.reason !== 'disconnected' && !a.verification)
    const counted = finished.filter(a => !a.rehearsal && a.reason !== 'disconnected' && a.startedAt !== undefined && a.verification)
    const verification = finished.length && !pending ? 'complete' : 'pending'
    const n = run.compiled.sample.n
    const collection = !live.length ? 'waiting' : run.rehearsal ? (finished.length ? 'complete' : 'collecting') : counted.length >= n ? 'complete' : 'collecting'
    const deadlinePassed = Date.parse(run.deadline) < now.getTime()
    const recruitment = run.rehearsal || run.states.recruitment !== 'open' ? run.states.recruitment : counted.length >= n ? 'filled' : deadlinePassed ? 'stopped' : 'open'
    const result = run.rehearsal ? run.result : resultOf({ n, verified: counted.map(a => a.verification!.status), deadlinePassed })
    if (verification === run.states.verification && collection === run.states.collection && recruitment === run.states.recruitment && result === run.result) return run
    if (await store.updateRun(runId, { states: { ...run.states, recruitment, verification, collection }, result }, run.revision)) return (await store.getRun(runId))!
  }
  throw new Error(`Run ${runId} kept changing; try again`)
}
