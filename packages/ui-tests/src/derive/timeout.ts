import type { AuthoredTask } from '../authoring.ts'

export const secondsPerStep = 90
export const timeoutFloorSeconds = 180

/** Parses "3 min", "90 s", "2 minutes", "1 hour" into seconds. */
export function parseDuration(text: string): number | undefined {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)\s*$/i.exec(text)
  if (!match) return undefined
  const unit = match[2].toLowerCase()[0]
  return Math.round(Number(match[1]) * (unit === 's' ? 1 : unit === 'm' ? 60 : 3600))
}

/**
 * The silent limit on a task: `timeLimit`, else `minutes` for a time-boxed task, else the path-or-step count
 * times 90 seconds with a floor of 3 minutes (PRD 01, Derived).
 */
export function goalTimeout(task: AuthoredTask): { seconds: number; rule: string } {
  const { timeLimit, minutes, path } = task.options
  if (timeLimit !== undefined) {
    const seconds = parseDuration(timeLimit)
    if (seconds === undefined) throw new Error(`task "${task.name}": cannot read timeLimit "${timeLimit}"; write it like "3 min"`)
    return { seconds, rule: `timeLimit "${timeLimit}"` }
  }
  if (minutes !== undefined && !task.outcomes.length && !task.steps.length && !path?.length) return { seconds: minutes * 60, rule: `${minutes} minutes of exploring` }
  const count = path?.length ?? task.steps.length
  const raw = count * secondsPerStep
  const seconds = Math.max(timeoutFloorSeconds, raw)
  return { seconds, rule: `${count} ${path?.length ? 'path pages' : 'steps'} x ${secondsPerStep} seconds, floor ${timeoutFloorSeconds / 60} minutes` }
}
