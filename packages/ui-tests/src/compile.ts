import type { AuthoredStudy, AuthoredTask } from './authoring.ts'
import { detectionChance, sampleSentence, sampleSize } from './derive/sample.ts'
import { goalTimeout } from './derive/timeout.ts'
import { contextId, validateUsers } from './derive/users.ts'
import { compiledSchemaUrl, type CompiledGoal, type CompiledQuestion, type CompiledStudy } from './schema/compiled.ts'
import type { UiTestsConfig, Users } from './types.ts'

export { compiledStudySchema, compiledSchemaUrl } from './schema/compiled.ts'
export type { CompiledConsent, CompiledGoal, CompiledImpression, CompiledQuestion, CompiledStudy } from './schema/compiled.ts'
export { sampleSize, detectionChance } from './derive/sample.ts'
export { goalTimeout } from './derive/timeout.ts'
export { validateUsers, contextId } from './derive/users.ts'

type Derivation = CompiledStudy['derivations'][number]

function normalizeUsers(users: Users): CompiledStudy['users'] {
  const fields = typeof users === 'string' ? { are: users } : users
  const { where, uses, not, ...rest } = fields
  return { ...rest, ...(where !== undefined && { where }), ...(uses && { uses }), ...(not && { not }) } as CompiledStudy['users']
}
function hostname(url: string) { try { return new URL(url).hostname } catch { return url } }
function sentence(text: string) { return text.charAt(0).toUpperCase() + text.slice(1) }

/** The primary task: the one marked `primary`, else the only one with an outcome, else the first. */
function primaryOf(tasks: AuthoredTask[]): AuthoredTask | undefined {
  return tasks.find(t => t.options.primary) ?? (tasks.filter(t => t.outcomes.length).length === 1 ? tasks.find(t => t.outcomes.length) : undefined) ?? tasks[0]
}

function goalQuestions(index: number, task: AuthoredTask): CompiledQuestion[] {
  const ease: CompiledQuestion = { id: `goal${index}.ease`, text: 'Overall, how difficult or easy did you find this task?', type: 'scale', points: 7 }
  const questions: CompiledQuestion[] = [ease, { id: `goal${index}.difficulty`, text: 'What made it difficult?', type: 'open', askIf: { id: ease.id, atOrBelow: 4 } }]
  if (!task.outcomes.length && !task.answer) questions.push({ id: `goal${index}.confidence`, text: 'How confident are you that you finished the task?', type: 'scale', points: 7 })
  return questions
}

/** Turns an authored study and the config into the JSON context every other part of the system reads. */
export function compileStudy(study: AuthoredStudy, config: UiTestsConfig): CompiledStudy {
  const users = normalizeUsers(study.options.users)
  const { errors } = validateUsers(study.options.users)
  if (errors.length) throw new Error(`study "${study.name}": ${errors.map(e => `${e.field}: ${e.message}`).join('; ')}`)
  if (!study.tasks.length) throw new Error(`study "${study.name}" has no tasks`)
  const derivations: Derivation[] = []
  const derive = (field: string, rule: string, source: string) => derivations.push({ field, rule, source })

  const purpose = study.options.purpose ?? ''
  const id = contextId(study.options.users, purpose)
  derive('id', 'slug of the "are" sentence and the purpose, each cut to 40 characters, joined with an ellipsis', 'users.are, purpose')
  const label = purpose ? `${users.are}, ${purpose}` : users.are
  derive('label', '"users, purpose"', 'users.are, purpose')

  const sampleOptions = study.options.sample ?? { affecting: 1 / 3, confidence: 0.85 }
  const n = sampleSize(sampleOptions.affecting, sampleOptions.confidence)
  derive('sample.n', `smallest n with 1 - (1 - ${sampleOptions.affecting})^n >= ${sampleOptions.confidence}${study.options.sample ? '' : ' (default sample)'}`, 'sample')
  derive('sample.sentence', `${Math.round(detectionChance(sampleOptions.affecting, n) * 100)}% chance that ${n} people include one the problem hits`, 'sample.affecting, sample.n')

  const record = study.options.record ?? 'events'
  derive('record', study.options.record ? 'as authored' : 'events unless record is video', 'record')
  const actors = (study.options.actors ?? ['human']) as CompiledStudy['actors']
  derive('actors', study.options.actors ? 'as authored' : 'human unless actors says otherwise', 'actors')
  const product = config.product ?? hostname(config.target?.url ?? 'http://localhost:3000')
  derive('product', config.product ? 'config product' : 'hostname of the target url', 'config.product, config.target.url')
  derive('environment', study.options.environment ? 'as authored' : 'the target url', 'environment, config.target.url')
  derive('author', config.author ? 'config author' : 'empty when config has no author', 'config.author')

  const primary = primaryOf(study.tasks)
  derive('goals[].primary', 'the task marked primary, else the only task with an outcome, else the first', 'task.primary, task.outcome')

  const goals: CompiledGoal[] = study.tasks.map((task, index) => {
    const { path, start, minutes, scenario } = task.options
    const hasOutcome = task.outcomes.length > 0
    const shape: CompiledGoal['shape'] = task.steps.length ? 'steps' : path?.length ? 'happy-path' : minutes !== undefined && !hasOutcome ? 'time-boxed' : 'goal-only'
    const startFrom: CompiledGoal['startFrom'] = start ? 'option' : study.setup ? 'setup' : path?.length ? 'path' : 'root'
    const timeout = goalTimeout(task)
    const at = `goals[${index}]`
    derive(`${at}.shape`, shape === 'steps' ? 'the task has steps' : shape === 'happy-path' ? 'the task has a path' : shape === 'time-boxed' ? 'minutes and no outcome' : 'an outcome or answer only', 'task.steps, task.path, task.minutes, task.outcome')
    derive(`${at}.start`, start ? 'task start' : path?.length ? 'the first page of path' : 'the root page', 'task.start, task.path')
    derive(`${at}.startFrom`, start ? 'task start' : study.setup ? 'setup returns the start at run time' : path?.length ? 'path' : 'default', 'task.start, setup, task.path')
    derive(`${at}.timeout`, timeout.rule, 'task.timeLimit, task.path, task.steps')
    derive(`${at}.scenario`, scenario ? 'as authored' : 'the task name as an instruction', 'task.scenario, task.name')
    derive(`${at}.questions`, 'ease, then what made it difficult at 4 or below; confidence only without outcome or answer', 'task.outcome, task.answer')
    return {
      index,
      name: task.name,
      shape,
      start: start ?? path?.[0] ?? '/',
      startFrom,
      scenario: scenario ? { text: scenario, pinned: true } : { text: `Try to ${task.name}.`, pinned: false },
      steps: task.steps.map(s => ({ name: s.name, hasCheck: Boolean(s.check) })),
      ...(path && { path }),
      ...(task.answer && { answer: { question: task.answer.question, choices: [task.answer.expected, ...(task.answer.distractors ?? [])], expected: task.answer.expected } }),
      hasOutcome,
      timeout,
      ...(minutes !== undefined && { minutes }),
      primary: task === primary,
      questions: goalQuestions(index, task),
    }
  })

  const firstLook = study.options.firstLook ?? primary?.options.firstLook
  const startFromSetup = Boolean(study.setup)
  const impression: CompiledStudy['impression'] = firstLook === false || (firstLook === undefined && startFromSetup)
    ? { enabled: false }
    : { enabled: true, page: firstLook?.page ?? goals.find(g => g.primary)?.start ?? '/', flashMs: 500, question: 'What was that page for?', codes: ['named the purpose', 'did not name it', 'no answer'] }
  derive('impression', firstLook === false ? 'firstLook is false' : firstLook ? 'firstLook page as authored' : startFromSetup ? 'off when the start comes from setup' : 'on at the primary start page', 'firstLook, setup')

  const questions: CompiledQuestion[] = [
    { id: 'useful', text: `Would ${product} be useful to you?`, type: 'scale', points: 7 },
    { id: 'easy', text: `${product} is easy to use.`, type: 'scale', points: 7 },
    { id: 'anything', text: `Anything you want to tell ${product}?`, type: 'open' },
  ]
  derive('questions', 'asked once after all goals, with the product name', 'config.product')
  derive('consent', 'retention 90 days; workflows from config', 'config.consent')

  return {
    schema: compiledSchemaUrl,
    id,
    name: study.name,
    label,
    users,
    purpose,
    environment: study.options.environment ?? config.target?.url ?? 'http://localhost:3000',
    product,
    author: config.author ?? '',
    record,
    actors,
    sample: { affecting: sampleOptions.affecting, confidence: sampleOptions.confidence, n, sentence: sampleSentence(sampleOptions.affecting, n) },
    impression,
    screener: [],
    goals,
    questions,
    consent: { workflows: config.consent?.workflows ?? false, retentionDays: 90, purposes: [] },
    derivations,
  }
}
