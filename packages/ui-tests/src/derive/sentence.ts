import { articleFor, detectionChance, numberWord, sampleSentence } from './sample.ts'

export { sampleSentence }
export type Result = 'pending' | 'problems-found' | 'none-found' | 'inconclusive'
export type Verified = 'correct' | 'incorrect' | 'unknown'

/**
 * The run's result. Stays `pending` until n attempts are counted or the deadline has passed. Then any incorrect
 * is `problems-found`; else any unknown, or fewer than n attempts, is `inconclusive`; else `none-found`.
 */
export function resultOf(input: { n: number; verified: Verified[]; deadlinePassed: boolean }): Result {
  const { n, verified, deadlinePassed } = input
  if (verified.length < n && !deadlinePassed) return 'pending'
  if (verified.includes('incorrect')) return 'problems-found'
  if (verified.includes('unknown') || verified.length < n) return 'inconclusive'
  return 'none-found'
}

function hits(affecting: number) {
  const k = 1 / affecting
  return Math.abs(k - Math.round(k)) < 1e-9 ? `one in ${numberWord(Math.round(k))}` : `${Number((affecting * 100).toFixed(1))}% of people`
}
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

type Figures = { attempted: number; reached: number; failed: number; unknown: number }
type SentenceInput = Figures & {
  n: number; affecting: number; shape: 'goal-only' | 'happy-path' | 'steps' | 'time-boxed'; result: Result; rehearsal: boolean; goal: string
  /** A study that samples several groups: each group's own figures and quota. The sentence is said per group, never pooled. */
  groups?: (Figures & { name: string; quota: number })[]
}

/**
 * The one sentence a result may say. Only the leading number word is spelled; counts stay digits. The figures are the check title's
 * (`resultFigures`): `attempted` counted in the result, of whom `reached` reached the outcome, `failed` did not and `unknown` could not be read.
 * With several groups each group gets its own clause, of its own n (its quota) and its own figures, because the detection chance assumes
 * one group (Sauro); one group reads as it always has.
 */
export function sentence(input: SentenceInput): string {
  const { affecting, shape, result, rehearsal, goal, groups } = input
  const route = shape === 'steps' ? 'completed the steps' : 'reached the outcome by their own route'
  if (groups && groups.length > 1) {
    const each = (clause: (g: Figures & { n: number }) => string) => groups.map(g => `${g.name}: ${clause({ ...g, n: g.quota })}`).join(' ')
    if (rehearsal) return `Rehearsal: 0 planned attempts recorded (${groups.map(g => `${g.name} 0 of ${g.quota}`).join(', ')}).`
    switch (result) {
      case 'pending': return each(g => sampleSentence(g.n, affecting))
      case 'none-found': return `${each(g => `${noneSeen(g.n, affecting)}`)} That is not a completion rate.`
      case 'problems-found': return each(g => `${g.failed} of ${g.n} could not ${goal}; ${g.reached} of ${g.n} ${route}.`)
      case 'inconclusive': return `Inconclusive. ${each(g => `${g.attempted} of ${g.n} attempts completed${g.unknown ? `, ${g.unknown} of them could not be verified` : ''}.`)} That is not enough to say whether a problem that hits ${hits(affecting)} was there.`
    }
  }
  const { n, attempted, reached, failed, unknown } = input
  if (rehearsal) return `Rehearsal: 0 of ${n} planned attempts recorded.`
  switch (result) {
    case 'pending': return sampleSentence(n, affecting)
    case 'none-found': return `${noneSeen(n, affecting)} That is not a completion rate.`
    case 'problems-found': return `${failed} of ${n} could not ${goal}; ${reached} of ${n} ${route}.`
    case 'inconclusive': return `Inconclusive: ${attempted} of ${n} attempts completed${unknown ? `, ${unknown} of them could not be verified` : ''}, which is not enough to say whether a problem that hits ${hits(affecting)} was there.`
  }
}

/** "Five people gave an 87% chance of seeing any problem that hits one in three; none was seen." */
function noneSeen(n: number, affecting: number): string {
  const chance = Math.round(detectionChance(affecting, n) * 100)
  return `${cap(numberWord(n))} ${n === 1 ? 'person' : 'people'} gave ${articleFor(chance)} ${chance}% chance of seeing any problem that hits ${hits(affecting)}; none was seen.`
}
