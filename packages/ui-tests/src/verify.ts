import { parseHTML } from 'linkedom'
import { AssertionFailure, MissingEvidence, type Goal, type Hook, type Snapshot } from './index.ts'
import type { Event, Run } from './storage.ts'

/** The verdict of one hook: correct, incorrect with a diff, or unknown with a reason and possibly a pending validation question. */
export type HookResult = { status: 'correct' | 'incorrect' | 'unknown'; reason?: string; diff?: { expected: unknown; actual: unknown }; question?: { question: string; choices: string[]; expected: string } }
/** Runs one hook against a snapshot, exposing a DOM query and the participant's recorded answers. Assertion failures become `incorrect`; missing evidence becomes `unknown`. */
async function execute(hook: Hook, snapshot: Snapshot | undefined, answers: Record<string, string> = {}): Promise<HookResult> {
  if (!snapshot?.url || !snapshot.dom) return { status: 'unknown', reason: 'Missing end-state snapshot' }
  try {
    const { document } = parseHTML(snapshot.dom)
    await hook({ page: { url: () => snapshot.url, query: selector => document.querySelector(selector) }, participant: { answer: async (question, options) => {
      if (!options.choices.includes(options.expected) || options.choices.length < 2) throw new Error('A validation question needs an expected answer and distractors')
      if (!(question in answers)) throw Object.assign(new MissingEvidence('Participant validation answer needed'), { question: { question, ...options } })
      return answers[question]
    } } })
    return { status: 'correct' }
  } catch (error) {
    if (error instanceof AssertionFailure) return { status: 'incorrect', reason: error.message, diff: { expected: error.expected, actual: error.actual } }
    if (error instanceof MissingEvidence) return { status: 'unknown', reason: error.message, question: (error as MissingEvidence & { question?: HookResult['question'] }).question }
    return { status: 'unknown', reason: error instanceof Error ? error.message : String(error) }
  }
}
/** Runs the goal's outcome and task checks against the stored evidence, then applies the terminal-reason and happy-path rules. Returns the outcome result with per-task results. */
export async function verify(run: Run, goal: Goal, events: Event[] = []) {
  const compiled = run.context.goals[run.goalIndex]
  let result: HookResult = goal.outcomes[0] ? await execute(goal.outcomes[0], run.snapshot, run.answers) : { status: 'unknown', reason: 'Issues-only exploration: no outcome' }
  const tasks = await Promise.all(goal.tasks.map(async (task, index): Promise<HookResult & { name: string }> => ({ name: task.name, ...(task.check ? await execute(task.check, events.find(e => e.type === 'step' && e.step === index)?.snapshot, run.answers) : { status: 'unknown', reason: 'No check authored' }) })))
  const finalPath = run.snapshot ? new URL(run.snapshot.url).pathname : undefined
  if (goal.outcomes.length && run.reason && run.reason !== 'done') result = { status: 'incorrect', reason: `Terminal reason: ${run.reason}` }
  else if (goal.outcomes.length && compiled.happyPath?.length && finalPath && finalPath !== compiled.happyPath.at(-1)) result = { status: 'incorrect', reason: 'Final URL differs from the happy-path destination', diff: { expected: compiled.happyPath.at(-1), actual: run.snapshot?.url } }
  else if (tasks.some(task => task.status === 'incorrect')) result = { status: 'incorrect', reason: 'A task check failed' }
  else if (tasks.some((task, index) => task.status === 'unknown' && goal.tasks[index].check)) result = { status: 'unknown', reason: 'Evidence for a task check is missing', question: tasks.find(task => task.question)?.question }
  return { ...result, tasks }
}
/** Derives the first issue signals from one attempt: giving up or timing out, dead clicks, pauses over five seconds, URLs off the happy path and an SEQ of 3 or below. */
export function issues(run: Run, events: Event[]) {
  const happyPath = run.context.goals[run.goalIndex].happyPath
  const found: { kind: string; at: number; detail: string }[] = []
  if (run.reason && run.reason !== 'done') found.push({ kind: run.reason, at: run.endedAt ?? run.startedAt, detail: `Attempt ${run.reason}` })
  for (const event of events) {
    if (event.type === 'click' && event.changed === false) found.push({ kind: 'dead click', at: event.at, detail: `Nothing changed within 300 ms after clicking ${event.target}` })
    if (event.type === 'pause' && (event.duration ?? 0) > 5000) found.push({ kind: 'pause', at: event.at, detail: `Paused for ${Math.round(event.duration! / 1000)} seconds` })
    if (event.type === 'url' && happyPath && !happyPath.includes(new URL(event.url).pathname)) found.push({ kind: 'deviation', at: event.at, detail: `Off the happy path: ${event.url}` })
  }
  if (run.seq && run.seq <= 3) found.push({ kind: 'low SEQ', at: run.endedAt ?? run.startedAt, detail: `Ease rating ${run.seq} of 7` })
  return found
}
