import { parseHTML } from 'linkedom'
import { AssertionFailure, MissingEvidence, offline, type Evidence, type Fixtures, type Goal, type Hook, type Request, type Snapshot } from './index.ts'
import type { Event, Reason, Run } from './storage.ts'

/** Whether the person reached the goal, as the check decided: yes, no (with a diff), or couldn't tell (the check had no evidence). */
export type Reached = 'yes' | 'no' | "couldn't tell"
/** The verdict of one hook: reached yes, no with a diff, or couldn't tell with a reason and possibly a pending validation question. */
export type HookResult = { reached: Reached; reason?: string; diff?: { expected: unknown; actual: unknown }; question?: { question: string; choices: string[]; expected: string } }
const yesNo: Record<Reached, string> = { yes: 'Yes', no: 'No', "couldn't tell": "Couldn't tell" }
/** The line the CLI prints for an attempt: "Reached the goal: Yes", "No" or "Couldn't tell", or pending before the check has run. */
export function reachedLine(result?: HookResult) { return `Reached the goal: ${result?.reached ? yesNo[result.reached] : 'pending'}` }
/** Where an outcome reads the app's state: Playwright's `request` against the target, and the values this attempt's `setup` returned. */
export type AppState = { request?: Request; setup?: Fixtures }
/**
 * Runs one outcome against the app's state (`request`, `setup`) and the page the person ended on (`page`, from the stored snapshot),
 * exposing the participant's recorded answers. Assertion failures become `no`; missing evidence, a page the snapshot does not hold or
 * an app that cannot be reached become `couldn't tell`.
 */
async function execute(hook: Hook, snapshot: Snapshot | undefined, answers: Record<string, string> = {}, state: AppState = {}): Promise<HookResult> {
  try {
    const document = snapshot?.dom ? parseHTML(snapshot.dom).document : undefined
    const missing = (): never => { throw new MissingEvidence('Missing end-state snapshot') }
    const page: Evidence['page'] = {
      url: () => snapshot?.url || missing(),
      query: selector => document ? document.querySelector(selector) : missing(),
      textContent: async selector => document ? document.querySelector(selector)?.textContent ?? undefined : missing(),
    }
    await hook({ request: state.request ?? offline, setup: state.setup ?? {}, page, participant: { answer: async (question, options) => {
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
/**
 * Runs the task's outcome after the attempt, against the app's state and whatever page the person ended on; an attempt that ended
 * other than by Done did not reach the goal. The path is only the route you expect: it never decides the result.
 */
export async function verify(run: Run, goal: Goal, _events: Event[] = [], state: AppState = {}): Promise<HookResult> {
  if (!goal.outcomes[0]) return { reached: "couldn't tell", reason: 'Issues-only exploration: no outcome' }
  if (run.reason && run.reason !== 'done') return { reached: 'no', reason: `How it ended: ${ended[run.reason]}` }
  // Before the attempt ends there is nothing to check yet.
  if (!run.snapshot?.url) return { reached: "couldn't tell", reason: 'Missing end-state snapshot' }
  return execute(goal.outcomes[0], run.snapshot, run.answers, { setup: run.setup, ...state })
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
