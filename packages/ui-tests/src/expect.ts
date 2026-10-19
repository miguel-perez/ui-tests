import { isDeepStrictEqual } from 'node:util'

/** Thrown by `expect` when an assertion fails; carries the expected and actual values for the trace diff. */
export class AssertionFailure extends Error {
  constructor(public actual: unknown, public expected: unknown, public operator: string) { super(`${operator}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`) }
}
/** Thrown when a hook has no evidence to assert against; the verifier reports `unknown` rather than `incorrect`. */
export class MissingEvidence extends Error {}
/** A small assertion API over snapshot evidence. An `undefined` value means missing evidence, not a failure. */
export function expect(actual: unknown) {
  /** Throws `MissingEvidence` for undefined evidence and `AssertionFailure` when the assertion does not hold. */
  function check(ok: boolean, expected: unknown, operator: string) {
    if (actual === undefined) throw new MissingEvidence('Evidence is missing')
    if (!ok) throw new AssertionFailure(actual, expected, operator)
  }
  return {
    toBe(expected: unknown) { check(Object.is(actual, expected), expected, 'toBe') },
    toEqual(expected: unknown) { check(isDeepStrictEqual(actual, expected), expected, 'toEqual') },
    toContain(expected: unknown) { check((typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected)) || (Array.isArray(actual) && actual.includes(expected)), expected, 'toContain') },
    toContainEqual(expected: unknown) { check(Array.isArray(actual) && actual.some(value => isDeepStrictEqual(value, expected)), expected, 'toContainEqual') },
    toExist() { check(actual !== null && actual !== undefined, 'exists', 'toExist') },
    toBeTruthy() { check(Boolean(actual), 'truthy', 'toBeTruthy') },
  }
}
