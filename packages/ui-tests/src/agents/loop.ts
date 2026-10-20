import { request as playwrightRequest, type APIRequestContext } from 'playwright-core'
import type { AuthoredStudy } from '../authoring.ts'
import { runSetup } from '../runner/setup.ts'
import type { CompiledGoal } from '../schema/compiled.ts'
import type { RunRow, RunStore, Verification } from '../store/types.ts'
import { verifyAttempt } from '../verify.ts'
import type { AgentConfig } from './config.ts'
import type { AgentMessage, AgentModel, Harness } from './model.ts'

/** One agent trial of a task, as PRD 04 reads it. */
export type Trial = {
  index: number
  /** The stored attempt that holds this trial's end state, transcript and verdict (its trace). */
  attempt: string
  /** `verified`: the hook said correct. `stopped`: it said incorrect. `unknown`: it could not read its evidence. */
  state: 'verified' | 'stopped' | 'unknown'
  /** The agent said it was done. Claimed done and stopped is a false success. */
  claimedDone: boolean
  verification: Verification
  /** What stopped a `stopped` trial, in one line. */
  stoppedBy?: string
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

export const DEFAULT_SYSTEM = [
  'You are using a product through the tools you are given, to get one task done.',
  'Use only those tools. Nobody can answer questions while you work: decide for yourself.',
  'When the task is done, say so in one short line without calling a tool. If you cannot do it, say what stopped you.',
].join(' ')

const NO_ANSWER = 'Nobody can answer questions during this trial. Decide for yourself and carry on, or say that you cannot do it.'

/** One line of at most 200 characters. */
export const oneLine = (text: string) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 200 ? `${line.slice(0, 199)}…` : line
}
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

type LoopEnd = { claimedDone: boolean; note?: string; hadError: boolean; lastFailed?: string; behaviours: string[]; cost: Trial['cost']; transcript: AgentMessage[] }

/** Runs the agent on one trial until it says it is done, declines, fails, or runs out of budget. */
async function runAgent(input: { model: AgentModel; harness: Harness; system: string; prompt: string; budgets: NonNullable<AgentConfig['budgets']> }): Promise<LoopEnd> {
  const { model, harness, budgets } = input
  const started = Date.now()
  const transcript: AgentMessage[] = [{ role: 'user', text: input.prompt }]
  const behaviours: string[] = []
  const cost: Trial['cost'] = { tokens: 0, calls: 0, wallMs: 0 }
  let hadError = false
  let lastFailed: string | undefined
  let questions = 0
  let toolIds = 0
  const end = (claimedDone: boolean, note?: string): LoopEnd => {
    cost.wallMs = Date.now() - started
    return { claimedDone, ...(note && { note }), hadError, ...(lastFailed && { lastFailed }), behaviours, cost, transcript }
  }
  for (;;) {
    if (budgets.calls !== undefined && cost.calls >= budgets.calls) return end(false, `ran out of its budget of ${budgets.calls} model calls`)
    if (budgets.tokens !== undefined && cost.tokens >= budgets.tokens) return end(false, `ran out of its budget of ${budgets.tokens} tokens`)
    if (budgets.seconds !== undefined && Date.now() - started >= budgets.seconds * 1000) return end(false, `ran out of its budget of ${budgets.seconds} seconds`)
    if (budgets.dollars !== undefined && (cost.dollars ?? 0) >= budgets.dollars) return end(false, `ran out of its budget of $${budgets.dollars}`)
    let step
    try {
      cost.calls++
      step = await model.step({ system: input.system, messages: transcript, tools: harness.tools() })
    } catch (error) {
      return end(false, `the model failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    cost.tokens += step.usage.inputTokens + step.usage.outputTokens
    if (step.usage.dollars !== undefined) cost.dollars = (cost.dollars ?? 0) + step.usage.dollars
    const toolCalls = step.toolCalls.map(call => ({ ...call, id: call.id ?? `call_${++toolIds}` }))
    transcript.push({ role: 'assistant', ...(step.text !== undefined && { text: step.text }), toolCalls, ...(step.raw !== undefined && { raw: step.raw }) })
    if (step.stop === 'refusal') return end(false, step.text?.trim() ? `declined the task: ${step.text.trim()}` : 'declined the task')
    if (toolCalls.length) {
      for (const call of toolCalls) {
        let result: { output: string; error?: string }
        try { result = await harness.call(call.name, call.input) } catch (error) {
          result = { output: '', error: `called ${call.name}, which failed: ${error instanceof Error ? error.message : String(error)}` }
        }
        transcript.push({ role: 'tool', id: call.id, name: call.name, output: result.output, ...(result.error && { error: result.error }) })
        if (result.error) { hadError = true; lastFailed = result.error } else lastFailed = undefined
      }
      continue
    }
    // A question with nothing done about it is a behaviour to report, not a failure: the agent is told to go on.
    if (step.text?.trim().endsWith('?')) {
      behaviours.push(`asked: ${oneLine(step.text)}`)
      if (++questions >= MAX_QUESTIONS) return end(false, `asked ${MAX_QUESTIONS} questions and did not go on`)
      transcript.push({ role: 'user', text: NO_ANSWER })
      continue
    }
    return end(true)
  }
}

/** The one line that says what stopped a trial: the failed call it ended on, else why the loop ended, else the verdict. */
function stopLine(run: LoopEnd, verification: Verification): string {
  if (run.lastFailed) return oneLine(run.lastFailed)
  if (run.note) return oneLine(run.note)
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
  /** Where the hooks' `request` points; default: an http target's URL, else the run's target. */
  requestFactory?: (baseURL: string) => Promise<APIRequestContext>
}

/**
 * Runs the goal's trials (default 5), one after another, each from a reset harness: the scenario text is the agent's
 * prompt. Each trial is stored as an attempt with its end state and transcript, then verified by the task's hooks
 * against that end state. `runTrials` owns the harness: it disposes it at the end.
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
  const request = await (input.requestFactory ?? (url => playwrightRequest.newContext({ baseURL: url })))(baseURL)
  const trials: Trial[] = []
  try {
    for (let index = 1; index <= count; index++) {
      await harness.reset()
      const setupValues = await runSetup(study, baseURL)
      const { attempt } = await store.createAttempt({ runId: run.run, participant: `agent:${goal.index}:${index}`, goalIndex: goal.index, rehearsal: run.rehearsal, setupValues })
      const startedAt = new Date().toISOString()
      await store.updateAttempt(attempt.id, { status: 'active', startedAt })
      const ran = await runAgent({ model, harness, system, prompt: goal.scenario.text, budgets })
      const end = await harness.endState()
      if (end.snapshot) await store.putSnapshot(attempt.id, 'end', end.snapshot)
      const verification = await verifyAttempt({ run, attempt: { ...attempt, status: 'active', startedAt }, task, store, request, ...(end.workspace && { workspace: end.workspace }) })
      const state = verification.status === 'correct' ? 'verified' : verification.status === 'incorrect' ? 'stopped' : 'unknown'
      const trial: Trial = {
        index,
        attempt: attempt.id,
        state,
        claimedDone: ran.claimedDone,
        verification,
        ...(state === 'stopped' && { stoppedBy: stopLine(ran, verification) }),
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
    }
  } finally {
    await request.dispose()
    await harness.dispose()
  }
  return trials
}
