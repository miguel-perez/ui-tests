import { agentFingerprint } from './agents/config.ts'
import { StudyLoadError } from './load.ts'
import type { AuthoredStudy, AuthoredTask } from './authoring.ts'
import { consentText } from './derive/consent.ts'
import { distractors, shuffleChoices } from './derive/distractors.ts'
import { deriveImpression } from './derive/impression.ts'
import { inferUsers } from './derive/infer-users.ts'
import { deriveScreener } from './derive/screener.ts'
import { scenarioTemplate } from './derive/scenario.ts'
import { detectionChance, sampleSentence, sampleSize } from './derive/sample.ts'
import { goalTimeout } from './derive/timeout.ts'
import { contextId, validateUsers } from './derive/users.ts'
import { compiledSchemaUrl, type CompiledGoal, type CompiledQuestion, type CompiledStudy } from './schema/compiled.ts'
import type { Target, UiTestsConfig, Users } from './types.ts'

export { compiledStudySchema, compiledSchemaUrl } from './schema/compiled.ts'
export type { CompiledConsent, CompiledGoal, CompiledImpression, CompiledQuestion, CompiledScreenerQuestion, CompiledStudy } from './schema/compiled.ts'
export { sampleSize, detectionChance } from './derive/sample.ts'
export { goalTimeout } from './derive/timeout.ts'
export { validateUsers, contextId } from './derive/users.ts'
export { scenarioTemplate, fillScenario } from './derive/scenario.ts'
export { distractors, shuffleChoices } from './derive/distractors.ts'
export { consentText, payoutLine } from './derive/consent.ts'
export { deriveImpression } from './derive/impression.ts'
export { deriveScreener, screen, STANDING_EXCLUSION, NONE_OF_THESE } from './derive/screener.ts'
export type { ScreenerQuestion, ScreenerOption, OptionRule } from './derive/screener.ts'
export { inferUsers, printUsersDraft } from './derive/infer-users.ts'
export { fitScore } from './derive/fit.ts'
export type { Fit } from './derive/fit.ts'
export { sentence, resultOf } from './derive/sentence.ts'
export { CARD_FOOTER, START_TASK } from './copy.ts'
export { nullModel } from './model.ts'
export type { TextModel } from './model.ts'

type Derivation = CompiledStudy['derivations'][number]

function normalizeUsers(users: Users): CompiledStudy['users'] {
  const fields = typeof users === 'string' ? { are: users } : users
  const { where, uses, not, ...rest } = fields
  return { ...rest, ...(where !== undefined && { where }), ...(uses && { uses }), ...(not && { not }) } as CompiledStudy['users']
}
const DEFAULT_TRIALS = 5
const targetKinds = [['cli', 'cli'], ['mcp', 'mcp'], ['http', 'http'], ['url', 'web']] as const
/** The first target a task, then its study, then the config names; a task's target replaces the study's whole. */
function agentTarget(...levels: (Target | undefined)[]): { kind: 'web' | 'cli' | 'mcp' | 'http'; value: string; description?: string } {
  for (const level of levels) {
    for (const [key, kind] of targetKinds) { const value = level?.[key]; if (value) return { kind, value, ...(level?.description && { description: level.description }) } }
  }
  return { kind: 'web', value: 'http://localhost:3000' }
}
function hostname(url: string) { try { return new URL(url).hostname } catch { return url } }

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
  try { return compile(study, config) } catch (error) {
    if (error instanceof StudyLoadError) throw error
    throw new StudyLoadError(error instanceof Error ? error.message : String(error), study.file, study.line, error)
  }
}

function compile(study: AuthoredStudy, config: UiTestsConfig): CompiledStudy {
  const { errors } = validateUsers(study.options.users)
  if (errors.length) throw new Error(`study "${study.name}": ${errors.map(e => `${e.field}: ${e.message}`).join('; ')}`)
  const users = normalizeUsers(typeof study.options.users === 'string' ? inferUsers(study.options.users).users : study.options.users)
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
  if (actors.includes('agent')) {
    derive('goals[].agent', 'the task target, else the study target, else the config target; 5 trials and reliability all unless the task says otherwise', 'task.target, task.trials, task.reliability, study.target, config.target')
    derive('agents', 'config agents, pinned with a fingerprint so any change is a different run', 'config.agents')
  }
  const product = config.product ?? hostname(config.target?.url ?? 'http://localhost:3000')
  derive('product', config.product ? 'config product' : 'hostname of the target url', 'config.product, config.target.url')
  derive('environment', study.options.environment ? 'as authored' : 'the target url', 'environment, config.target.url')
  derive('author', config.author ? 'config author' : 'empty when config has no author', 'config.author')

  const primary = primaryOf(study.tasks)
  derive('goals[].primary', 'the task marked primary, else the only task with an outcome, else the first', 'task.primary, task.outcome')

  const answerPool = study.tasks.flatMap(t => t.answer ? [t.answer.expected] : [])
  const goals: CompiledGoal[] = study.tasks.map((task, index) => {
    const { path, start, minutes, scenario } = task.options
    const hasOutcome = task.outcomes.length > 0
    const shape: CompiledGoal['shape'] = task.steps.length ? 'steps' : path?.length ? 'happy-path' : minutes !== undefined && !hasOutcome ? 'time-boxed' : 'goal-only'
    const startFrom: CompiledGoal['startFrom'] = start ? 'option' : study.setup ? 'setup' : path?.length ? 'path' : 'root'
    let timeout: ReturnType<typeof goalTimeout>
    try { timeout = goalTimeout(task) } catch (error) { throw new StudyLoadError(error instanceof Error ? error.message : String(error), study.file, task.line, error) }
    const at = `goals[${index}]`
    derive(`${at}.shape`, shape === 'steps' ? 'the task has steps' : shape === 'happy-path' ? 'the task has a path' : shape === 'time-boxed' ? 'minutes and no outcome' : 'an outcome or answer only', 'task.steps, task.path, task.minutes, task.outcome')
    derive(`${at}.start`, start ? 'task start' : path?.length ? 'the first page of path' : 'the root page', 'task.start, task.path')
    derive(`${at}.startFrom`, start ? 'task start' : study.setup ? 'setup returns the start at run time' : path?.length ? 'path' : 'default', 'task.start, setup, task.path')
    derive(`${at}.timeout`, timeout.rule, 'task.timeLimit, task.path, task.steps')
    derive(`${at}.scenario`, scenario ? 'as authored' : 'who the users are, the purpose and the task name; never the path or the outcome', 'task.scenario, task.name')
    derive(`${at}.questions`, 'ease, then what made it difficult at 4 or below; confidence only without outcome or answer', 'task.outcome, task.answer')
    return {
      index,
      name: task.name,
      shape,
      start: start ?? path?.[0] ?? '/',
      startFrom,
      scenario: scenario ? { text: scenario, pinned: true } : { text: scenarioTemplate({ are: users.are, purpose, goal: task.name, values: {} }), pinned: false },
      steps: task.steps.map(s => ({ name: s.name, hasCheck: Boolean(s.check) })),
      ...(path && { path }),
      ...(task.answer && { answer: { question: task.answer.question, choices: shuffleChoices(task.answer.expected, task.answer.distractors ?? distractors(task.answer.expected, answerPool, `${id}:${index}`), `${id}:${index}`), expected: task.answer.expected } }),
      hasOutcome,
      timeout,
      ...(minutes !== undefined && { minutes }),
      primary: task === primary,
      questions: goalQuestions(index, task),
      ...(actors.includes('agent') && { agent: {
        target: agentTarget(task.options.target, study.options.target, config.target),
        trials: task.options.trials ?? DEFAULT_TRIALS,
        reliability: task.options.reliability ?? 'all',
      } }),
    }
  })

  const impression = deriveImpression(study, goals)
  derive('impression', impression.reason, 'firstLook, setup')

  const screener = deriveScreener(study.options.users, purpose)
  derive('screener', 'what users says (recency from did and within, often, role, uses, not with the standing exclusion), then three fit questions from the purpose, then browser, device and assistive technology; a users sentence is read for did and within', 'users, purpose')
  derive('practice', 'shown to link participants before the first look', 'participants')
  derive('brand', 'config brand; no ui-tests name unless poweredBy is true', 'config.brand')

  const questions: CompiledQuestion[] = [
    { id: 'useful', text: `Would ${product} be useful to you?`, type: 'scale', points: 5 },
    { id: 'easy', text: `${product} is easy to use.`, type: 'scale', points: 5 },
    { id: 'anything', text: `Anything you want to tell ${product}?`, type: 'open' },
  ]
  derive('questions', 'the two UX-Lite items on five points ((response - 1) x 25, wording uxlite-2024), then the open question, asked once after all goals, with the product name', 'config.product')
  derive('consent', 'retention 90 days; the third purpose only when config consent.workflows is true; the payout line from config participants.link.amount', 'config.consent, config.participants')
  derive('goals[].answer.choices', 'the expected answer among its distractors (authored, else generated), shuffled by the study id and task index', 'task.answer')

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
    ...(study.options.independent !== undefined && { independent: study.options.independent }),
    ...(actors.includes('agent') && config.agents && { agents: { config: config.agents, fingerprint: agentFingerprint(config.agents) } }),
    sample: { affecting: sampleOptions.affecting, confidence: sampleOptions.confidence, n, sentence: sampleSentence(n, sampleOptions.affecting) },
    impression,
    screener,
    practice: true,
    brand: { ...(config.brand?.accent && { accent: config.brand.accent }), poweredBy: config.brand?.poweredBy ?? false },
    goals,
    questions,
    consent: consentText({ product, author: config.author ?? '' }, { workflows: config.consent?.workflows ?? false, ...(config.participants?.link?.amount && { amount: { minor: config.participants.link.amount, currency: config.participants.budget?.currency ?? 'USD' } }) }),
    derivations,
  }
}
