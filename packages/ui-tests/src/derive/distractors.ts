import { createHash } from 'node:crypto'

const numeric = /^-?\d+(\.\d+)?$/
export const noneOfThese = 'None of these'

/**
 * Wrong answers for a question with `expected`. A number gives its neighbours and double; text gives up to two
 * distinct other strings from `pool`, then one "None of these" if fewer than two were found. `seed` is accepted so
 * callers pass one rule for everything seeded; the choice here is deterministic from the inputs alone.
 */
export function distractors(expected: string, pool: string[], _seed: string): string[] {
  if (numeric.test(expected.trim())) {
    const value = Number(expected)
    return [value - 1, value + 1, value * 2].map(String)
  }
  const picked: string[] = []
  for (const candidate of pool) if (candidate !== expected && !picked.includes(candidate) && picked.length < 2) picked.push(candidate)
  if (picked.length < 2 && expected !== noneOfThese) picked.push(noneOfThese)
  return picked
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
