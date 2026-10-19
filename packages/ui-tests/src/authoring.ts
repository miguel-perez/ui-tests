import type { Hook, SetupFn, StudyOptions, TaskOptions } from './types.ts'

export type AuthoredTask = { name: string; options: TaskOptions; steps: { name: string; check?: Hook; line: number }[]; outcomes: Hook[]; answer?: { question: string; expected: string; distractors?: string[] }; line: number }
export type AuthoredStudy = { name: string; options: StudyOptions; setup?: SetupFn; tasks: AuthoredTask[]; file: string; line: number; legacy: string[] }

let studies: AuthoredStudy[] = []
let activeStudy: AuthoredStudy | undefined
let activeTask: AuthoredTask | undefined

/** Old option names and the new name each one is replaced by; lint reports these. */
const legacyOptions: Record<string, string> = { happyPath: 'path', catch: 'sample', impression: 'firstLook', screen: 'users', video: "record: 'video'" }

/** Finds the authoring call site: the first stack frame outside this module, as file and line. */
function site(): { file: string; line: number } {
  for (const frame of (new Error().stack ?? '').split('\n').slice(1)) {
    const match = /\(?((?:file:\/\/)?[^()\s]+?):(\d+):\d+\)?$/.exec(frame.trim())
    if (match && !/authoring\.ts$/.test(match[1])) return { file: match[1].replace(/^file:\/\//, ''), line: Number(match[2]) }
  }
  return { file: '', line: 0 }
}
function legacyIn(options: object, where: string) {
  return Object.keys(options).filter(key => key in legacyOptions).map(key => `${where}: "${key}" is now "${legacyOptions[key]}"`)
}
/** Clears the authored studies so a test file can be evaluated again from scratch. */
export function resetStudies() { studies = []; activeStudy = undefined; activeTask = undefined }
/** Returns every study authored since the last reset. */
export function getStudies() { return studies }
/** Declares a study. The body runs immediately and registers setup and tasks against it. */
export function study(name: string, options: StudyOptions, fn: () => void) {
  const entry: AuthoredStudy = { name, options, tasks: [], ...site(), legacy: legacyIn(options, `study "${name}"`) }
  studies.push(entry)
  const previous = activeStudy; activeStudy = entry
  try { fn() } finally { activeStudy = previous }
}
/** Registers the function that prepares each attempt's world; at most one per study. */
export function setup(fn: SetupFn) {
  if (!activeStudy) throw new Error('setup must be inside study')
  activeStudy.setup = fn
}
/**
 * Declares a task inside a study, or a step when called inside a task body. Accepts options and a body, only a body,
 * or (for a step) only a check.
 */
export function task(name: string, optionsOrFnOrCheck?: TaskOptions | (() => void) | Hook, fn?: () => void) {
  const { line } = site()
  if (activeTask) {
    activeTask.steps.push({ name, check: typeof optionsOrFnOrCheck === 'function' ? optionsOrFnOrCheck as Hook : undefined, line })
    return
  }
  if (!activeStudy) throw new Error('task must be inside study')
  const options = typeof optionsOrFnOrCheck === 'object' ? optionsOrFnOrCheck : {}
  const entry: AuthoredTask = { name, options, steps: [], outcomes: [], line }
  activeStudy.tasks.push(entry)
  activeStudy.legacy.push(...legacyIn(options, `task "${name}"`))
  const body = typeof optionsOrFnOrCheck === 'function' ? optionsOrFnOrCheck as () => void : fn
  activeTask = entry
  try { body?.() } finally { activeTask = undefined }
}
/** Registers the hook that verifies the task's end state. */
export function outcome(hook: Hook) {
  if (!activeTask) throw new Error('outcome must be inside task')
  activeTask.outcomes.push(hook)
}
/** Registers a question the participant answers after Done, checked against the expected answer. */
export const participant = {
  answer(question: string, options: { expected: string; distractors?: string[] }) {
    if (!activeTask) throw new Error('participant.answer must be inside task')
    activeTask.answer = { question, ...options }
  },
}
