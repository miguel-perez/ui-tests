import type { Impact } from './rank.ts'
export { impacts, ranked, legend, legendLine, caveat, problemsLine, type Impact } from './rank.ts'

/**
 * The pull-request check as the landing draws it (docs/prd/05-integration.md#github; docs/discovery/pull-request-surfaces-research.md):
 * its title in the merge box and the first lines of its page. Illustration only: nothing here talks to GitHub.
 */

/** One problem as the check shows it: the sentence about the design, the page and element, how many people, the impact and the moment to watch. */
export type CheckProblem = { title: string; page: string; locator: string; people: number; impact: Impact; moment?: { person: number; seconds: number; url: string } }
/** What one run says to the pull request. `attempted` below `people` makes it inconclusive. */
export type CheckRun = {
  goal: string; people: number; attempted: number; reached: number
  /** On a goal with a check: pressed Done, but the check failed. */
  pressedDoneFailed?: number
  problems: CheckProblem[]
  /** The report page: the check's Details link. Each problem's moment links into it. */
  reportUrl: string
  /** The footer line: who took part, where it ran, the commit and the date. */
  footer: { people: string; preview: string; commit: string; date: string }
}
/** The author's one opt-in: `block_on: problems` makes the check red when a completed run finds problems; it is never green. */
export type CheckOptions = { block_on?: 'problems' }
export type Outcome = 'problems' | 'none' | 'inconclusive'

/** Inconclusive when fewer attempts completed than the run asked for; otherwise problems, or none. */
export function outcomeOf(run: CheckRun): Outcome {
  if (run.attempted < run.people) return 'inconclusive'
  return run.problems.length ? 'problems' : 'none'
}
/** `output.title`, one line in the merge box. */
export function checkTitle(run: CheckRun) {
  const outcome = outcomeOf(run), n = run.problems.length
  if (outcome === 'inconclusive') return `Inconclusive · only ${run.attempted} of ${run.people} attempts completed`
  if (outcome === 'none') return `No problems found with ${run.people} people · ${run.reached} of ${run.people} reached the goal`
  return `${n} problem${n === 1 ? '' : 's'} found · ${run.reached} of ${run.people} people reached the goal`
}
/** The run's sentence: who tried what, how many reached it, and on a checked goal how many pressed Done though the check failed. */
export function checkSentence(run: CheckRun) {
  const tried = `${run.people} people tried *${run.goal}* on this preview.`
  if (outcomeOf(run) === 'inconclusive') return `${run.people} people were asked to try *${run.goal}* on this preview. Not enough attempts yet: ${run.attempted} of ${run.people} in.`
  const failed = run.pressedDoneFailed ? `; ${run.pressedDoneFailed} of ${run.people} pressed Done, but your check failed` : ''
  return `${tried} ${run.reached} of ${run.people} reached the goal${failed}.`
}
/** What the check promises about the build, which `block_on` changes. */
export function buildLine(options: CheckOptions = {}) {
  return options.block_on === 'problems'
    ? 'This check fails your build when it finds problems (`block_on: problems`). It reports problems, or that none were seen this time.'
    : 'This check never fails your build. It reports problems, or that none were seen this time.'
}
