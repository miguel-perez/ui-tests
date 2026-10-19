import metadata from '../public/sessions/sessions.json'

/** One recorded moment, in the words of the attempt view: what happened, the rest of its row, the page, and the run's problem it shows. */
export type Moment = { timestamp: string; seconds: number; actualSeconds?: number; kind: string; what: string; rest?: string; route?: string; issue?: number; at?: number[] }
export type Impact = 'wrong end state' | 'blocked' | 'slowed' | 'confused'
/** A moment that got in the way of this attempt: its clip's seconds, the sentence about the design, where, the words tied to it and the smallest change. */
export type Blocker = { n: number; problem: number; impact: Impact; from: number; to: number; poster: string; title: string; where: string; said: { when: string; text: string } | null; change: string }
export type Reached = 'yes' | 'no' | "couldn't tell"
export type Ended = 'done' | "couldn't do this" | 'ran out of time' | 'withdrew' | 'left'
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

/** Wrong, and sure: did not reach the goal yet rated themselves 7 of 7 sure (MeasuringU, UI disasters). Nothing at 6 or below. */
export const wrongAndSure = (entry: Attempt) => entry.reached === 'no' && entry.sure === 7

/** 00:03, as on a recording. */
export const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`

