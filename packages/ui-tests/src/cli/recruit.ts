import { loadConfig } from '../config.ts'
import { formatFindings, lint, planLines } from '../lint.ts'
import { StudyLoadError } from '../load.ts'
import { createInvites } from '../runner/invites.ts'
import { createRun } from '../runner/create-run.ts'
import { gitCommit, idempotencyKey } from '../runner/key.ts'
import { handleOf, refreshRun } from '../runner/progress.ts'
import { checkReachable } from '../runner/setup.ts'
import { openStore } from '../store/open.ts'
import type { RunHandle, RunStore } from '../store/types.ts'
import type { UiTestsConfig } from '../types.ts'
import { verifyRun } from '../verify.ts'
import { loadStudies, withProduct } from './lint.ts'
import type { Command, Io } from './main.ts'

const DEFAULT_POLL_MS = 30_000

/** The exit code for a result: 0 none found, 1 problems found, 3 pending or inconclusive. */
export const exitCodeFor = (result: RunHandle['result']) => result === 'none-found' ? 0 : result === 'problems-found' ? 1 : 3

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>(resolve => {
  if (signal?.aborted) return resolve()
  const onAbort = () => { clearTimeout(timer); resolve() }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
  signal?.addEventListener('abort', onAbort, { once: true })
})

/** Polls the run, verifying and refreshing it, until it has a result. Exits with the result's code, or 3 when stopped first. */
async function waitForResult(store: RunStore, runId: string, io: Io): Promise<{ handle: RunHandle; code: number }> {
  const deps = io.deps ?? {}
  const now = deps.now ?? (() => new Date())
  for (;;) {
    await verifyRun(store, runId)
    const run = await refreshRun(store, runId, now())
    if (run.result !== 'pending') return { handle: handleOf(run), code: exitCodeFor(run.result) }
    if (deps.signal?.aborted) return { handle: handleOf(run), code: 3 }
    io.stderr.write(`waiting: ${run.states.collection}, result pending\n`)
    await pause(deps.pollMs ?? DEFAULT_POLL_MS, deps.signal)
  }
}

/**
 * `ui-tests recruit`: makes a run for the study (idempotent on its key), creates one invite slot per planned participant,
 * prints the run handle and the invite links, and exits. `--wait` then polls until the run has a result.
 */
export const recruit: Command = async (args, io) => {
  const deps = io.deps ?? {}
  const json = args.flags.has('json')
  const actorFlag = args.flags.get('actor')
  if (actorFlag === 'both') { io.stderr.write('--actor both is refused: a run has one actor. Recruit once for each.\n'); return 2 }
  if (actorFlag !== undefined && actorFlag !== 'human' && actorFlag !== 'agent') { io.stderr.write('--actor must be human or agent\n'); return 2 }
  const hours = args.flags.get('deadline')
  if (hours !== undefined && !(typeof hours === 'string' && Number(hours) > 0)) { io.stderr.write('--deadline takes a number of hours\n'); return 2 }

  let config: UiTestsConfig
  let loaded: Awaited<ReturnType<typeof loadStudies>>
  try {
    config = withProduct((await loadConfig(io.cwd)).config)
    loaded = await loadStudies(io.cwd, [], config)
  } catch (error) {
    io.stderr.write(`${error instanceof StudyLoadError ? error.message.replace(error.file, error.file.replace(`${io.cwd}/`, '')) : error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  const actor = actorFlag ?? config.actor ?? 'human'
  const wanted = args.flags.get('study')
  const candidates = typeof wanted === 'string' ? loaded.filter(l => l.compiled.name === wanted) : loaded
  if (typeof wanted === 'string' && !candidates.length) { io.stderr.write(`No study named "${wanted}"\n`); return 2 }
  const admitting = candidates.filter(l => l.compiled.actors.includes(actor))
  if (!admitting.length) { io.stderr.write(`No study admits the ${actor} actor\n`); return 2 }
  if (admitting.length > 1) { io.stderr.write(`${admitting.length} studies admit the ${actor} actor; pass --study <name>:\n${admitting.map(l => `  ${l.compiled.name}`).join('\n')}\n`); return 2 }
  const chosen = admitting[0]

  const findings = lint({ study: chosen.study, compiled: chosen.compiled, sourceText: chosen.sourceText, config, actor })
  if (findings.some(f => f.severity === 'error')) { io.stderr.write(`${formatFindings(findings)}\n`); return 1 }

  const target = config.target?.url ?? 'http://localhost:3000'
  const diagnostics = json ? io.stderr : io.stdout
  diagnostics.write(`${planLines(chosen.compiled).join('\n')}\n${chosen.compiled.consent.payout}\n\n`)

  const commit = await gitCommit(io.cwd)
  const keyFlag = args.flags.get('key')
  const key = typeof keyFlag === 'string' ? keyFlag : idempotencyKey({ commit, contextId: chosen.compiled.id, actor })
  const bypass = io.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined

  const store = await openStore(io.env)
  try {
    // A key that already has a run is read back without touching the target, so it still works while the target is down.
    const existing = (await store.listRuns()).find(r => r.key === key)
    if (!existing && !(await checkReachable(target, deps.fetch))) { io.stderr.write(`target not reachable: ${target}\n`); return 2 }
    const { run, created } = await createRun({
      store, compiled: chosen.compiled, hooksBundle: chosen.code, target, actor, rehearsal: false, key, commit,
      ...(hours !== undefined && { deadlineHours: Number(hours) }),
      reachability: { url: target, reachable: true, checkedAt: new Date().toISOString() },
    })
    // Invite slots are made up to n, so a run whose setup failed part-way is repaired by running the same command again.
    const made = (await store.listAttempts(run.run)).filter(a => !a.rehearsal).length
    const missing = Math.max(0, run.compiled.sample.n - made)
    let invites: string[] | undefined
    if (missing) invites = await createInvites({ store, run, study: chosen.study, count: missing, firstSlot: made + 1, target, ...(bypass && { bypass }) })
    if (!created) io.stderr.write(`Run ${run.run} already exists for key ${key}; ${missing ? `made ${missing} missing invite${missing === 1 ? '' : 's'}` : 'no new invites'}.\n`)

    let handle = handleOf(run)
    let code = 0
    if (args.flags.has('wait')) {
      if (json) io.stderr.write(`Run ${run.run}\n${(invites ?? []).join('\n')}\n`)
      else io.stdout.write(`Run ${run.run}\n${(invites ?? []).map(l => `${l}\n`).join('')}`)
      ;({ handle, code } = await waitForResult(store, run.run, io))
    }
    if (json) io.stdout.write(`${JSON.stringify(invites ? { ...handle, invites } : handle, null, 2)}\n`)
    else if (!args.flags.has('wait')) {
      io.stdout.write([`Run ${run.run}`, `key: ${key}`, `result: ${handle.result}`, `deadline: ${handle.deadline}`, ...(invites ? ['', 'Invite links:', ...invites] : []), '', `Check on it with: ui-tests status ${run.run}`, ''].join('\n'))
    } else io.stdout.write(`result: ${handle.result}\n`)
    return code
  } finally { await store.close() }
}
