import { request as playwrightRequest, type APIRequestContext } from 'playwright-core'
import type { AuthoredTask } from './authoring.ts'
import { AssertionFailure } from './expect.ts'
import { loadBundle } from './load.ts'
import { snapshotPage } from './snapshot-page.ts'
import { SCREENED_OUT, type AttemptRow, type HookResult, type RunRow, type RunStore, type Verification } from './store/types.ts'
import type { Hook, HookArgs } from './types.ts'

export type { HookResult, Verification } from './store/types.ts'

const noWorkspace = { file: () => undefined, root: '' }
const graceMs = 60_000

/** Runs one hook. A failed assertion is `incorrect` with its diff; missing evidence or any other throw is `unknown` with the reason. */
export async function runHook(hook: Hook, args: Partial<HookArgs>): Promise<HookResult> {
  try {
    await hook({ request: args.request as APIRequestContext, setup: args.setup ?? {}, page: args.page ?? snapshotPage(), workspace: args.workspace ?? noWorkspace })
    return { status: 'correct' }
  } catch (error) {
    // By name as well: a hook bundle may hold its own copy of this module, so `instanceof` alone can miss.
    if (error instanceof Error && (error instanceof AssertionFailure || error.name === 'AssertionFailure')) {
      const failure = error as AssertionFailure
      return { status: 'incorrect', reason: failure.message, diff: { expected: failure.expected, actual: failure.actual } }
    }
    return { status: 'unknown', reason: error instanceof Error ? error.message : String(error) }
  }
}

/** Checks the participant's answer to the validation question against the expected one. */
function checkAnswer(task: AuthoredTask, attempt: AttemptRow, goalIndex: number): HookResult | undefined {
  if (!task.answer) return undefined
  const given = attempt.answers[task.answer.question] ?? attempt.answers[`goal${goalIndex}.answer`]
  if (given === undefined) return { status: 'unknown', reason: 'The validation question was not answered' }
  return given === task.answer.expected ? { status: 'correct' } : { status: 'incorrect', reason: 'The answer differs from the expected one', diff: { expected: task.answer.expected, actual: given } }
}

/** Runs the task's outcome, step checks and answer check against the stored evidence and combines them into one verdict. */
export async function verifyAttempt(input: { run: RunRow; attempt: AttemptRow; task: AuthoredTask; store: RunStore; request: APIRequestContext }): Promise<Verification> {
  const { attempt, task, store, request } = input
  const setup = attempt.setupValues
  const end = await store.getSnapshot(attempt.id, 'end')
  const steps = await Promise.all(task.steps.map(async (step, index): Promise<HookResult & { name: string }> => {
    if (!step.check) return { name: step.name, status: 'unknown', reason: 'No check authored' }
    return { name: step.name, ...await runHook(step.check, { request, setup, page: snapshotPage(await store.getSnapshot(attempt.id, `step-${index}`)) }) }
  }))
  const answer = checkAnswer(task, attempt, attempt.goalIndex)
  const [outcome] = task.outcomes as (Hook | undefined)[]
  const terminal = attempt.reason === 'gave up' || attempt.reason === 'timeout'
  let result: HookResult
  if (outcome && terminal) result = { status: 'incorrect', reason: `Terminal reason: ${attempt.reason}` }
  else if (outcome) result = await runHook(outcome, { request, setup, page: snapshotPage(end) })
  else if (answer) result = answer
  else if (task.steps.some(step => step.check !== undefined)) result = { status: 'correct' }
  else result = { status: 'unknown', reason: 'Issues only: no outcome' }
  const checked = task.steps.map((step, index) => ({ step, result: steps[index] })).filter(entry => entry.step.check !== undefined)
  if (steps.some(step => step.status === 'incorrect')) result = { status: 'incorrect', reason: 'A step check failed' }
  else if (answer?.status === 'incorrect' && result.status !== 'incorrect') result = { ...answer }
  else if (result.status === 'correct' && (checked.some(entry => entry.result.status === 'unknown') || answer?.status === 'unknown')) result = { status: 'unknown', reason: 'Evidence for a check is missing' }
  return { ...result, steps, ...(answer && { answer }) }
}

type Options = { now?: number; requestFactory?: (baseURL: string) => Promise<APIRequestContext> }

/** The time of the attempt's last sign of life, in epoch milliseconds. */
function lastActivity(attempt: AttemptRow, events: { at: number }[]): number {
  const started = attempt.startedAt ? Date.parse(attempt.startedAt) : 0
  return events.reduce((latest, event) => Math.max(latest, event.at < 1e12 ? started + event.at : event.at), started)
}

/**
 * Verifies a run's finished attempts that have no verification yet, in the runner against the stored snapshots.
 * Active attempts silent for longer than the goal's timeout plus 60 seconds become `disconnected` and are not verified.
 * Withdrawn and disconnected attempts are never verified.
 */
export async function verifyRun(store: RunStore, runId: string, options: Options = {}): Promise<{ verified: number; disconnected: number }> {
  const run = await store.getRun(runId)
  if (!run) throw new Error(`No such run: ${runId}`)
  const now = options.now ?? Date.now()
  const attempts = await store.listAttempts(runId)
  let disconnected = 0
  for (const attempt of attempts) {
    if (attempt.status !== 'active') continue
    const limit = (run.compiled.goals[attempt.goalIndex]?.timeout.seconds ?? 0) * 1000 + graceMs
    if (now - lastActivity(attempt, await store.listEvents(attempt.id)) > limit) {
      if (await store.updateAttempt(attempt.id, { status: 'finished', reason: 'disconnected', endedAt: new Date(now).toISOString() }, 'active')) disconnected++
    }
  }
  const pending = (await store.listAttempts(runId)).filter(a => a.status === 'finished' && !a.verification && a.reason !== 'disconnected' && a.reason !== 'withdrew' && !a.flags.includes(SCREENED_OUT))
  if (!pending.length) return { verified: 0, disconnected }
  const studies = await loadBundle(run.hooksBundle, run.compiled.name)
  const study = studies.find(s => s.name === run.compiled.name) ?? studies[0]
  const request = await (options.requestFactory ?? defaultRequest)(run.target)
  let verified = 0
  try {
    for (const attempt of pending) {
      const task = study?.tasks[attempt.goalIndex]
      const verification: Verification = task
        ? await verifyAttempt({ run, attempt, task, store, request })
        : { status: 'unknown', reason: 'The task is not in the stored hooks', steps: [] }
      await store.updateAttempt(attempt.id, { verification })
      verified++
    }
  } finally {
    await request.dispose()
  }
  return { verified, disconnected }
}

const defaultRequest = (baseURL: string) => playwrightRequest.newContext({ baseURL, extraHTTPHeaders: {} })
