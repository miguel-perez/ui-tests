import { request as playwrightRequest, type APIRequestContext, type APIResponse } from 'playwright-core'
import type { AuthoredTask } from './authoring.ts'
import { AssertionFailure } from './expect.ts'
import { loadBundle } from './load.ts'
import { snapshotPage } from './snapshot-page.ts'
import type { AttemptRow, HookResult, RunRow, RunStore, Verification } from './store/types.ts'
import type { Hook, HookArgs, Workspace } from './types.ts'
import { BYPASS_HEADER } from './runner/invites.ts'

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

/** Runs the task's outcome, step checks and answer check against the stored evidence (and an agent trial's workspace) and combines them into one verdict. */
export async function verifyAttempt(input: { run: RunRow; attempt: AttemptRow; task: AuthoredTask; store: RunStore; request: APIRequestContext; workspace?: Workspace }): Promise<Verification> {
  const { attempt, task, store, request, workspace } = input
  const setup = attempt.setupValues
  const end = await store.getSnapshot(attempt.id, 'end')
  const steps = await Promise.all(task.steps.map(async (step, index): Promise<HookResult & { name: string }> => {
    if (!step.check) return { name: step.name, status: 'unknown', reason: 'No check authored' }
    return { name: step.name, ...await runHook(step.check, { request, setup, page: snapshotPage(await store.getSnapshot(attempt.id, `step-${index}`)), ...(workspace && { workspace }) }) }
  }))
  const answer = checkAnswer(task, attempt, attempt.goalIndex)
  const [outcome] = task.outcomes as (Hook | undefined)[]
  const terminal = attempt.reason === 'gave up' || attempt.reason === 'timeout'
  let result: HookResult
  if (outcome && terminal) result = { status: 'incorrect', reason: `Terminal reason: ${attempt.reason}` }
  else if (outcome) result = await runHook(outcome, { request, setup, page: snapshotPage(end), ...(workspace && { workspace }) })
  else if (answer) result = answer
  else if (task.steps.some(step => step.check !== undefined)) result = { status: 'correct' }
  else result = { status: 'unknown', reason: 'Issues only: no outcome' }
  const checked = task.steps.map((step, index) => ({ step, result: steps[index] })).filter(entry => entry.step.check !== undefined)
  if (steps.some(step => step.status === 'incorrect')) result = { status: 'incorrect', reason: 'A step check failed' }
  else if (answer?.status === 'incorrect' && result.status !== 'incorrect') result = { ...answer }
  else if (result.status === 'correct' && (checked.some(entry => entry.result.status === 'unknown') || answer?.status === 'unknown')) result = { status: 'unknown', reason: 'Evidence for a check is missing' }
  return { ...result, steps, ...(answer && { answer }) }
}

type Options = {
  now?: number
  requestFactory?: (baseURL: string) => Promise<APIRequestContext>
  /** The Vercel protection-bypass secret (`VERCEL_AUTOMATION_BYPASS_SECRET`): the hooks' requests to the target carry it, so a protected preview answers rather than its login page. */
  bypass?: string
}

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
  const pending = (await store.listAttempts(runId)).filter(a => a.status === 'finished' && !a.verification && a.reason !== 'disconnected' && a.reason !== 'withdrew')
  if (!pending.length) return { verified: 0, disconnected }
  const studies = await loadBundle(run.hooksBundle, run.compiled.name)
  const study = studies.find(s => s.name === run.compiled.name) ?? studies[0]
  const request = await (options.requestFactory ?? ((baseURL: string) => defaultRequest(baseURL, options.bypass)))(run.target)
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

const defaultRequest = async (baseURL: string, bypass?: string): Promise<APIRequestContext> => {
  const context = await playwrightRequest.newContext({ baseURL })
  return bypass ? withBypass(context, baseURL, bypass) : context
}

type RequestOptions = { headers?: Record<string, string>; params?: unknown; maxRedirects?: number; method?: string; data?: unknown; form?: unknown; multipart?: unknown }

const REQUEST_METHODS = new Set(['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head'])

/**
 * The request context with the protection-bypass header on every request to the target's own origin, and on no other: the secret
 * opens the author's preview and is never sent to a third party a hook happens to call.
 */
export function withBypass(context: APIRequestContext, baseURL: string, secret: string): APIRequestContext {
  const origin = new URL(baseURL).origin
  const sameOrigin = (url: unknown) => {
    const address = typeof url === 'string' ? url : (url as { url?: () => string } | undefined)?.url?.()
    try { return address !== undefined && new URL(address, baseURL).origin === origin } catch { return false }
  }
  return new Proxy(context, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown
      if (typeof value !== 'function') return value
      if (typeof property !== 'string' || !REQUEST_METHODS.has(property)) return value.bind(target)
      return async (url: unknown, options: RequestOptions = {}) => {
        if (!sameOrigin(url)) return value.call(target, url, options)
        // The header goes only with `maxRedirects: 0`: each redirect is followed here by Playwright's rules, and the header goes
        // again only when the Location is still the target's own origin. A hop elsewhere is made without it, and without the
        // credentials of the origin it left; Playwright follows it on the budget the own-origin hops left, so the caller's
        // maxRedirects bounds the redirects of the whole chain.
        const request = typeof url === 'string' ? undefined : (url as { url: () => string; method?: () => string; headers?: () => Record<string, string>; postDataBuffer?: () => Buffer | null })
        const limit = options.maxRedirects ?? 20
        let address = request ? request.url() : url as string
        let method = property === 'fetch' ? (options.method ?? request?.method?.() ?? 'GET').toUpperCase() : property.toUpperCase()
        let input: unknown = url
        let current: RequestOptions = options
        for (let hop = 0; ; hop++) {
          const own = sameOrigin(address)
          const response = await (hop === 0 ? value : target.fetch).call(target, input, own ? { ...current, headers: { ...current.headers, [BYPASS_HEADER]: secret }, maxRedirects: 0 } : { ...current, maxRedirects: Math.max(0, limit - hop) }) as APIResponse
          const location = response.headers().location
          if (!location || ![301, 302, 303, 307, 308].includes(response.status()) || limit === 0) return response
          // A hop elsewhere made with the budget spent answers its redirect instead of following it: as fetch would, that is the error.
          if (!own) { if (hop < limit) return response; await response.dispose(); throw new Error('Max redirect count exceeded') }
          if (hop >= limit) { await response.dispose(); throw new Error('Max redirect count exceeded') }
          await response.dispose()
          const next = new URL(location, new URL(address, baseURL))
          const { params: _params, ...rest } = current
          current = rest
          // A body is dropped and the method becomes GET for a POST after 301/302 and for anything but GET/HEAD after 303;
          // 307 and 308 keep the method and body. A Request input's own method, headers and body travel on from its first hop.
          const status = response.status()
          if (hop === 0 && request) {
            current = { ...current, headers: { ...request.headers?.(), ...current.headers }, ...(current.data === undefined && request.postDataBuffer?.() ? { data: request.postDataBuffer!() } : {}) }
          }
          if ((status === 303 && method !== 'GET' && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST')) {
            const { data: _data, form: _form, multipart: _multipart, ...bodyless } = current
            current = bodyless
            method = 'GET'
          }
          current = { ...current, method }
          if (next.origin !== origin) {
            const { authorization: _a, cookie: _c, ...kept } = Object.fromEntries(Object.entries(current.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
            current = { ...current, headers: kept }
          }
          address = next.href
          input = address
        }
      }
    },
  })
}
