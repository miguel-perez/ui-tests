import { createHash } from 'node:crypto'

/** A count: a whole number from 0 to 999 written without leading zeros, whose neighbours are plausible wrong answers. */
const count = /^(0|[1-9]\d{0,2})$/

/**
 * The wrong answers for a count: the nearest whole numbers to it, none below zero. Undefined for anything else (a year, a price, a
 * code, text), whose distractors the author writes or the model drafts into the snapshot.
 */
export function neighbours(expected: string): string[] | undefined {
  if (!count.test(expected)) return undefined
  const value = Number(expected)
  return (value === 0 ? [1, 2, 3] : [value - 1, value + 1, value + 2]).map(String)
}

/**
 * Whether `choice` can stand as a wrong answer beside `expected`: a non-blank string that is not the expected answer, ignoring case and
 * surrounding spaces, so no blank choice and no second copy of the right answer reaches a participant.
 */
export function isWrongAnswer(choice: unknown, expected: string): choice is string {
  return typeof choice === 'string' && choice.trim() !== '' && choice.trim().toLowerCase() !== expected.trim().toLowerCase()
}

function random(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The answer choices in display order: the expected answer among its distractors, shuffled the same way for the same seed. */
export function shuffleChoices(expected: string, wrong: string[], seed: string): string[] {
  const choices = [expected, ...wrong.filter((choice, i) => choice !== expected && wrong.indexOf(choice) === i)]
  const next = random(seed)
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]]
  }
  return choices
}
