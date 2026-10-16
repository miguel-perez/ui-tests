import metadata from '../public/sessions/sessions.json'

/** One recorded moment, in the words of the attempt view: what happened, the rest of its row, the page, and the run's problem it shows. */
export type Moment = { timestamp: string; seconds: number; actualSeconds?: number; kind: string; what: string; rest?: string; route?: string; issue?: number; at?: number[] }
export type Impact = 'wrong end state' | 'blocked' | 'slowed' | 'confused'
/** A moment that got in the way of this attempt: its clip's seconds, the sentence about the design, where, the words tied to it and the smallest change. */
export type Blocker = { n: number; problem: number; impact: Impact; from: number; to: number; poster: string; title: string; where: string; said: { when: string; text: string } | null; change: string }
export type Reached = 'yes' | 'no' | "couldn't tell"
export type Ended = 'done' | "can't do it" | 'ran out of time' | 'withdrew' | 'left'
/** One person trying one goal (docs/discovery/reporting-schema-research.md, the Attempt table). */
export type Attempt = {
  id: string; number: number; person: string; source: string; today: string; device: string; browser: string; window: string
  reached: Reached; ended: Ended; time: number; sure: number; ease: number; afterGoals: { help: number; easy: number }
  consent: { screen: boolean; voice: boolean; camera: boolean }; words: string; wordsWhere?: string; endState: string
  video: string; poster: string; posterAt?: string; videoSeconds: number | null; moments: Moment[]; blockers?: Blocker[]
}
export type Run = { label: string; run: string; goal: string; date: string; people: number; yourPath: string[]; check: string; expects: string; attempts: Attempt[] }

export const run = metadata as Run
export const attempt = (id: string) => run.attempts.find(entry => entry.id === id)!

export const reachedLabel: Record<Reached, string> = { yes: 'Yes', no: 'No', "couldn't tell": "Couldn't tell" }
export const endedLabel: Record<Ended, string> = { done: 'Pressed Done', "can't do it": "Pressed Can't do it", 'ran out of time': 'Ran out of time', withdrew: 'Withdrew', left: 'Left' }
/** Wrong, and sure: did not reach the goal yet rated themselves 7 of 7 sure (MeasuringU, UI disasters). Nothing at 6 or below. */
export const wrongAndSure = (entry: Attempt) => entry.reached === 'no' && entry.sure === 7
/** The run-level lines: how many reached the goal, and how many were wrong and sure. */
export const reachedCount = run.attempts.filter(entry => entry.reached === 'yes').length
export const wrongAndSureCount = run.attempts.filter(wrongAndSure).length
/** The typical (median) answer to a 1-to-n question across the run. */
export function typical(values: number[]) { const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 }

export const seconds = (timestamp: string) => { const [m, s] = timestamp.split(':').map(Number); return m * 60 + s }
/** 00:03, as on a recording. */
export const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`
/** 1:03, as a time of day on the attempt. */
export const short = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`
/** 1 min 3 s: time on this goal. */
export const spoken = (value: number) => value >= 60 ? `${Math.floor(value / 60)} min ${value % 60} s` : `${value} s`

/** The colour a moment's kind is drawn in: one kind, one hue (results-views audit, rule 1). Routine moments stay ink. */
export const signal: Record<string, 'stop' | 'path' | 'dead' | 'ended' | undefined> = { stopped: 'stop', 'off-path': 'path', 'went-back': 'path', 'no-effect': 'dead', ended: 'ended' }
/** The impact label on the index and the card: wrong end state, or slowed / confused with the seconds it cost. */
export function impactLabel(blocker: Blocker, separator = ' ') {
  if (blocker.impact === 'wrong end state') return 'Wrong end state'
  const word = blocker.impact[0].toUpperCase() + blocker.impact.slice(1)
  return blocker.impact === 'blocked' ? word : `${word}${separator}${blocker.to - blocker.from} s`
}
