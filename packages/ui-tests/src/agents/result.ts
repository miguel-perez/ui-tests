/** Where a stored trial attempt keeps its summary (the trial without its transcript). Kept here so the record can read it without the loop. */
export const TRIAL_ANSWER = 'agent.trial'
/** An agent trial's participant id on its attempt row: `agent:<task>:<trial>`. Never an invite slot of a human run. */
export const TRANSCRIPT_ANSWER = 'agent.transcript'
export const AGENT_PARTICIPANT = 'agent:'
export const agentParticipant = (goalIndex: number, trial: number) => `${AGENT_PARTICIPANT}${goalIndex}:${trial}`
export const isAgentTrial = (participant: string) => participant.startsWith(AGENT_PARTICIPANT)

/** The heading every agent result is printed under. */
export const AGENT_HEADING = 'capability test, not usability'
/** Trials per task when the task sets none. */
export const DEFAULT_TRIALS = 5

export type TrialState = 'verified' | 'stopped' | 'unknown'
export type AgentVerdict = { result: 'pass' | 'fail' | 'inconclusive'; passK: boolean; passAtK: boolean }

/**
 * The result of a task's trials (PRD 04). `all` (pass^k, the default): pass if every trial verified, fail if any stopped,
 * inconclusive if any is unknown and none stopped. `any` (pass@k): pass if one verified, else fail if any stopped, else inconclusive.
 * `passK` and `passAtK` are reported either way; only the reliability decides the result. Callers read no verdict from fewer than k trials.
 */
export function agentResult(trials: { state: TrialState }[], reliability: 'all' | 'any'): AgentVerdict {
  const count = (state: TrialState) => trials.filter(t => t.state === state).length
  const passK = trials.length > 0 && count('verified') === trials.length
  const passAtK = count('verified') > 0
  const result = reliability === 'any'
    ? passAtK ? 'pass' : count('unknown') ? 'inconclusive' : 'fail'
    : count('stopped') ? 'fail' : count('unknown') || !trials.length ? 'inconclusive' : 'pass'
  return { result, passK, passAtK }
}

/** The run's result for a set of task results: a stopped task is a problem, an unread one is inconclusive, else none was found. Never `pending`. */
export function runResultOf(results: AgentVerdict['result'][]): 'problems-found' | 'none-found' | 'inconclusive' {
  if (results.includes('fail')) return 'problems-found'
  if (results.includes('inconclusive') || !results.length) return 'inconclusive'
  return 'none-found'
}
