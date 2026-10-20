import { refreshRun, type ResultHook } from '../runner/progress.ts'
import { openStore } from '../store/open.ts'
import { applyRetention } from '../store/retention.ts'
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
  if (!id) { io.stderr.write('Usage: ui-tests verify <run> [--json]\n'); return 2 }
  const store = await openStore(io.env)
  try {
    if (!(await store.getRun(id))) { io.stderr.write(`No such run: ${id}\n`); return 2 }
    const bypass = io.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined
    const { verified, disconnected } = await verifyRun(store, id, bypass ? { bypass } : {})
    await settleRun(store, id, reporterFor(io))
    // Verification has read the snapshots; what is past retention goes now.
    await applyRetention(store, io.deps?.now?.() ?? new Date())
    const verdicts = (await store.listAttempts(id)).map(attempt => ({
      id: attempt.id,
      verdict: attempt.reason === 'disconnected' || attempt.reason === 'withdrew' ? attempt.reason : attempt.verification?.status ?? 'not verified',
      ...(attempt.verification?.reason && { reason: attempt.verification.reason }),
    }))
    if (args.flags.has('json')) { io.stdout.write(`${JSON.stringify({ run: id, verified, disconnected, attempts: verdicts }, null, 2)}\n`); return 0 }
    io.stdout.write(`Verified ${verified} ${verified === 1 ? 'attempt' : 'attempts'}${disconnected ? `; ${disconnected} disconnected` : ''}.\n`)
    for (const v of verdicts) io.stdout.write(`${v.id}: ${v.verdict}${v.reason ? ` (${v.reason})` : ''}\n`)
    return 0
  } finally { await store.close() }
}
