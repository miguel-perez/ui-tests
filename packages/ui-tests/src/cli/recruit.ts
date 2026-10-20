import { loadConfig } from '../config.ts'
import { formatFindings, lint, planLines } from '../lint.ts'
import { StudyLoadError } from '../load.ts'
import { createInvites, isSlot, reissueInvites } from '../runner/invites.ts'
import { createRun } from '../runner/create-run.ts'
import { gitCommit, idempotencyKey } from '../runner/key.ts'
import { handleOf, refreshRun } from '../runner/progress.ts'
import { checkReachable } from '../runner/setup.ts'
import { openStore } from '../store/open.ts'
import type { RunHandle, RunRow, RunStore } from '../store/types.ts'
import { chooseTunnel, openReachableTunnel, recordTunnel } from '../tunnel/session.ts'
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
async function waitForResult(store: RunStore, runId: string, io: Io, signal?: AbortSignal): Promise<{ handle: RunHandle; code: number }> {
  const deps = io.deps ?? {}
  const now = deps.now ?? (() => new Date())
  for (;;) {
    await verifyRun(store, runId)
    const run = await refreshRun(store, runId, now())
    if (run.result !== 'pending') return { handle: handleOf(run), code: exitCodeFor(run.result) }
    if (signal?.aborted) return { handle: handleOf(run), code: 3 }
    io.stderr.write(`waiting: ${run.states.collection}, result pending\n`)
    await pause(deps.pollMs ?? DEFAULT_POLL_MS, signal)
  }
}

/** Holds until the deadline passes on `now`'s clock or `signal` aborts, whichever is first. */
async function holdUntil(deadline: string, now: () => Date, pollMs: number, signal: AbortSignal) {
  while (!signal.aborted && now().getTime() < Date.parse(deadline)) await pause(Math.min(pollMs, Math.max(1, Date.parse(deadline) - now().getTime())), signal)
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
    const now = deps.now ?? (() => new Date())
    const stop = new AbortController()
    const onSignal = () => stop.abort()
    let opened: Awaited<ReturnType<typeof openReachableTunnel>> | undefined
    let tunnel: typeof opened
    const onExit = () => { void (tunnel ?? opened)?.close() }
    let tunneling = args.flags.has('tunnel')
    if (tunneling && existing && Date.parse(existing.deadline) <= now().getTime()) {
      io.stderr.write(`Run ${existing.run} is past its deadline; no tunnel opened and no links reissued.\n`)
      tunneling = false
    }
    // A tunnel is run-scoped: it is opened (and must answer) before any run exists, recorded on the run, and closed at the deadline or when this command ends.
    if (tunneling) {
      try { opened = await openReachableTunnel({ tunnel: chooseTunnel(io.env, deps.tunnel), localUrl: target, ...(deps.fetch && { fetch: deps.fetch }), retryMs: deps.pollMs ?? 500 }) } catch (error) {
        io.stderr.write(`tunnel: ${error instanceof Error ? error.message : String(error)}\n`)
        return 2
      }
      for (const event of ['SIGINT', 'SIGTERM', 'exit'] as const) process.once(event, event === 'exit' ? onExit : onSignal)
    }
    deps.signal?.addEventListener('abort', onSignal, { once: true })
    if (deps.signal?.aborted) stop.abort()
    let created = false
    let run!: RunRow
    try {
      ;({ run, created } = await createRun({
        store, compiled: chosen.compiled, hooksBundle: chosen.code, target, actor, rehearsal: false, key, commit,
        ...(hours !== undefined && { deadlineHours: Number(hours) }),
        reachability: { url: target, reachable: true, checkedAt: new Date().toISOString() },
      }))
      if (opened) tunnel = await recordTunnel({ store, runId: run.run, opened, now })
      const linkBase = tunnel?.url ?? target
      // A resumed run reopens its tunnel at a new address, so slots nobody opened get new links under it.
      const reissued = tunnel ? await reissueInvites({ store, run, linkBase, ...(bypass && { bypass }) }) : []
      // Invite slots are made up to n, so a run whose setup failed part-way is repaired by running the same command again.
      const made = (await store.listAttempts(run.run)).filter(isSlot).length
      const missing = Math.max(0, run.compiled.sample.n - made)
      let invites: string[] | undefined
      if (missing) invites = await createInvites({ store, run, study: chosen.study, count: missing, firstSlot: made + 1, target, linkBase, ...(bypass && { bypass }) })
      if (reissued.length) invites = [...reissued, ...(invites ?? [])]
      if (!created) io.stderr.write(`Run ${run.run} already exists for key ${key}; ${missing ? `made ${missing} missing invite${missing === 1 ? '' : 's'}` : 'no new invites'}${reissued.length ? `; ${reissued.length} link${reissued.length === 1 ? '' : 's'} reissued under the new tunnel` : ''}.\n`)
      const tunnelLine = tunnel ? `Tunnel: ${tunnel.url} (open until ${run.deadline} or until this command ends)\n` : ''

      let handle = handleOf(run)
      let code = 0
      if (args.flags.has('wait')) {
        if (json) io.stderr.write(`Run ${run.run}\n${tunnelLine}${(invites ?? []).join('\n')}\n`)
        else io.stdout.write(`Run ${run.run}\n${tunnelLine}${(invites ?? []).map(l => `${l}\n`).join('')}`)
        ;({ handle, code } = await waitForResult(store, run.run, io, stop.signal))
      }
      if (json) io.stdout.write(`${JSON.stringify({ ...handle, ...(invites && { invites }), ...(tunnel && { tunnel: tunnel.url }) }, null, 2)}\n`)
      else if (!args.flags.has('wait')) {
        io.stdout.write([`Run ${run.run}`, `key: ${key}`, `result: ${handle.result}`, `deadline: ${handle.deadline}`, ...(invites ? ['', 'Invite links:', ...invites] : []), ...(tunnel ? ['', tunnelLine.trimEnd()] : []), '', `Check on it with: ui-tests status ${run.run}`, ''].join('\n'))
      } else io.stdout.write(`result: ${handle.result}\n`)
      if (tunnel && !args.flags.has('wait')) {
        io.stderr.write('The tunnel stays open for the participants. Press Ctrl-C to close it.\n')
        await holdUntil(run.deadline, now, deps.pollMs ?? DEFAULT_POLL_MS, stop.signal)
      }
      return code
    } finally {
      deps.signal?.removeEventListener('abort', onSignal)
      for (const event of ['SIGINT', 'SIGTERM'] as const) process.removeListener(event, onSignal)
      process.removeListener('exit', onExit)
      await (tunnel ?? opened)?.close()
    }
  } finally { await store.close() }
}
