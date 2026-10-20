import { DEFAULT_SERVER_URL, loadConfig } from '../config.ts'
import { agentRun } from './agent-run.ts'
import { formatFindings, lint, planLines } from '../lint.ts'
import { StudyLoadError } from '../load.ts'
import { createRun } from '../runner/create-run.ts'
import { attachFirstLook, playwrightScreenshotter } from '../runner/screenshot.ts'
import { checkReachable, runSetup } from '../runner/setup.ts'
import type { UiTestsConfig } from '../types.ts'
import { openStore } from '../store/open.ts'
import type { AttemptRow, RunStore } from '../store/types.ts'
import { serveTrace } from '../trace/serve.ts'
import { buildTrace } from '../trace/build.ts'
import { verifyRun } from '../verify.ts'
import { ensureServer } from './ensure-server.ts'
import { loadStudies, withProduct } from './lint.ts'
import type { Command, Io } from './main.ts'
import { interrupt, lintFor, openUrl, pause } from './trace.ts'
import { settleRun } from './verify.ts'

/** Screenshots a page in Chromium; undefined when no browser is installed. */
async function chromiumScreenshot(url: string): Promise<Uint8Array | undefined> {
  const { chromium } = await import('playwright-core')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(url, { timeout: 15_000 })
    return await page.screenshot()
  } finally { await browser.close() }
}

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
  const timer = setTimeout(resolve, ms)
  signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
})

/** Polls until the attempt is finished (answered, withdrawn or gone quiet), verifying as it goes. Undefined if stopped first. */
async function waitForAttempt(store: RunStore, runId: string, attemptId: string, pollMs: number, signal: AbortSignal): Promise<AttemptRow | undefined> {
  while (!signal.aborted) {
    await verifyRun(store, runId)
    const attempt = await store.getAttempt(attemptId)
    if (attempt?.status === 'finished') return attempt
    await sleep(pollMs, signal)
  }
  return undefined
}

/**
 * `ui-tests` with no command: rehearse a study on yourself. Prints the plan, finds the ui-tests server (or starts one on this machine
 * for the length of the rehearsal), creates a rehearsal run (never counted toward n) for the target, runs `setup`, opens the player on
 * the server, waits for the attempt, verifies it, prints the outcome, the signals and the sentence, and serves the trace until Ctrl-C.
 * With `--actor agent` it runs the agent trials instead (`agent-run.ts`).
 */
export const dev: Command = async (args, io: Io) => {
  const deps = io.deps ?? {}
  const signal = deps.signal ?? interrupt()
  const actorFlag = args.flags.get('actor')
  if (actorFlag === 'both') { io.stderr.write('--actor both is refused: a run has one actor.\n'); return 2 }
  if (actorFlag !== undefined && actorFlag !== 'human' && actorFlag !== 'agent') { io.stderr.write('--actor must be human or agent\n'); return 2 }
  const actor = actorFlag ?? 'human'
  if (actor === 'agent') return agentRun(args, io)

  let loaded: Awaited<ReturnType<typeof loadStudies>>
  let config: UiTestsConfig
  try {
    config = withProduct((await loadConfig(io.cwd)).config)
    loaded = await loadStudies(io.cwd, [], config)
  } catch (error) {
    io.stderr.write(`${error instanceof StudyLoadError ? error.message.replace(error.file, error.file.replace(`${io.cwd}/`, '')) : error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  const wanted = args.flags.get('study')
  const candidates = typeof wanted === 'string' ? loaded.filter(l => l.compiled.name === wanted) : loaded
  if (typeof wanted === 'string' && !candidates.length) { io.stderr.write(`No study named "${wanted}"\n`); return 2 }
  const chosen = candidates.find(l => l.compiled.actors.includes(actor))
  if (!chosen) { io.stderr.write(`No study admits the ${actor} actor\n`); return 2 }
  const taskName = args.flags.get('task')
  const goalIndex = typeof taskName === 'string' ? chosen.compiled.goals.findIndex(g => g.name === taskName) : 0
  if (goalIndex < 0) { io.stderr.write(`No task named "${taskName as string}" in "${chosen.compiled.name}"\n`); return 2 }

  const findings = lint({ study: chosen.study, compiled: chosen.compiled, sourceText: chosen.sourceText, config, actor })
  io.stdout.write(`${planLines(chosen.compiled).join('\n')}\n`)
  if (findings.some(f => f.severity === 'error')) {
    io.stdout.write(`\n${formatFindings(findings)}\n`)
    return 1
  }

  const target = config.target?.url ?? 'http://localhost:3000'
  if (!(await checkReachable(target, deps.fetch))) { io.stderr.write(`target not reachable: ${target}\n`); return 2 }

  const store = await openStore(io.env)
  let uiServer: Awaited<ReturnType<typeof ensureServer>> | undefined
  try {
    try { uiServer = await ensureServer({ url: config.server?.url ?? DEFAULT_SERVER_URL, store, io }) } catch (error) {
      io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
      return 2
    }
    const { run } = await createRun({
      store, compiled: chosen.compiled, hooksBundle: chosen.code, target, appUrl: target, actor, rehearsal: true,
      key: `rehearsal:${chosen.compiled.id}:${Date.now()}`,
      reachability: { url: target, reachable: true, checkedAt: new Date().toISOString() },
    })
    const setupValues = await runSetup(chosen.study, target)
    const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'rehearsal', goalIndex, rehearsal: true, setupValues })
    const shot = await attachFirstLook({ store, run, target, screenshotter: deps.screenshotter ?? playwrightScreenshotter() })
    if (shot.error) io.stderr.write(`${shot.error}\n`)
    const player = `${uiServer.url}/ui-tests/${run.run}/?t=${token}`
    if (args.flags.has('no-open')) io.stdout.write(`${JSON.stringify({ player })}\n`)
    else {
      io.stdout.write(`Player: ${player}\n`)
      await (deps.openUrl ?? openUrl)(player)
    }

    const done = await waitForAttempt(store, run.run, attempt.id, deps.pollMs ?? 500, signal)
    if (!done) return 0
    await settleRun(store, run.run)
    const finished = (await store.getAttempt(attempt.id))!
    const end = await store.getSnapshot(attempt.id, 'end')
    if (end && finished.reason !== 'withdrew' && finished.reason !== 'disconnected') {
      try {
        const image = await (deps.screenshot ?? chromiumScreenshot)(end.url)
        if (image) await store.putBlob(attempt.id, 'screenshot', image, 'image/png')
      } catch { /* a screenshot is a convenience; the trace has the snapshot */ }
    }

    const lintResults = await lintFor(io)
    const trace = await buildTrace(store, run.run, lintResults({ ...run, compiled: chosen.compiled }))
    const outcome = finished.reason === 'disconnected' || finished.reason === 'withdrew' ? finished.reason : finished.verification?.status ?? 'unknown'
    io.stdout.write(`\nOutcome: ${outcome}\n`)
    const signals = trace.attempts[0]?.signals ?? []
    if (signals.length) io.stdout.write(`Signals:\n${signals.map(s => `  ${s.kind}: ${s.detail}`).join('\n')}\n`)
    else io.stdout.write('Signals: none\n')
    io.stdout.write(`${trace.sentence}\n`)

    const port = args.flags.get('port')
    const server = await serveTrace({ store, lint: lintResults, ...(typeof port === 'string' && { port: Number(port) }) })
    const url = `${server.url}/runs/${encodeURIComponent(run.run)}/`
    io.stdout.write(`Trace: ${url}\n`)
    if (!args.flags.has('no-open')) await (deps.openUrl ?? openUrl)(url)
    await pause(signal)
    await server.close()
    return 0
  } finally {
    // A server this rehearsal started stops with it; one that was already running is left as it was.
    await uiServer?.close()
    await store.close()
  }
}
