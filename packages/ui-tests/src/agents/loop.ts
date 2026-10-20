import { request as playwrightRequest, type APIRequestContext } from 'playwright-core'
import type { AuthoredStudy } from '../authoring.ts'
import { runSetup } from '../runner/setup.ts'
import type { CompiledGoal } from '../schema/compiled.ts'
import type { RunRow, RunStore, Verification } from '../store/types.ts'
import { verifyAttempt } from '../verify.ts'
import type { AgentConfig } from './config.ts'
import type { AgentMessage, AgentModel, AgentStep, Harness, ToolSpec } from './model.ts'

/** One agent trial of a task, as PRD 04 reads it. */
export type Trial = {
  index: number
  /** The stored attempt that holds this trial's end state, transcript and verdict (its trace). */
  attempt: string
  /**
   * `verified`: the hook said correct. `stopped`: it said incorrect. `unknown`: it could not read its evidence, or the
   * model provider failed (an outage says nothing about what the agent can do).
   */
  state: 'verified' | 'stopped' | 'unknown'
  /** The agent called `done`. Claimed done and stopped is a false success. */
  claimedDone: boolean
  verification: Verification
  /** What stopped a `stopped` trial, in one line. */
  stoppedBy?: string
  /** Why a trial is `unknown` although its hook could read the evidence: the model provider failed. */
  infrastructure?: string
  /** The trial hit an error and still verified. */
  recovered: boolean
  /** Tokens and model calls, wall time and metered dollars; counted for every trial, failures included. */
  cost: { tokens: number; calls: number; wallMs: number; dollars?: number }
  sideEffects: string[]
  /** What the agent did that is worth reading but is not a failure, such as asking a clarifying question. */
  behaviours: string[]
  transcript: AgentMessage[]
}

export const DEFAULT_TRIALS = 5
/** Where a stored trial attempt keeps its summary (the trial without its transcript) and its transcript's blob id. */
export const TRIAL_ANSWER = 'agent.trial'
export const TRANSCRIPT_ANSWER = 'agent.transcript'
/** Budgets that apply when the config sets none: enough for a task, small enough that a stuck agent ends. */
export const DEFAULT_BUDGETS = { calls: 30, seconds: 600 }
const MAX_QUESTIONS = 3

/** The two ways an agent ends a trial on purpose. A harness may offer its own tool of either name; it is called too. */
export const DONE_TOOL: ToolSpec = { name: 'done', description: 'Call this when the task is done. Nothing after it runs.', input: { type: 'object', properties: { summary: { type: 'string', description: 'What you did, in one line' } } } }
export const GIVE_UP_TOOL: ToolSpec = { name: 'give_up', description: 'Call this when you cannot do the task, with what stopped you. Nothing after it runs.', input: { type: 'object', properties: { reason: { type: 'string', description: 'What stopped you, in one line' } }, required: ['reason'] } }

export const DEFAULT_SYSTEM = [
  'You are using a product through the tools you are given, to get one task done.',
  'Use only those tools. Nobody can answer questions while you work: decide for yourself.',
  'When the task is done, call done. If you cannot do it, call give_up with what stopped you.',
].join(' ')

const NO_ANSWER = 'Nobody can answer questions during this trial. Decide for yourself and carry on, or call give_up with what stopped you.'

/** One line of at most 200 characters. */
export const oneLine = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 200 ? `${line.slice(0, 199)}…` : line
}
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)
const message = (error: unknown) => error instanceof Error ? error.message : String(error)

/**
 * How a trial's loop ended. `said`: the agent's own account of why it stopped (give_up, a final message without `done`,
 * a refusal). `limit`: the harness stopped it (a budget, a reply cut off). `infrastructure`: the model provider failed.
 */
type LoopEnd = {
  claimedDone: boolean
  said?: string
  limit?: string
  infrastructure?: string
  hadError: boolean
  lastFailed?: string
  behaviours: string[]
  cost: Trial['cost']
  transcript: AgentMessage[]
}

class OutOfTime extends Error {}

/** Runs the agent on one trial until it calls done or give_up, stops talking, declines, fails, or runs out of budget. */
async function runAgent(input: { model: AgentModel; harness: Harness; system: string; prompt: string; budgets: NonNullable<AgentConfig['budgets']> }): Promise<LoopEnd> {
  const { model, harness, budgets } = input
  const started = Date.now()
  const transcript: AgentMessage[] = [{ role: 'user', text: input.prompt }]
  const behaviours: string[] = []
  const cost: Trial['cost'] = { tokens: 0, calls: 0, wallMs: 0 }
  const offered = harness.tools()
  const own = new Set(offered.map(t => t.name))
  const tools = [...offered, ...[DONE_TOOL, GIVE_UP_TOOL].filter(t => !own.has(t.name))]
  let hadError = false
  let lastFailed: string | undefined
  let questions = 0
  let toolIds = 0
  const end = (claimedDone: boolean, why: Partial<Pick<LoopEnd, 'said' | 'limit' | 'infrastructure'>> = {}): LoopEnd => {
    cost.wallMs = Date.now() - started
    return { claimedDone, ...why, hadError, ...(lastFailed && { lastFailed }), behaviours, cost, transcript }
  }
  const overBudget = (): string | undefined => {
    if (budgets.calls !== undefined && cost.calls >= budgets.calls) return `ran out of its budget of ${budgets.calls} model calls`
    if (budgets.tokens !== undefined && cost.tokens >= budgets.tokens) return `ran out of its budget of ${budgets.tokens} tokens`
    if (budgets.seconds !== undefined && Date.now() - started >= budgets.seconds * 1000) return `ran out of its budget of ${budgets.seconds} seconds`
    if (budgets.dollars !== undefined && (cost.dollars ?? 0) >= budgets.dollars) return `ran out of its budget of $${budgets.dollars}`
    return undefined
  }
  for (;;) {
    const spent = overBudget()
    if (spent) return end(false, { limit: spent })
    let step: AgentStep
    let timer: NodeJS.Timeout | undefined
    try {
      cost.calls++
      const call = model.step({ system: input.system, messages: transcript, tools })
      // The model step counts against the time budget too: it is not waited for past the end of it.
      step = budgets.seconds === undefined ? await call : await Promise.race([call, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new OutOfTime()), Math.max(0, started + budgets.seconds! * 1000 - Date.now())) })])
    } catch (error) {
      if (error instanceof OutOfTime) return end(false, { limit: `ran out of its budget of ${budgets.seconds} seconds` })
      return end(false, { infrastructure: `the model provider failed: ${message(error)}` })
    } finally { clearTimeout(timer) }
    cost.tokens += step.usage.inputTokens + step.usage.outputTokens
    if (step.usage.dollars !== undefined) cost.dollars = (cost.dollars ?? 0) + step.usage.dollars
    else if (budgets.dollars !== undefined) return end(false, { limit: `cannot keep its budget of $${budgets.dollars}: the model reports no price` })
    const toolCalls = step.toolCalls.map(call => ({ ...call, id: call.id ?? `call_${++toolIds}` }))
    transcript.push({ role: 'assistant', ...(step.text !== undefined && { text: step.text }), toolCalls, ...(step.raw !== undefined && { raw: step.raw }) })
    // A step that spent past the money or token budget ends the trial before its tool calls run.
    if (budgets.dollars !== undefined && (cost.dollars ?? 0) >= budgets.dollars) return end(false, { limit: `ran out of its budget of $${budgets.dollars}` })
    if (budgets.tokens !== undefined && cost.tokens >= budgets.tokens) return end(false, { limit: `ran out of its budget of ${budgets.tokens} tokens` })
    if (step.stop === 'refusal') return end(false, { said: step.text?.trim() ? `declined the task: ${step.text.trim()}` : 'declined the task' })
    if (step.stop === 'max_tokens') return end(false, { limit: 'ran out of output tokens in the middle of a reply' })
    if (toolCalls.length) {
      for (const call of toolCalls) {
        const ending = call.name === DONE_TOOL.name || call.name === GIVE_UP_TOOL.name
        let result: { output: string; error?: string } = { output: '' }
        if (!ending || own.has(call.name)) {
          try { result = await harness.call(call.name, call.input) } catch (error) {
            result = { output: '', error: `called ${call.name}, which failed: ${message(error)}` }
          }
        }
        transcript.push({ role: 'tool', id: call.id, name: call.name, output: result.output, ...(result.error && { error: result.error }) })
        if (call.name === DONE_TOOL.name) return end(true)
        if (call.name === GIVE_UP_TOOL.name) {
          const reason = (call.input as { reason?: unknown } | undefined)?.reason
          return end(false, { said: typeof reason === 'string' && reason.trim() ? reason.trim() : 'gave up without saying why' })
        }
        if (result.error) { hadError = true; lastFailed = result.error } else lastFailed = undefined
        const late = overBudget()
        if (late) return end(false, { limit: late })
      }
      continue
    }
    const text = step.text?.trim() ?? ''
    // A question with nothing done about it is a behaviour to report, not a failure: the agent is told to go on.
    if (text.endsWith('?')) {
      behaviours.push(`asked: ${oneLine(text)}`)
      if (++questions >= MAX_QUESTIONS) return end(false, { said: `asked ${MAX_QUESTIONS} questions and did not go on` })
      transcript.push({ role: 'user', text: NO_ANSWER })
      continue
    }
    // Ending the turn without calling done is not a claim of success: the agent's last words say why it stopped.
    return end(false, { said: text || 'stopped without calling done' })
  }
}

/**
 * The one line that says what stopped a trial: the agent's own reason, else the failed call it ended on, else the limit
 * it reached, else "said it was done, but …" (a false success), else the verdict.
 */
function stopLine(run: LoopEnd, verification: Verification): string {
  if (run.said) return oneLine(run.said)
  if (run.lastFailed) return oneLine(run.lastFailed)
  if (run.limit) return oneLine(run.limit)
  const reason = verification.reason ?? 'the outcome check failed'
  return oneLine(run.claimedDone ? `said it was done, but ${lowerFirst(reason)}` : reason)
}

export type RunTrialsInput = {
  store: RunStore
  run: RunRow
  study: AuthoredStudy
  goal: CompiledGoal
  model: AgentModel
  harness: Harness
  /** The number of the first trial to run; a resumed run starts after the trials it already has. Default 1. */
  firstIndex?: number
  /** Stops before the next trial; the trials run so far are returned. */
  signal?: AbortSignal
  /** Called as each trial is stored. */
  onTrial?: (trial: Trial) => void
  /** Where the hooks' `request` points; default: an http target's URL, else the run's target. */
  requestFactory?: (baseURL: string) => Promise<APIRequestContext>
}

/**
 * Runs the goal's trials up to `trials` (default 5), one after another, each from a reset harness: the scenario text is
 * the agent's prompt. Each trial is stored as an attempt with its end state and transcript, then verified by the task's
 * hooks against that end state. `runTrials` owns the harness: it disposes it at the end.
 */
export async function runTrials(input: RunTrialsInput): Promise<Trial[]> {
  const { store, run, study, goal, model, harness } = input
  const task = study.tasks[goal.index]
  if (!task) throw new Error(`The task "${goal.name}" is not in the study`)
  const config = run.compiled.agents?.config
  const system = config?.system ?? DEFAULT_SYSTEM
  const budgets = { ...DEFAULT_BUDGETS, ...config?.budgets }
  const count = goal.agent?.trials ?? DEFAULT_TRIALS
  const baseURL = goal.agent?.target.kind === 'http' ? goal.agent.target.value : run.target
  const trials: Trial[] = []
  if ((input.firstIndex ?? 1) > count) { await harness.dispose(); return trials }
  const request = await (input.requestFactory ?? (url => playwrightRequest.newContext({ baseURL: url })))(baseURL)
  try {
    for (let index = input.firstIndex ?? 1; index <= count; index++) {
      if (input.signal?.aborted) break
      await harness.reset()
      const setupValues = await runSetup(study, baseURL)
      const { attempt } = await store.createAttempt({ runId: run.run, participant: `agent:${goal.index}:${index}`, goalIndex: goal.index, rehearsal: run.rehearsal, setupValues })
      const startedAt = new Date().toISOString()
      await store.updateAttempt(attempt.id, { status: 'active', startedAt })
      const ran = await runAgent({ model, harness, system, prompt: goal.scenario.text, budgets })
      const end = await harness.endState()
      if (end.snapshot) await store.putSnapshot(attempt.id, 'end', end.snapshot)
      const verification = await verifyAttempt({ run, attempt: { ...attempt, status: 'active', startedAt }, task, store, request, ...(end.workspace && { workspace: end.workspace }) })
      const outage = ran.infrastructure && verification.status !== 'correct'
      const state = verification.status === 'correct' ? 'verified' : outage || verification.status === 'unknown' ? 'unknown' : 'stopped'
      const trial: Trial = {
        index,
        attempt: attempt.id,
        state,
        claimedDone: ran.claimedDone,
        verification,
        ...(state === 'stopped' && { stoppedBy: stopLine(ran, verification) }),
        ...(outage && { infrastructure: ran.infrastructure }),
        recovered: ran.hadError && state === 'verified',
        cost: ran.cost,
        sideEffects: end.sideEffects ?? [],
        behaviours: ran.behaviours,
        transcript: ran.transcript,
      }
      const { transcript, ...summary } = trial
      const transcriptBlob = await store.putBlob(attempt.id, 'transcript', new TextEncoder().encode(JSON.stringify(transcript)), 'application/json')
      await store.updateAttempt(attempt.id, {
        status: 'finished', reason: ran.claimedDone ? 'done' : 'gave up', endedAt: new Date().toISOString(), verification,
        answers: { [TRIAL_ANSWER]: summary, [TRANSCRIPT_ANSWER]: transcriptBlob },
      })
      trials.push(trial)
      input.onTrial?.(trial)
    }
  } finally {
    await request.dispose()
    await harness.dispose()
  }
  return trials
}
