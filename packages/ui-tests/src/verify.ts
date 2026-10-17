import { parseHTML } from 'linkedom'
import { AssertionFailure, MissingEvidence, type Goal, type Hook, type Snapshot } from './index.ts'
import type { Event, Reason, Run } from './storage.ts'

/** Whether the person reached the goal, as the check decided: yes, no (with a diff), or couldn't tell (the check had no evidence). */
export type Reached = 'yes' | 'no' | "couldn't tell"
/** The verdict of one hook: reached yes, no with a diff, or couldn't tell with a reason and possibly a pending validation question. */
export type HookResult = { reached: Reached; reason?: string; diff?: { expected: unknown; actual: unknown }; question?: { question: string; choices: string[]; expected: string } }
const yesNo: Record<Reached, string> = { yes: 'Yes', no: 'No', "couldn't tell": "Couldn't tell" }
/** The line the CLI prints for an attempt: "Reached the goal: Yes", "No" or "Couldn't tell", or pending before the check has run. */
export function reachedLine(result?: HookResult) { return `Reached the goal: ${result?.reached ? yesNo[result.reached] : 'pending'}` }
/** Runs one hook against a snapshot, exposing a DOM query and the participant's recorded answers. Assertion failures become `no`; missing evidence becomes `couldn't tell`. */
async function execute(hook: Hook, snapshot: Snapshot | undefined, answers: Record<string, string> = {}): Promise<HookResult> {
  if (!snapshot?.url || !snapshot.dom) return { reached: "couldn't tell", reason: 'Missing end-state snapshot' }
  try {
    const { document } = parseHTML(snapshot.dom)
    await hook({ page: { url: () => snapshot.url, query: selector => document.querySelector(selector), textContent: async selector => document.querySelector(selector)?.textContent ?? undefined }, participant: { answer: async (question, options) => {
      if (!options.choices.includes(options.expected) || options.choices.length < 2) throw new Error('A validation question needs an expected answer and distractors')
      if (!(question in answers)) throw Object.assign(new MissingEvidence('Participant validation answer needed'), { question: { question, ...options } })
      return answers[question]
    } } })
    return { reached: 'yes' }
  } catch (error) {
    if (error instanceof AssertionFailure) return { reached: 'no', reason: error.message, diff: { expected: error.expected, actual: error.actual } }
    if (error instanceof MissingEvidence) return { reached: "couldn't tell", reason: error.message, question: (error as MissingEvidence & { question?: HookResult['question'] }).question }
    return { reached: "couldn't tell", reason: error instanceof Error ? error.message : String(error) }
  }
}
/** Runs the goal's outcome and task checks against the stored evidence, then applies the terminal-reason and happy-path rules. Returns the outcome result with per-task results. */
export async function verify(run: Run, goal: Goal, events: Event[] = []) {
  const compiled = run.context.goals[run.goalIndex]
  let result: HookResult = goal.outcomes[0] ? await execute(goal.outcomes[0], run.snapshot, run.answers) : { reached: "couldn't tell", reason: 'Issues-only exploration: no outcome' }
  const tasks = await Promise.all(goal.tasks.map(async (task, index): Promise<HookResult & { name: string }> => ({ name: task.name, ...(task.check ? await execute(task.check, events.find(e => e.type === 'step' && e.step === index)?.snapshot, run.answers) : { reached: "couldn't tell", reason: 'No check authored' }) })))
  const finalPath = run.snapshot ? new URL(run.snapshot.url).pathname : undefined
  if (goal.outcomes.length && run.reason && run.reason !== 'done') result = { reached: 'no', reason: `How it ended: ${ended[run.reason]}` }
  else if (goal.outcomes.length && compiled.happyPath?.length && finalPath && finalPath !== compiled.happyPath.at(-1)) result = { reached: 'no', reason: 'They ended on a different page from the last page of your path', diff: { expected: compiled.happyPath.at(-1), actual: run.snapshot?.url } }
  else if (tasks.some(task => task.reached === 'no')) result = { reached: 'no', reason: 'A task check failed' }
  else if (tasks.some((task, index) => task.reached === "couldn't tell" && goal.tasks[index].check)) result = { reached: "couldn't tell", reason: 'Evidence for a task check is missing', question: tasks.find(task => task.question)?.question }
  return { ...result, tasks }
}
/** How an attempt ended, in the report's words. */
export const ended: Record<Reason, string> = { done: 'pressed Done', "couldn't do this": "pressed I couldn't do this", 'abandoned early': 'left before trying', 'ran out of time': 'ran out of time' }
/** Derives the first problem signals from one attempt, in the attempt view's words: how it ended when not by Done, actions with no effect, stops over five seconds, pages off your path and an ease rating of 3 or below. */
export function issues(run: Run, events: Event[]) {
  const happyPath = run.context.goals[run.goalIndex].happyPath
  const found: { kind: string; at: number; detail: string }[] = []
  if (run.reason && run.reason !== 'done') found.push({ kind: 'how it ended', at: run.endedAt ?? run.startedAt, detail: `How it ended: ${ended[run.reason]}` })
  for (const event of events) {
    if (event.type === 'click' && event.changed === false) found.push({ kind: 'nothing happened', at: event.at, detail: `Clicked ${event.target}, nothing happened` })
    if (event.type === 'pause' && (event.stoppedMs ?? 0) > 5000) found.push({ kind: 'stopped', at: event.at, detail: `Stopped ${Math.round(event.stoppedMs! / 1000)} s` })
    if (event.type === 'url' && happyPath && !happyPath.includes(new URL(event.url).pathname)) found.push({ kind: 'off your path', at: event.at, detail: `Off your path · opened ${new URL(event.url).pathname}` })
  }
  if (run.seq && run.seq <= 3) found.push({ kind: 'not easy', at: run.endedAt ?? run.startedAt, detail: `How easy was it? ${run.seq} of 7 (7 = very easy)` })
  return found
}
