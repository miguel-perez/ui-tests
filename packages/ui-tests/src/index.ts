import { isDeepStrictEqual } from 'node:util'
import type { Users } from './screener.ts'
export type { Users, UserFacts } from './screener.ts'

/** The end state of an attempt: the final URL and the serialised DOM. */
export type Snapshot = { url: string; dom: string }
/** What a hook can inspect: the stored snapshot through `page`, and one validation question through `participant.answer()`. */
export type Evidence = { page: { url(): string; query(selector: string): { textContent: string | null } | null; textContent(selector: string): Promise<string | undefined> }; participant: { answer(question: string, options: { choices: string[]; expected: string }): Promise<string> } }
/** An outcome or task check executed by the CLI against stored evidence, never in the app. */
export type Hook = (evidence: Evidence) => void | Promise<void>
/** Goal options: where the person lands, the happy path, a time box, a pinned scenario, fixture names and the `catch` intent. */
export type Options = { start?: string; happyPath?: string[]; minutes?: number; scenario?: string; fixtures?: string[]; catch?: { affecting: string; confidence: number } }
/** An authored goal with its options, task steps, outcome hooks and source location. */
export type Goal = { name: string; options: Options; tasks: { name: string; check?: Hook }[]; outcomes: Hook[]; source: string }
/** Fixture values for one attempt, returned by `beforeEach`: names and data the scenario card may use. */
export type Fixtures = Record<string, string | number | boolean>
/** The impression stage: on by default; `false` turns it off; `{ page }` flashes another page than the first goal's start. */
export type Impression = false | { page?: string }
/** What the author writes in `context()`: who the people are (a sentence, or the sentence under `are` with how to check it), their purpose, whether to add screen video, and the impression stage. */
export type ContextInput = { users: Users; purpose: string; video?: boolean; impression?: Impression; author?: string }
/** An authored context: its input, the fixture setup and the goals declared in its body. */
export type Context = ContextInput & { goals: Goal[]; setup?: () => Fixtures | Promise<Fixtures>; fixtures?: Fixtures; source: string }
let contexts: Context[] = []
let activeContext: Context | undefined
let activeGoal: Goal | undefined
/** Finds the authoring call site: the first stack frame inside a `*.ui.test` file, or a generic label. */
function source() { return new Error().stack?.split('\n').find(line => /\.ui\.test\./.test(line))?.trim() ?? 'authoring context' }
/** Clears the authored contexts so a test file can be evaluated again from scratch. */
export function resetContexts() { contexts = []; activeContext = undefined; activeGoal = undefined }
/** Returns every context authored since the last reset. */
export function getContexts() { return contexts }
/** The participant chrome the author sets: the one accent for Done, the selected answers and the task label (a `#rrggbb` colour), and the name the consent and questions use (default: the author). */
export type ChromeConfig = { accent?: string; name?: string }
/** The pull-request check: `block_on: 'problems'` sends `failure` when problems are found (the default is always `neutral`); `comment: false` turns the sticky comment off. */
export type CheckConfig = { block_on?: 'problems'; comment?: boolean }
/** Identity helper that types `ui-tests.config.ts`: the target URL, an optional author name, the chrome's accent, the paid panel's cap per run (`budget.max`, including the 25% reserve) and the pull-request check's settings. */
export function defineConfig<T extends { target: { url: string }; author?: string; chrome?: ChromeConfig; budget?: { max: number; currency?: string }; check?: CheckConfig }>(config: T): T { return config }
/** Declares a context. The body runs immediately and registers goals against this context. */
export function context(input: ContextInput, body: () => void) {
  const previous = activeContext
  const entry: Context = { ...input, goals: [], source: source() }
  contexts.push(entry); activeContext = entry
  try { body() } finally { activeContext = previous }
}
/** Provisions each attempt's fixture and returns the names and data the scenario card may use, such as `{ colleague: 'Sam', email: 'sam@acme.co' }`. */
export function beforeEach(setup: () => Fixtures | Promise<Fixtures>) {
  if (!activeContext) throw new Error('beforeEach must be inside context')
  activeContext.setup = setup
}
/** Runs each context's `beforeEach` once so the compiler can write the card from its values; a rehearsal uses the same values. */
export async function resolveFixtures(list: Context[] = contexts) {
  for (const c of list) if (c.setup && !c.fixtures) c.fixtures = await c.setup()
  return list
}
/** Declares a goal inside the current context. Accepts options and a body, or only a body; the body registers tasks and the outcome. */
export function goal(name: string, optionsOrBody: Options | (() => void) = {}, body?: () => void) {
  if (!activeContext) throw new Error('goal must be inside context')
  const entry: Goal = { name, options: typeof optionsOrBody === 'function' ? {} : optionsOrBody, tasks: [], outcomes: [], source: source() }
  activeContext.goals.push(entry)
  const previous = activeGoal; activeGoal = entry
  try { (typeof optionsOrBody === 'function' ? optionsOrBody : body)?.() } finally { activeGoal = previous }
}
/** Adds a step shown to the participant one at a time, with an optional check run against that step's snapshot. */
export function task(name: string, check?: Hook) {
  if (!activeGoal) throw new Error('task must be inside goal')
  activeGoal.tasks.push({ name, check })
}
/** Registers the hook that verifies the goal's end state. Lint allows one outcome per goal. */
export function outcome(check: Hook) {
  if (!activeGoal) throw new Error('outcome must be inside goal')
  activeGoal.outcomes.push(check)
}
/** Thrown by `expect` when an assertion fails; carries the expected and actual values for the trace diff. */
export class AssertionFailure extends Error {
  constructor(public actual: unknown, public expected: unknown, public operator: string) { super(`${operator}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`) }
}
/** Thrown when a hook has no evidence to assert against; the verifier reports that it couldn't tell rather than that the goal was not reached. */
export class MissingEvidence extends Error {}
/** A small assertion API over snapshot evidence. An `undefined` value means missing evidence, not a failure. */
export function expect(actual: unknown) {
  /** Throws `MissingEvidence` for undefined evidence and `AssertionFailure` when the assertion does not hold. */
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
