import { refreshRun, type ResultHook } from '../runner/progress.ts'
import { openStore } from '../store/open.ts'
import type { RunStore } from '../store/types.ts'
import { verifyRun } from '../verify.ts'
import type { Command } from './main.ts'
import { reporterFor } from './outward.ts'

/** Brings a run's states in line with its attempts after verification; a rehearsal never changes the result. */
export async function settleRun(store: RunStore, runId: string, onResult?: ResultHook): Promise<void> {
  if (await store.getRun(runId)) await refreshRun(store, runId, new Date(), onResult ? { onResult } : {})
}

/** `ui-tests verify <run>`: runs the hooks against the stored snapshots and prints each attempt's verdict. */
export const verify: Command = async (args, io) => {
  const [id] = args.positionals
  if (!id) { io.stderr.write('Usage: ui-tests verify <run>\n'); return 2 }
  const store = await openStore(io.env)
  try {
    if (!(await store.getRun(id))) { io.stderr.write(`No such run: ${id}\n`); return 2 }
    const { verified, disconnected } = await verifyRun(store, id)
    await settleRun(store, id, reporterFor(io))
    io.stdout.write(`Verified ${verified} ${verified === 1 ? 'attempt' : 'attempts'}${disconnected ? `; ${disconnected} disconnected` : ''}.\n`)
    for (const attempt of await store.listAttempts(id)) {
      const verdict = attempt.reason === 'disconnected' || attempt.reason === 'withdrew' ? attempt.reason : attempt.verification?.status ?? 'not verified'
      io.stdout.write(`${attempt.id}: ${verdict}${attempt.verification?.reason ? ` (${attempt.verification.reason})` : ''}\n`)
    }
    return 0
  } finally { await store.close() }
}
