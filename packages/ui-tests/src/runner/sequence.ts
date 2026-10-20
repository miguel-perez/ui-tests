import type { CompiledStudy } from '../schema/compiled.ts'
import type { AttemptRow } from '../store/types.ts'

/**
 * The answers key holding the order in which one link participant attempts the study's goals. The same people attempt every goal
 * (PRD 02): the person has one attempt per goal, made one after the other, and each of them carries the whole order, so the order is
 * recorded per participant and every attempt knows where it stands in it.
 */
export const GOAL_ORDER = 'goalOrder'

/** The index of the goal that carries the study's result. */
export const primaryGoalIndex = (compiled: { goals: { primary: boolean }[] }): number => Math.max(0, compiled.goals.findIndex(g => g.primary))

/** FNV-1a: a small, stable hash of the seed, so the same person always gets the same order. */
function hash(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193)
  return h >>> 0
}

/** Mulberry32: numbers in [0, 1) from a 32-bit seed. */
function random(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The order one participant attempts the goals in: the declared order, or with `independent: true` a shuffle seeded by `seed` (the run and the participant). */
export function goalOrderFor(compiled: Pick<CompiledStudy, 'goals' | 'independent'>, seed: string): number[] {
  const order = compiled.goals.map((_, i) => i)
  if (!compiled.independent) return order
  const next = random(hash(seed))
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

/** The stored order of a participant's attempt, when it is one of a sequence (a link invite); undefined for a rehearsal or an agent trial. */
export function storedOrder(attempt: Pick<AttemptRow, 'answers'>): number[] | undefined {
  const order = attempt.answers[GOAL_ORDER]
  return Array.isArray(order) && order.every(i => Number.isInteger(i)) ? (order as number[]) : undefined
}

/** Where this attempt stands among the goals its person does: its position and how many there are. Without a stored order, the declared order. */
export function placeOf(compiled: Pick<CompiledStudy, 'goals'>, attempt: Pick<AttemptRow, 'answers' | 'goalIndex'>): { position: number; of: number } {
  const order = storedOrder(attempt) ?? compiled.goals.map((_, i) => i)
  return { position: Math.max(0, order.indexOf(attempt.goalIndex)), of: order.length }
}

/** The goal this participant does after this attempt, when the attempt is one of a sequence and not its last. */
export function nextGoalOf(attempt: Pick<AttemptRow, 'answers' | 'goalIndex'>): number | undefined {
  const order = storedOrder(attempt)
  if (!order) return undefined
  const at = order.indexOf(attempt.goalIndex)
  return at >= 0 && at + 1 < order.length ? order[at + 1] : undefined
}
