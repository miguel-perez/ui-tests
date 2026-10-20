import type { CompiledGoal } from './schema/compiled.ts'
import type { AttemptRow, RecordedEvent, Verification } from './store/types.ts'

export type Signal = {
  kind: 'gave-up' | 'timeout' | 'dead-click' | 'repeated-click' | 'pause' | 'deviation' | 'backtrack' | 'false-done' | 'low-ease'
  at: number
  url?: string
  target?: string
  detail: string
}

const pauseOverMs = 5000
const repeatWithinMs = 2000
const lowEase = 3

const pathOf = (url: string) => new URL(url, 'http://placeholder').pathname.replace(/(.)\/$/, '$1')

/** The issue signals one attempt shows on its own: give-up, dead and repeated clicks, pauses, deviation, backtracking, false Done and low ease. */
export function attemptSignals(input: { attempt: AttemptRow; events: RecordedEvent[]; goal: CompiledGoal; verification?: Verification }): Signal[] {
  const { attempt, goal, verification } = input
  const events = [...input.events].sort((x, y) => x.at - y.at)
  const signals: Signal[] = []
  const endedAt = attempt.endedAt ? Date.parse(attempt.endedAt) : events.at(-1)?.at ?? 0
  const endUrl = events.at(-1)?.url
  if (attempt.reason === 'gave up' || attempt.reason === 'timeout') {
    signals.push({ kind: attempt.reason === 'gave up' ? 'gave-up' : 'timeout', at: endedAt, url: endUrl, detail: attempt.reason === 'gave up' ? 'The participant said they could not do this' : 'The time limit ran out' })
  }
  const onPath = goal.path?.map(pathOf)
  const visited: string[] = []
  let lastClick: RecordedEvent | undefined
  for (const event of events) {
    if (event.type === 'click') {
      if (event.changed === false) signals.push({ kind: 'dead-click', at: event.at, url: event.url, target: event.target, detail: `Nothing changed within 300 ms after clicking ${event.target ?? 'an element'}` })
      if (lastClick && event.target !== undefined && event.target === lastClick.target && event.at - lastClick.at <= repeatWithinMs) signals.push({ kind: 'repeated-click', at: event.at, url: event.url, target: event.target, detail: `Clicked ${event.target} again` })
      lastClick = event
    } else if (event.type === 'pause' && (event.duration ?? 0) > pauseOverMs) {
      signals.push({ kind: 'pause', at: event.at, url: event.url, detail: `Paused for ${Math.round(event.duration! / 1000)} seconds` })
    } else if (event.type === 'url') {
      const page = pathOf(event.url)
      if (page === visited.at(-1)) continue
      if (onPath && !onPath.includes(page)) signals.push({ kind: 'deviation', at: event.at, url: event.url, detail: `Off the path: ${page}` })
      if (visited.length >= 2 && visited.at(-2) === page) signals.push({ kind: 'backtrack', at: event.at, url: event.url, detail: `Went back to ${page}` })
      visited.push(page)
    }
  }
  if (attempt.reason === 'done' && verification?.status === 'incorrect') signals.push({ kind: 'false-done', at: endedAt, url: endUrl, detail: 'The participant said Done but the outcome was not reached' })
  const ease = attempt.answers[`goal${goal.index}.ease`]
  if (typeof ease === 'number' && ease <= lowEase) signals.push({ kind: 'low-ease', at: endedAt, url: endUrl, detail: `Ease rating ${ease} of 7` })
  return signals
}
