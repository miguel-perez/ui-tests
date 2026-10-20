import { resultOf } from '../derive/sentence.ts'
import { openStore } from '../store/open.ts'
import type { RunStore } from '../store/types.ts'
import { verifyRun } from '../verify.ts'
import type { Command } from './main.ts'

/** Brings a run's states in line with its attempts after verification; a rehearsal never changes the result. */
export async function settleRun(store: RunStore, runId: string): Promise<void> {
  const run = await store.getRun(runId)
  if (!run) return
  const live = (await store.listAttempts(runId)).filter(a => a.reason !== 'withdrew')
  const finished = live.filter(a => a.status === 'finished')
  const pending = finished.some(a => a.reason !== 'disconnected' && !a.verification)
  const counted = finished.filter(a => !a.rehearsal && a.reason !== 'disconnected' && a.verification)
  const verification = finished.length && !pending ? 'complete' : 'pending'
  const collection = !live.length ? 'waiting' : run.rehearsal ? (finished.length ? 'complete' : 'collecting') : counted.length >= run.compiled.sample.n ? 'complete' : 'collecting'
  const result = run.rehearsal ? run.result : resultOf({ n: run.compiled.sample.n, verified: counted.map(a => a.verification!.status), deadlinePassed: Date.parse(run.deadline) < Date.now() })
  if (verification === run.states.verification && collection === run.states.collection && result === run.result) return
  await store.updateRun(runId, { states: { ...run.states, verification, collection }, result }, run.revision)
}

/** `ui-tests verify <run>`: runs the hooks against the stored snapshots and prints each attempt's verdict. */
export const verify: Command = async (args, io) => {
  const [id] = args.positionals
  if (!id) { io.stderr.write('Usage: ui-tests verify <run>\n'); return 2 }
  const store = await openStore(io.env)
  try {
    if (!(await store.getRun(id))) { io.stderr.write(`No such run: ${id}\n`); return 2 }
    const { verified, disconnected } = await verifyRun(store, id)
    await settleRun(store, id)
    io.stdout.write(`Verified ${verified} ${verified === 1 ? 'attempt' : 'attempts'}${disconnected ? `; ${disconnected} disconnected` : ''}.\n`)
    for (const attempt of await store.listAttempts(id)) {
      const verdict = attempt.reason === 'disconnected' || attempt.reason === 'withdrew' ? attempt.reason : attempt.verification?.status ?? 'not verified'
      io.stdout.write(`${attempt.id}: ${verdict}${attempt.verification?.reason ? ` (${attempt.verification.reason})` : ''}\n`)
    }
    return 0
  } finally { await store.close() }
}
