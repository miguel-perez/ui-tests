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

/** The one sentence a result may say. Only the leading number word is spelled; counts stay digits. */
export function sentence(input: { n: number; affecting: number; shape: 'goal-only' | 'happy-path' | 'steps' | 'time-boxed'; f: number; x: number; result: Result; rehearsal: boolean; goal: string }): string {
  const { n, affecting, shape, f, x, result, rehearsal, goal } = input
  if (rehearsal) return `Rehearsal: 0 of ${n} planned attempts recorded.`
  const chance = Math.round(detectionChance(affecting, n) * 100)
  const people = `${cap(numberWord(n))} ${n === 1 ? 'person' : 'people'}`
  const reached = shape === 'steps' ? 'completed the steps' : 'reached the outcome by their own route'
  switch (result) {
    case 'pending': return sampleSentence(n, affecting)
    case 'none-found': return `${people} gave ${articleFor(chance)} ${chance}% chance of seeing any problem that hits ${hits(affecting)}; none was seen. That is not a completion rate.`
    case 'problems-found': return `${f} of ${n} could not ${goal}; ${x} of ${n} ${reached}.`
    case 'inconclusive': return `Inconclusive: ${x} of ${n} attempts completed, which is not enough to say whether a problem that hits ${hits(affecting)} was there.`
  }
}
