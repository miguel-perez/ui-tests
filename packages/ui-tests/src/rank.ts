/** What a problem did to the people who hit it, worst first (Rubin via Sauro; Nielsen's high, medium, low). */
export const impacts = ['blocked', 'slowed', 'confused'] as const
export type Impact = (typeof impacts)[number]
export type Problem = { title: string; people: number; impact?: Impact }
/** Problems ranked by impact, then by how many people hit them; ties keep their order. */
export function ranked<T extends Problem>(problems: T[]): T[] {
  const order = (problem: T) => problem.impact ? impacts.indexOf(problem.impact) : impacts.length
  return problems.map((problem, index) => ({ problem, index })).sort((a, b) => order(a.problem) - order(b.problem) || b.problem.people - a.problem.people || a.index - b.index).map(entry => entry.problem)
}
/** The impact legend, on first use wherever a run's problems are shown (report-presentation research, label fixes). */
export const legend: [Impact, string][] = [['blocked', 'kept them from the goal'], ['slowed', 'cost them time'], ['confused', 'did something that had no effect']]
export const legendLine = legend.map(([impact, meaning]) => `${impact[0].toUpperCase()}${impact.slice(1)} ${meaning}`).join(' · ')
/** The detection caveat, in the words the report closes on. */
export const caveat = 'Found automatically from what people did; it can miss problems. Watch the clips.'
/** "Problems found: 4, seen across all 5 people.": the count, and across how many of the people (report-presentation research, label fixes). */
export function problemsLine(report: { people: number; seenBy?: number; problems: unknown[] }) {
  const found = `Problems found: ${report.problems.length}`
  if (report.seenBy === undefined) return `${found} with ${report.people} people.`
  return `${found}, seen across ${report.seenBy === report.people ? `all ${report.people}` : `${report.seenBy} of ${report.people}`} people.`
}
