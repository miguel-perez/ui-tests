import { isDeepStrictEqual } from 'node:util'

export type Snapshot = { url: string; dom: string }
export type Evidence = { page: { url(): string; query(selector: string): { textContent: string | null } | null }; participant: { answer(question: string, options: { choices: string[]; expected: string }): Promise<string> } }
export type Hook = (evidence: Evidence) => void | Promise<void>
export type Options = { happyPath?: string[]; minutes?: number; scenario?: string; fixtures?: string[]; catch?: { affecting: string; confidence: number } }
export type Goal = { name: string; options: Options; tasks: { name: string; check?: Hook }[]; outcomes: Hook[]; source: string }
export type Context = { users: string; purpose: string; author?: string; goals: Goal[]; source: string }
let contexts: Context[] = []
let activeContext: Context | undefined
let activeGoal: Goal | undefined
function source() { return new Error().stack?.split('\n').find(line => /\.ui\.test\./.test(line))?.trim() ?? 'authoring context' }
export function resetContexts() { contexts = []; activeContext = undefined; activeGoal = undefined }
export function getContexts() { return contexts }
export function defineConfig<T extends { target: { url: string }; author?: string }>(config: T): T { return config }
export function context(input: { users: string; purpose: string; author?: string }, body: () => void) {
  const previous = activeContext
  const entry: Context = { ...input, goals: [], source: source() }
  contexts.push(entry); activeContext = entry
  try { body() } finally { activeContext = previous }
}
export function goal(name: string, optionsOrBody: Options | (() => void) = {}, body?: () => void) {
  if (!activeContext) throw new Error('goal must be inside context')
  const entry: Goal = { name, options: typeof optionsOrBody === 'function' ? {} : optionsOrBody, tasks: [], outcomes: [], source: source() }
  activeContext.goals.push(entry)
  const previous = activeGoal; activeGoal = entry
  try { (typeof optionsOrBody === 'function' ? optionsOrBody : body)?.() } finally { activeGoal = previous }
}
export function task(name: string, check?: Hook) {
  if (!activeGoal) throw new Error('task must be inside goal')
  activeGoal.tasks.push({ name, check })
}
export function outcome(check: Hook) {
  if (!activeGoal) throw new Error('outcome must be inside goal')
  activeGoal.outcomes.push(check)
}
export class AssertionFailure extends Error {
  constructor(public actual: unknown, public expected: unknown, public operator: string) { super(`${operator}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`) }
}
export class MissingEvidence extends Error {}
export function expect(actual: unknown) {
  function check(ok: boolean, expected: unknown, operator: string) {
    if (actual === undefined) throw new MissingEvidence('Evidence is missing')
    if (!ok) throw new AssertionFailure(actual, expected, operator)
  }
  return {
    toContain(expected: string) { check(typeof actual === 'string' && actual.includes(expected), expected, 'toContain') },
    toBe(expected: unknown) { check(isDeepStrictEqual(actual, expected), expected, 'toBe') },
    toExist() { check(actual !== null && actual !== undefined, 'exists', 'toExist') },
    toContainEqual(expected: unknown) { check(Array.isArray(actual) && actual.some(value => isDeepStrictEqual(value, expected)), expected, 'toContainEqual') },
  }
}
