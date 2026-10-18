import { isDeepStrictEqual } from 'node:util'
import type { Users } from './screener.ts'
export type { Users, UserFacts } from './screener.ts'

/** The end state of an attempt: the final URL and the serialised DOM. */
export type Snapshot = { url: string; dom: string }
/**
 * Playwright's `request` against the target (an `APIRequestContext` with the target as its base URL), as `setup` and `outcome`
 * receive it. Typed structurally so the authoring API does not load Playwright; the CLI passes the real one.
 */
export type Request = { get(url: string, options?: object): Promise<Response>; post(url: string, options?: object): Promise<Response>; put(url: string, options?: object): Promise<Response>; patch(url: string, options?: object): Promise<Response>; delete(url: string, options?: object): Promise<Response>; fetch(url: string, options?: object): Promise<Response> }
/** What Playwright's `request` returns: the status and the body. */
export type Response = { ok(): boolean; status(): number; json(): Promise<any>; text(): Promise<string> }
/** The values `setup` returned for this attempt: `start`, the attempt's first URL, and the card's fill-ins. */
export type Fixtures = Record<string, string | number | boolean>
/**
 * What an outcome can inspect: the app's state through `request`, with `setup` the values this attempt's `setup` returned; the page the
 * person ended on through `page` (its URL and stored DOM); and one validation question through `participant.answer()`.
 */
export type Evidence = { request: Request; setup: Fixtures; page: { url(): string; query(selector: string): { textContent: string | null } | null; textContent(selector: string): Promise<string | undefined> }; participant: { answer(question: string, options: { choices: string[]; expected: string }): Promise<string> } }
/** An outcome executed by the CLI after the attempt, against the app's state and the stored evidence, never in the app. */
export type Hook = (evidence: Evidence) => void | Promise<void>
/** The first look: on when the start is a public page; `false` turns it off; `{ page }` names the public page to flash instead. */
export type FirstLook = false | { page?: string }
/** Task options: the expected route (it sets nothing else), the silent time limit (default three minutes), the first look and a pinned scenario. */
export type TaskOptions = { path?: string[]; timeLimit?: string; scenario?: string; firstLook?: FirstLook }
/** An authored task with its options, outcome hook and source location; `legacy` records old option names for lint. */
export type Goal = { name: string; options: TaskOptions; outcomes: Hook[]; source: string; legacy?: Record<string, true> }
/** The sample for the whole study: a problem affecting this share of people (1 / 3), noticed at this confidence (0.85); five people by default. */
export type Sample = { affecting?: number | string; confidence?: number }
/** What the author writes in `study()`: who the people are, their purpose, how many people and whether to record the screen as video. */
export type StudyOptions = { users: Users; purpose: string; sample?: Sample; record?: 'video'; author?: string }
/** `setup` runs once per attempt with Playwright's `request` against the target and returns `{ start, ...values }`. */
export type SetupHook = (handle: { request: Request }) => Promise<Fixtures> | Fixtures
/** An authored study: its name and options, the attempt setup and the tasks declared in its body; `legacy` records old names for lint. */
export type Context = StudyOptions & { name: string; goals: Goal[]; setup?: SetupHook; fixtures?: Fixtures; source: string; legacy?: Record<string, true> }
let contexts: Context[] = []
let activeContext: Context | undefined
let activeGoal: Goal | undefined
/** Finds the authoring call site: the first stack frame inside a `*.ui.test` file, or a generic label. */
function source() { return new Error().stack?.split('\n').find(line => /\.ui\.test\./.test(line))?.trim() ?? 'authoring context' }
/** Clears the authored studies so a test file can be evaluated again from scratch. */
export function resetContexts() { contexts = []; activeContext = undefined; activeGoal = undefined }
/** Returns every study authored since the last reset. */
export function getContexts() { return contexts }
/** The participant chrome the author sets: the one accent for Done, the selected answers and the task label (a `#rrggbb` colour), and the name the consent and questions use (default: the author). */
export type ChromeConfig = { accent?: string; name?: string }
/** The pull-request check: `block_on: 'problems'` sends `failure` when problems are found (the default is always `neutral`); `comment: false` turns the sticky comment off. */
export type CheckConfig = { block_on?: 'problems'; comment?: boolean }
/** Identity helper that types `ui-tests.config.ts`: the target URL, an optional author name, the chrome's accent, the paid panel's cap per run (`budget.max`, including the reserve) and the pull-request check's settings. */
export function defineConfig<T extends { target: { url: string }; author?: string; chrome?: ChromeConfig; budget?: { max: number; currency?: string }; check?: CheckConfig }>(config: T): T { return config }
/** Old option names that still load, so lint can name the replacement: on the study, then on the task. */
const legacyStudyKeys = ['video', 'impression', 'catch', 'start', 'happyPath'] as const
const legacyTaskKeys = ['happyPath', 'minutes', 'start', 'catch', 'impression', 'video', 'fixtures', 'sample'] as const
/** Moves any old option name out of the options and into `legacy`, so the compiler never sees it and lint reports it. */
function sortOptions<T extends object>(options: T, keys: readonly string[]) {
  const kept = { ...options } as Record<string, unknown>, legacy: Record<string, true> = {}
  for (const key of keys) if (key in kept) { legacy[key] = true; delete kept[key] }
  return { kept: kept as T, legacy }
}
/** Declares a study: its name, who the people are, their purpose, the sample and the recording. The body runs immediately and registers its setup and tasks. */
export function study(name: string, options: StudyOptions, body: () => void) {
  const previous = activeContext
  const { kept, legacy } = sortOptions(options ?? {} as StudyOptions, legacyStudyKeys)
  const entry: Context = { ...kept, name, goals: [], source: source(), ...(Object.keys(legacy).length ? { legacy } : {}) }
  contexts.push(entry); activeContext = entry
  try { body() } finally { activeContext = previous }
}
/** The old name for `study`: it still loads, and lint fails with the fix naming `study`. */
export function context(options: StudyOptions, body: () => void) {
  study('', options, body)
  const entry = contexts[contexts.length - 1]
  entry.legacy = { ...entry.legacy, context: true }
}
/**
 * Provisions each attempt: runs once per attempt, before the person starts, with Playwright's `request` against the target, and
 * returns `{ start, ...values }`. `start` is the attempt's first URL; the other values are the scenario card's fill-ins and reach the
 * outcome as `setup`.
 */
export function setup(hook: SetupHook) {
  if (!activeContext) throw new Error('setup must be inside study')
  activeContext.setup = hook
}
/** The old name for `setup`: it still loads, and lint fails with the fix naming `setup`. */
export function beforeEach(hook: SetupHook) {
  if (!activeContext) throw new Error('setup must be inside study')
  setup(hook)
  activeContext.legacy = { ...activeContext.legacy, beforeEach: true }
}
/** A `request` for code that runs without a target: every call fails with the reason, which the caller reports. */
export const offline: Request = new Proxy({} as Request, { get: () => async () => { throw new Error('setup and outcome need the target: run npx ui-tests with your app running') } })
/** Checks what `setup` returned: an object of strings, numbers and booleans, with `start` a path or a URL when given. */
export function checkFixtures(values: unknown): Fixtures {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('setup must return an object such as { start, colleague, email }')
  for (const [key, value] of Object.entries(values)) if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error(`setup returned ${key} as ${typeof value}; return strings, numbers and booleans`)
  const start = (values as Fixtures).start
  if (start !== undefined && (typeof start !== 'string' || !(start.startsWith('/') || URL.canParse(start)))) throw new Error('setup returned a start that is neither a path nor a URL')
  return values as Fixtures
}
/** Runs a study's `setup` for one attempt with the given `request`; a study without `setup` gets no values. */
export async function runSetup(c: Context, request: Request = offline) { return c.setup ? checkFixtures(await c.setup({ request })) : {} }
/** Runs each study's `setup` once and keeps its values on the study, for a caller that has a `request` (or a setup that needs none). */
export async function resolveFixtures(list: Context[] = contexts, request: Request = offline) {
  for (const c of list) if (c.setup && !c.fixtures) c.fixtures = await runSetup(c, request)
  return list
}
/** Declares a task inside the current study: its name, the path you expect, the time limit and the first look. The body registers the outcome. */
export function task(name: string, optionsOrBody?: TaskOptions | (() => void), body?: () => void) {
  if (!activeContext) throw new Error('task must be inside study')
  // The old steps inside a goal are gone: a study lists its tasks, one outcome each.
  if (activeGoal) throw new Error(`task('${name}') is inside another task: list the tasks in the study, one outcome each`)
  const { kept, legacy } = sortOptions(typeof optionsOrBody === 'function' ? {} : optionsOrBody ?? {}, legacyTaskKeys)
  const entry: Goal = { name, options: kept, outcomes: [], source: source(), ...(Object.keys(legacy).length ? { legacy } : {}) }
  activeContext.goals.push(entry)
  const previous = activeGoal; activeGoal = entry
  try { (typeof optionsOrBody === 'function' ? optionsOrBody : body)?.() } finally { activeGoal = previous }
}
/** The old name for `task`: it still loads, and lint fails with the fix naming `task`. */
export function goal(name: string, optionsOrBody?: TaskOptions | (() => void), body?: () => void) {
  if (!activeContext) throw new Error('task must be inside study')
  task(name, optionsOrBody, body)
  activeContext.legacy = { ...activeContext.legacy, goal: true }
}
/** Registers the outcome: the check, run after the attempt against the app's state, of whether the person reached the goal. Lint allows one per task. */
export function outcome(check: Hook) {
  if (!activeGoal) throw new Error('outcome must be inside task')
  activeGoal.outcomes.push(check)
}
/** Thrown by `expect` when an assertion fails; carries the expected and actual values for the trace diff. */
export class AssertionFailure extends Error {
  constructor(public actual: unknown, public expected: unknown, public operator: string) { super(`${operator}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`) }
}
/** Thrown when a hook has no evidence to assert against; the verifier reports that it couldn't tell rather than that the goal was not reached. */
export class MissingEvidence extends Error {}
/** A small assertion API over the evidence. An `undefined` value means missing evidence, not a failure. */
export function expect(actual: unknown) {
  /** Throws `MissingEvidence` for undefined evidence and `AssertionFailure` when the assertion does not hold. */
  function check(ok: boolean, expected: unknown, operator: string) {
    if (actual === undefined) throw new MissingEvidence('Evidence is missing')
    if (!ok) throw new AssertionFailure(actual, expected, operator)
  }
  return {
    /** A string that contains the text, or an array that holds the value. */
    toContain(expected: unknown) { check(typeof actual === 'string' ? typeof expected === 'string' && actual.includes(expected) : Array.isArray(actual) && actual.includes(expected), expected, 'toContain') },
    toBe(expected: unknown) { check(isDeepStrictEqual(actual, expected), expected, 'toBe') },
    toExist() { check(actual !== null && actual !== undefined, 'exists', 'toExist') },
    toContainEqual(expected: unknown) { check(Array.isArray(actual) && actual.some(value => isDeepStrictEqual(value, expected)), expected, 'toContainEqual') },
  }
}
