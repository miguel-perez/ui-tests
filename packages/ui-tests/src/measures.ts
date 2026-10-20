/** The wording the two UX-Lite items had when they were asked; kept with the score so a later wording change is visible. */
export const UXLITE_VERSION = 'uxlite-2024'

type Point = 1 | 2 | 3 | 4 | 5

/** Each item becomes `(response - 1) x 25`, so 1 is 0 and 5 is 100; the score is the mean of the two. */
export function uxLite(useful: Point, easy: Point): { useful: number; easy: number; score: number } {
  const item = (response: number) => (response - 1) * 25
  return { useful: item(useful), easy: item(easy), score: (item(useful) + item(easy)) / 2 }
}

/** What a time is taken from: how long an attempt lasted, and whether its outcome was verified correct. */
export type TimedAttempt = { durationMs?: number; verified?: boolean }

const median = (values: number[]) => {
  if (!values.length) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Median time over every attempt that has one, and over those verified correct. A median, never a geometric mean. */
export function medians(attempts: TimedAttempt[]): { allMs?: number; verifiedMs?: number } {
  const timed = attempts.filter((a): a is TimedAttempt & { durationMs: number } => typeof a.durationMs === 'number' && a.durationMs >= 0)
  const all = median(timed.map((a) => a.durationMs))
  const verified = median(timed.filter((a) => a.verified).map((a) => a.durationMs))
  return { ...(all !== undefined && { allMs: all }), ...(verified !== undefined && { verifiedMs: verified }) }
}
