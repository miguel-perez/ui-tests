import { DEFAULT_SERVER_URL, loadConfig } from '../config.ts'
import { formatFindings, lint, planLines } from '../lint.ts'
import { StudyLoadError } from '../load.ts'
import { BYPASS_HEADER, createInvites, reissueInvites, slotCount } from '../runner/invites.ts'
import { createRun } from '../runner/create-run.ts'
import { agentFingerprint } from '../agents/config.ts'
import { gitCommit, idempotencyKey } from '../runner/key.ts'
import { handleOf, refreshRun } from '../runner/progress.ts'
import { attachFirstLook, playwrightScreenshotter } from '../runner/screenshot.ts'
import { isLoopbackHost, linkBaseFor, probeLocal, reachabilityOf } from '../runner/hosts.ts'
import { checkReachable } from '../runner/setup.ts'
import { openStore } from '../store/open.ts'
import type { RunHandle, RunRow, RunStore } from '../store/types.ts'
import { chooseTunnel, openReachableTunnel, recordTunnel } from '../tunnel/session.ts'
import type { UiTestsConfig } from '../types.ts'
import { verifyRun } from '../verify.ts'
import { loadStudies, withProduct } from './lint.ts'
import type { Command, Io } from './main.ts'
import { answersAsServer, ensureServer, ServerUnreachable, takesForwardedHost } from './ensure-server.ts'
import { startFrontDoor } from '../server/front-door.ts'
import { setRunApp } from '../server/origins.ts'
import { reporterFor } from './outward.ts'

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
async function waitForResult(store: RunStore, runId: string, io: Io, signal?: AbortSignal, localOnly = false): Promise<{ handle: RunHandle; code: number }> {
  const deps = io.deps ?? {}
  const now = deps.now ?? (() => new Date())
  const bypass = io.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined
  for (;;) {
    await verifyRun(store, runId, bypass ? { bypass } : {})
    const run = await refreshRun(store, runId, now(), { ...(!localOnly && { onResult: reporterFor(io) }) })
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
  const server = (config.server?.url ?? DEFAULT_SERVER_URL).replace(/\/+$/, '')
  // Local only: this machine alone. Nothing leaves it, so the things that would (a tunnel, a result hook for GitHub or a webhook) are off, and a target that is not on this machine is refused.
  const localOnly = args.flags.has('local')
  const hostFlag = args.flags.get('host')
  if (hostFlag !== undefined && (typeof hostFlag !== 'string' || !hostFlag)) { io.stderr.write('--host takes a hostname, such as 10.0.0.5 or staging.corp.internal\n'); return 2 }
  if (localOnly && args.flags.has('tunnel')) { io.stderr.write('--local and --tunnel cannot be combined: local only opens no tunnel.\n'); return 2 }
  if (localOnly && typeof hostFlag === 'string') { io.stderr.write('--local and --host cannot be combined: local only gives links on this machine; use --host to serve people inside your network.\n'); return 2 }
  if (args.flags.has('tunnel') && typeof hostFlag === 'string') { io.stderr.write('--host and --tunnel cannot be combined: a tunnel has its own address.\n'); return 2 }
  const databaseUrl = io.env.UI_TESTS_DATABASE_URL
  if (localOnly && databaseUrl && !databaseUrl.startsWith('pglite:')) { io.stderr.write('--local keeps the store on this machine: unset UI_TESTS_DATABASE_URL or use pglite:<dir>, not a remote database.\n'); return 2 }
  // With --host, people reach the app and the ui-tests server by that name, on the front door's port: only the name is taken.
  let hostName: string | undefined
  try {
    if (localOnly && !isLoopbackHost(new URL(target).hostname.replace(/^\[|\]$/g, ''))) { io.stderr.write(`--local needs a target on this machine, not ${target}.\n`); return 2 }
    if (localOnly && new URL(target).protocol !== 'http:') { io.stderr.write(`--local supports http targets on this machine; ${target} is ${new URL(target).protocol.replace(':', '')}. Serve the build over http on localhost.\n`); return 2 }
    if (typeof hostFlag === 'string') hostName = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(hostFlag) ? hostFlag : `http://${hostFlag}`).hostname || undefined
    if (typeof hostFlag === 'string' && !hostName) throw new Error('no hostname')
  } catch { io.stderr.write(`${typeof hostFlag === 'string' ? `--host ${hostFlag} is not a hostname` : `target is not a URL: ${target}`}\n`); return 2 }
  if (hostName && hostName !== hostFlag) io.stderr.write(`--host ${hostFlag}: links are on the front door's own port, so only the name ${hostName} is used.\n`)
  try {
    if (localOnly && !isLoopbackHost(new URL(server).hostname.replace(/^\[|\]$/g, ''))) { io.stderr.write(`--local needs the ui-tests server on this machine, not ${server}.\n`); return 2 }
    if (!URL.canParse(server)) throw new Error('not a URL')
  } catch { io.stderr.write(`the ui-tests server is not a URL: ${server}\n`); return 2 }
  // A tunnel or a LAN name reaches the app and the ui-tests server through one front door on this machine.
  const throughDoor = args.flags.has('tunnel') || hostName !== undefined
  // The links open the player on the ui-tests server, so it must answer before any run is made. Local only, and the front door, start one if they can.
  if (!localOnly && !throughDoor && !(await answersAsServer(server))) { io.stderr.write(`${new ServerUnreachable(server).message}\n`); return 2 }
  const mode = reachabilityOf(hostName ? `http://${hostName}` : target, { tunnel: args.flags.has('tunnel') })
  const diagnostics = json ? io.stderr : io.stdout
  diagnostics.write(`${planLines(chosen.compiled).join('\n')}\n${chosen.compiled.consent.payout}\n\n`)
  if (localOnly) diagnostics.write('Local only: no tunnel, model, GitHub or webhook call is made. The run, its records and the links stay on this machine.\n\n')

  const commitFlag = args.flags.get('commit')
  const commit = typeof commitFlag === 'string' ? commitFlag : await gitCommit(io.cwd)
  const keyFlag = args.flags.get('key')
  const prFlag = args.flags.get('pr')
  const pr = typeof prFlag === 'string' && /^[1-9]\d*$/.test(prFlag) ? Number(prFlag) : undefined
  const key = typeof keyFlag === 'string' ? keyFlag : idempotencyKey({ commit, ...(pr !== undefined && { pr }), contextId: chosen.compiled.id, actor, ...(actor === 'agent' && { fingerprint: agentFingerprint(config.agents) }) })
  const bypass = io.env.VERCEL_AUTOMATION_BYPASS_SECRET || undefined

  const store = await openStore(io.env)
  let started: Awaited<ReturnType<typeof ensureServer>> | undefined
  try {
    if (localOnly || throughDoor) {
      // Behind the front door the server's own address is the one each request comes in on, so one it starts pins none.
      try { started = await ensureServer({ url: server, store, io, ...(throughDoor && { publicUrl: false as const }) }) } catch (error) {
        io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
        return 2
      }
      if (throughDoor && !started.started && !(await takesForwardedHost(server, bypass ? { [BYPASS_HEADER]: bypass } : {}))) {
        io.stderr.write(`The ui-tests server on ${server} does not take the front door's address as its own. Run it without UI_TESTS_PUBLIC_URL, or stop it and let this command start one.\n`)
        return 2
      }
    }
    // A key that already has a run is read back without touching the target, so it still works while the target is down.
    const existing = (await store.listRuns()).find(r => r.key === key)
    if (!existing && !(await (localOnly ? probeLocal(target) : checkReachable(target, deps.fetch)))) { io.stderr.write(`target not reachable: ${target}\n`); return 2 }
    const now = deps.now ?? (() => new Date())
    const stop = new AbortController()
    const onSignal = () => stop.abort()
    let opened: Awaited<ReturnType<typeof openReachableTunnel>> | undefined
    let tunnel: typeof opened
    let door: Awaited<ReturnType<typeof startFrontDoor>> | undefined
    const onExit = () => { void (tunnel ?? opened)?.close(); void door?.close() }
    let tunneling = args.flags.has('tunnel')
    if (tunneling && existing && Date.parse(existing.deadline) <= now().getTime()) {
      io.stderr.write(`Run ${existing.run} is past its deadline; no tunnel opened and no links reissued.\n`)
      tunneling = false
    }
    // The front door serves the app and the ui-tests server from one origin, and points the app's tag at it, for as long as this command runs.
    if (tunneling || hostName) door = await startFrontDoor({ app: target, server, ...(hostName && { host: '0.0.0.0' }), ...(bypass && { appHeaders: { [BYPASS_HEADER]: bypass } }) })
    // A tunnel is run-scoped: it is opened to the front door (and must answer) before any run exists, recorded on the run, and closed at the deadline or when this command ends.
    if (tunneling && door) {
      try { opened = await openReachableTunnel({ tunnel: chooseTunnel(io.env, deps.tunnel), localUrl: door.url, ...(deps.fetch && { fetch: deps.fetch }), retryMs: deps.pollMs ?? 500 }) } catch (error) {
        io.stderr.write(`tunnel: ${error instanceof Error ? error.message : String(error)}\n`)
        await door.close()
        return 2
      }
    }
    if (door) for (const event of ['SIGINT', 'SIGTERM', 'exit'] as const) process.once(event, event === 'exit' ? onExit : onSignal)
    else if (started?.started) for (const event of ['SIGINT', 'SIGTERM'] as const) process.once(event, onSignal)
    // Where people open the app and the links: the tunnel's address, the --host name on the door's port, or the target and the server.
    const doorBase = opened?.url ?? (door && hostName ? linkBaseFor(door.url, hostName) : undefined)
    if (doorBase && hostName) diagnostics.write(`${mode === 'perimeter' ? 'Inside the perimeter: links' : 'Links'} are on ${doorBase}. Keep this command running while people take part.\n\n`)
    deps.signal?.addEventListener('abort', onSignal, { once: true })
    if (deps.signal?.aborted) stop.abort()
    let created = false
    let run!: RunRow
    try {
      ;({ run, created } = await createRun({
        store, compiled: chosen.compiled, hooksBundle: chosen.code, target, appUrl: doorBase ?? target, actor, rehearsal: false, key, commit,
        ...(hours !== undefined && { deadlineHours: Number(hours) }),
        reachability: { url: target, reachable: true, checkedAt: new Date().toISOString(), mode, ...(localOnly && { localOnly: true }) },
      }))
      // A resumed run is opened at the door's address of this time (a quick tunnel's is new each time): it becomes the app's, and its origin is allowed.
      if (doorBase && !created) run = await setRunApp(store, run.run, doorBase)
      if (opened) tunnel = await recordTunnel({ store, runId: run.run, opened, now })
      const linkBase = doorBase ?? server
      // A resumed run reopens its tunnel at a new address, so slots nobody opened get new links under it.
      const reissued = tunnel ? await reissueInvites({ store, run, linkBase, ...(bypass && { bypass }) }) : []
      // Invite slots are made up to n, so a run whose setup failed part-way is repaired by running the same command again.
      const made = slotCount(await store.listAttempts(run.run))
      const missing = Math.max(0, run.compiled.sample.n - made)
      let invites: string[] | undefined
      if (missing) invites = await createInvites({ store, run, study: chosen.study, count: missing, firstSlot: made + 1, target, linkBase, ...(bypass && { bypass }) })
      if (reissued.length) invites = [...reissued, ...(invites ?? [])]
      // The first look is a picture of the start page, taken once now and shown to every participant of the run.
      const shot = await attachFirstLook({ store, run, target, screenshotter: deps.screenshotter ?? playwrightScreenshotter({ loopbackOnly: localOnly }), ...(bypass && { headers: { [BYPASS_HEADER]: bypass } }) })
      if (shot.error) io.stderr.write(`${shot.error}\n`)
      if (!created) io.stderr.write(`Run ${run.run} already exists for key ${key}; ${missing ? `made ${missing} missing invite${missing === 1 ? '' : 's'}` : 'no new invites'}${reissued.length ? `; ${reissued.length} link${reissued.length === 1 ? '' : 's'} reissued under the new tunnel` : ''}.\n`)
      const tunnelLine = tunnel ? `Tunnel: ${tunnel.url} (open until ${run.deadline} or until this command ends)\n` : ''

      let handle = handleOf(run)
      let code = 0
      if (args.flags.has('wait')) {
        if (json) io.stderr.write(`Run ${run.run}\n${tunnelLine}${(invites ?? []).join('\n')}\n`)
        else io.stdout.write(`Run ${run.run}\n${tunnelLine}${(invites ?? []).map(l => `${l}\n`).join('')}`)
        ;({ handle, code } = await waitForResult(store, run.run, io, stop.signal, localOnly))
      }
      if (json) io.stdout.write(`${JSON.stringify({ ...handle, ...(invites && { invites }), ...(tunnel && { tunnel: tunnel.url }) }, null, 2)}\n`)
      else if (!args.flags.has('wait')) {
        io.stdout.write([`Run ${run.run}`, `key: ${key}`, `result: ${handle.result}`, `deadline: ${handle.deadline}`, ...(invites ? ['', 'Invite links:', ...invites] : []), ...(tunnel ? ['', tunnelLine.trimEnd()] : []), '', `Check on it with: ui-tests status ${run.run}`, ''].join('\n'))
      } else io.stdout.write(`result: ${handle.result}\n`)
      if (tunnel && !args.flags.has('wait')) {
        io.stderr.write('The tunnel stays open for the participants. Press Ctrl-C to close it.\n')
        await holdUntil(run.deadline, now, deps.pollMs ?? DEFAULT_POLL_MS, stop.signal)
      } else if (door && !args.flags.has('wait')) {
        io.stderr.write('The front door stays open for the participants. Press Ctrl-C to close it.\n')
        await holdUntil(run.deadline, now, deps.pollMs ?? DEFAULT_POLL_MS, stop.signal)
      } else if (started?.started && !args.flags.has('wait')) {
        // The links open the server this command started: it serves them until the deadline, like a tunnel.
        io.stderr.write('The ui-tests server stays up for the participants. Press Ctrl-C to stop it.\n')
        await holdUntil(run.deadline, now, deps.pollMs ?? DEFAULT_POLL_MS, stop.signal)
      }
      return code
    } finally {
      deps.signal?.removeEventListener('abort', onSignal)
      for (const event of ['SIGINT', 'SIGTERM'] as const) process.removeListener(event, onSignal)
      process.removeListener('exit', onExit)
      await (tunnel ?? opened)?.close()
      await door?.close()
    }
  } finally {
    await started?.close()
    await store.close()
  }
}
