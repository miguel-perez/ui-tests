import { agentConfigOf, agentFingerprint } from './agents/config.ts'
import { StudyLoadError } from './load.ts'
import type { AuthoredStudy, AuthoredTask } from './authoring.ts'
import { consentText } from './derive/consent.ts'
import { isWrongAnswer, neighbours, shuffleChoices } from './derive/distractors.ts'
import { deriveBrand } from './derive/brand.ts'
import { deriveImpression, type SaysSource } from './derive/impression.ts'
import { areFromDid, toSecondPerson } from './derive/person.ts'
import { ASSISTIVE, ASSISTIVE_QUESTION, deriveScreener, draftInputs, readUsers, resolveGroups } from './derive/screener.ts'
import { current, distractorEntry, snapshotState, type DraftNeeds, type SnapshotState, type StudySnapshot } from './derive/snapshot.ts'
import { scenarioTemplate } from './derive/scenario.ts'
import { detectionChance, sampleSentence, sampleSize } from './derive/sample.ts'
import { goalTimeout } from './derive/timeout.ts'
import { contextId, validateUsers } from './derive/users.ts'
import { compiledSchemaUrl, type CompiledGoal, type CompiledQuestion, type CompiledStudy } from './schema/compiled.ts'
import type { Target, UiTestsConfig } from './types.ts'

export { compiledStudySchema, compiledSchemaUrl } from './schema/compiled.ts'
export type { CompiledConsent, CompiledGoal, CompiledImpression, CompiledQuestion, CompiledScreenerQuestion, CompiledStudy } from './schema/compiled.ts'
export { sampleSize, detectionChance } from './derive/sample.ts'
export { goalTimeout } from './derive/timeout.ts'
export { validateUsers, contextId } from './derive/users.ts'
export { scenarioTemplate, fillScenario } from './derive/scenario.ts'
export { neighbours, shuffleChoices } from './derive/distractors.ts'
export { consentText, payoutLine } from './derive/consent.ts'
export { deriveImpression, pageSays } from './derive/impression.ts'
export { deriveScreener, screenResult, optionOrder, NONE_OF_THESE } from './derive/screener.ts'
export type { ScreenerQuestion, ScreenerOption, OptionRule, ScreenerResult } from './derive/screener.ts'
export { inferUsers, printUsersDraft } from './derive/infer-users.ts'
export { sentence, resultOf } from './derive/sentence.ts'
export { CARD_FOOTER, START_TASK } from './copy.ts'
export type { TextModel } from './model.ts'

type Derivation = CompiledStudy['derivations'][number]

/** A compiled study with what its snapshot must hold (`needs`), the groups it derives, and how its snapshot stands. */
export type Compiled = { compiled: CompiledStudy; needs: DraftNeeds; groups: StudySnapshot['groups']; snapshot: SnapshotState }

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

/**
 * Turns an authored study, the config and the study's snapshot (what was drafted for the author to review) into the JSON context every
 * other part of the system reads. Without a current snapshot the study still compiles, marked `draft`.
 */
export function compileStudy(study: AuthoredStudy, config: UiTestsConfig, snapshot?: StudySnapshot): CompiledStudy {
  return compileWithSnapshot(study, config, snapshot).compiled
}

/** The same, with what the snapshot is checked against and how it stands. */
export function compileWithSnapshot(study: AuthoredStudy, config: UiTestsConfig, snapshot?: StudySnapshot): Compiled {
  try { return compile(study, config, snapshot) } catch (error) {
    if (error instanceof StudyLoadError) throw error
    throw new StudyLoadError(error instanceof Error ? error.message : String(error), study.file, study.line, error)
  }
}

function compile(study: AuthoredStudy, config: UiTestsConfig, snapshot: StudySnapshot | undefined): Compiled {
  const { errors } = validateUsers(study.options.users)
  if (errors.length) throw new Error(`study "${study.name}": ${errors.map(e => `${e.field}: ${e.message}`).join('; ')}`)
  const firstLook = study.options.firstLook
  if (firstLook && firstLook.page !== undefined && !firstLook.page.startsWith('/')) throw new Error(`study "${study.name}": firstLook.page "${firstLook.page}" should be a path on the target, such as "/"`)
  if (!study.tasks.length) throw new Error(`study "${study.name}" has no tasks`)
  const derivations: Derivation[] = []
  const derive = (field: string, rule: string, source: string) => derivations.push({ field, rule, source })
  const { fields } = readUsers(study.options.users)
  const did = fields.did ?? fields.groups?.find(g => g.did)?.did

  // What was drafted is read from the snapshot while it was drafted from what the study says now; until then it is drafted here.
  const needs: DraftNeeds = { decoys: {}, distractors: {} }
  if (fields.are === undefined && did) needs.are = did
  const are = fields.are ?? current(snapshot?.are, did) ?? areFromDid(did ?? '')
  derive('users.are', fields.are !== undefined ? 'as authored' : 'did with the person shifted ("people who …"), as the snapshot holds it', 'users.did, snapshot')
  const users = { ...fields, are } as CompiledStudy['users']

  const purpose = study.options.purpose ?? ''
  if (purpose) needs.purpose = purpose
  const purposeToYou = current(snapshot?.purpose, purpose) ?? toSecondPerson(purpose)
  derive('purposeToYou', 'the purpose with "I", "me", "my" and "mine" said as "you" and "your", as the snapshot holds it; shown only on the scenario card', 'purpose, snapshot')
  const id = contextId(are, purpose)
  derive('id', 'slug of who the users are and the purpose, each cut to 40 characters, joined with an ellipsis', 'users.are, purpose')
  const label = purpose ? `${are}, ${purpose}` : are
  derive('label', '"users, purpose"', 'users.are, purpose')

  const sampleOptions = study.options.sample ?? { affecting: 1 / 3, confidence: 0.85 }
  const perGroup = sampleSize(sampleOptions.affecting, sampleOptions.confidence)
  const resolved = resolveGroups(study.options.users, perGroup)
  const groups = resolved.map(g => ({ name: g.name, quota: g.quota }))
  const n = groups.reduce((sum, g) => sum + g.quota, 0)
  derive('sample.n', resolved.length > 1
    ? `the groups' quotas added up (${resolved.map(g => `${g.name} ${g.quota}, ${g.source}`).join('; ')})`
    : `smallest n with 1 - (1 - ${sampleOptions.affecting})^n >= ${sampleOptions.confidence}${study.options.sample ? '' : ' (default sample)'}`, 'sample, users.role, users.groups')
  // Each group is read on its own, so the chance is said per group, of its own quota; one group says it of everyone.
  const sampleText = groups.length > 1
    ? groups.map(g => `${g.name}: ${sampleSentence(g.quota, sampleOptions.affecting)}`).join(' ')
    : sampleSentence(n, sampleOptions.affecting)
  derive('sample.sentence', groups.length > 1
    ? `per group, of its own quota (${groups.map(g => `${g.name}: ${Math.round(detectionChance(sampleOptions.affecting, g.quota) * 100)}% chance that ${g.quota} people include one the problem hits`).join('; ')})`
    : `${Math.round(detectionChance(sampleOptions.affecting, n) * 100)}% chance that ${n} people include one the problem hits`, 'sample.affecting, sample.n, groups')
  derive('groups', resolved.length > 1 ? 'one group per role of role: { role: quota }, or per entry of groups (3 each unless written); each is reported on its own' : 'one group: everyone the screener accepts', 'users.role, users.groups')

  const record = study.options.record ?? 'events'
  derive('record', study.options.record ? 'as authored' : 'events unless record is video', 'record')
  const actors = (study.options.actors ?? ['human']) as CompiledStudy['actors']
  derive('actors', study.options.actors ? 'as authored' : 'human unless actors says otherwise', 'actors')
  if (actors.includes('agent')) {
    derive('goals[].agent', 'the task target, else the study target, else the config target; 5 trials and reliability all unless the task says otherwise', 'task.target, task.trials, task.reliability, study.target, config.target')
    derive('agents', 'config model with config agents, pinned with a fingerprint so any change is a different run', 'config.model, config.agents')
  }
  const product = config.product ?? hostname(config.target?.url ?? 'http://localhost:3000')
  derive('product', config.product ? 'config product' : 'hostname of the target url', 'config.product, config.target.url')
  derive('environment', study.options.environment ? 'as authored' : 'the target url', 'environment, config.target.url')
  derive('author', config.author ? 'config author' : 'empty when config has no author', 'config.author')

  const primary = primaryOf(study.tasks)
  derive('goals[].primary', 'the task marked primary, else the only task with an outcome, else the first', 'task.primary, task.outcome')

  // A task question's distractors: as the author wrote them, else from the snapshot while drafted from its expected answer, else a
  // count's neighbours. Nothing generic pads them; a question with none drafted yet shows its answer alone in a draft.
  const wrongAnswers = (task: AuthoredTask, answer: NonNullable<AuthoredTask['answer']>): string[] => {
    if (answer.distractors) {
      // Written distractors with no wrong answer among them would ask a question with one choice; nothing drafts them, so it is an error.
      if (!answer.distractors.some(d => isWrongAnswer(d, answer.expected))) throw new Error(`task "${task.name}": participant.answer(${JSON.stringify(answer.question)}) has no distractors other than its expected answer; write the wrong answers, or leave distractors out for ui-tests lint -u to draft them`)
      // A blank one, or the right answer again in other case, would reach a participant as a choice of its own.
      const bad = answer.distractors.filter(d => !isWrongAnswer(d, answer.expected))
      if (bad.length) throw new Error(`task "${task.name}": participant.answer(${JSON.stringify(answer.question)}) has distractors that are blank or its expected answer ${JSON.stringify(answer.expected)}: ${bad.map(d => JSON.stringify(d)).join(', ')}; remove them`)
      return answer.distractors
    }
    // The snapshot holds distractors by question, drafted from one expected answer: the same question expecting another would read the wrong entry.
    const other = needs.distractors[answer.question]
    if (other !== undefined && other !== answer.expected) throw new Error(`task "${task.name}" asks ${JSON.stringify(answer.question)} expecting ${JSON.stringify(answer.expected)}, and an earlier task asks it expecting ${JSON.stringify(other)}; word the questions apart, or write distractors on one`)
    needs.distractors[answer.question] = answer.expected
    return current(distractorEntry(snapshot, answer.question, answer.expected), answer.expected) ?? neighbours(answer.expected) ?? []
  }
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
    derive(`${at}.scenario`, scenario ? 'as authored' : 'who the users are, the purpose said to "you" and the task name; never the path or the outcome', 'task.scenario, task.name')
    derive(`${at}.questions`, 'ease, then what made it difficult at 4 or below; confidence only without outcome or answer', 'task.outcome, task.answer')
    return {
      index,
      name: task.name,
      shape,
      start: start ?? path?.[0] ?? '/',
      startFrom,
      scenario: scenario ? { text: scenario, pinned: true } : { text: scenarioTemplate({ are, purpose: purposeToYou, goal: task.name, values: {} }), pinned: false },
      steps: task.steps.map(s => ({ name: s.name, hasCheck: Boolean(s.check) })),
      ...(path && { path }),
      ...(task.answer && { answer: { question: task.answer.question, choices: shuffleChoices(task.answer.expected, wrongAnswers(task, task.answer), `${id}:${index}`), expected: task.answer.expected } }),
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

  // The first look's page, then what that page says: written by the author, else read into the snapshot by `lint -u`.
  const shown = deriveImpression(study, goals, undefined)
  const written = firstLook ? firstLook.says : undefined
  if (shown.on && written === undefined) needs.says = shown.page
  const fromSnapshot = shown.on && written === undefined ? current(snapshot?.says, shown.page) : undefined
  const says = written !== undefined ? { value: written, source: 'author' as SaysSource } : fromSnapshot !== undefined ? { value: fromSnapshot, source: snapshot!.says!.source as SaysSource } : undefined
  const impression = deriveImpression(study, goals, says)
  // The language panels filter on: as written, else the start page's own, read into the snapshot with what it says.
  if (fields.language === undefined && shown.on) {
    needs.language = shown.page
    const language = current(snapshot?.language, shown.page)
    if (language) users.language = language
  }
  derive('users.language', fields.language !== undefined ? 'as authored' : "the first look's page's <html lang>, read into the snapshot by lint -u; a panel filter, never asked", 'users.language, snapshot')
  derive('impression', impression.reason, 'firstLook, setup')
  derive('impression.says', written !== undefined ? 'as authored' : "the start page's h1, else its meta description, else its og:description, read into the snapshot by lint -u; never the purpose", 'firstLook.says, snapshot')

  const inputs = draftInputs(study.options.users, resolved, product)
  if (inputs.role) needs.decoys.role = inputs.role
  if (inputs.uses) needs.decoys.uses = inputs.uses
  if (inputs.not) needs.decoys.not = inputs.not
  if (inputs.repeats) needs.often = inputs.repeats
  const screener = deriveScreener({
    users: study.options.users, groups: resolved, product,
    drafts: {
      role: current(snapshot?.decoys?.role, inputs.role) ?? null,
      uses: current(snapshot?.decoys?.uses, inputs.uses) ?? null,
      not: current(snapshot?.decoys?.not, inputs.not) ?? null,
      repeats: current(snapshot?.often, inputs.repeats) ?? null,
    },
  })
  derive('screener', 'at most five screens before consent: when they last did it (did, within), how often (often, when the snapshot says it is repeated), their role, the tools they use, and the exclusions (insiders, professionals minus accepted roles, not); decoys from the snapshot; unordered options shuffled for each participant', 'users, snapshot')
  derive('assistive', 'asked after consent, optional, filters nobody; browser and device are read from the user agent', 'environment')
  derive('practice', 'shown to link participants before the first look', 'participants')
  const brand = deriveBrand(config, product)
  derive('brand', 'config brand; the name is config brand name, else the author, else the product', 'config.brand, config.author, config.product')

  const questions: CompiledQuestion[] = [
    { id: 'useful', text: `Would ${product} be useful to you?`, type: 'scale', points: 5 },
    { id: 'easy', text: `${product} is easy to use.`, type: 'scale', points: 5 },
    { id: 'anything', text: `Anything you want to tell ${product}?`, type: 'open' },
  ]
  derive('questions', 'the two UX-Lite items on five points ((response - 1) x 25, wording uxlite-2024), then the open question, asked once after all goals, with the product name', 'config.product')
  derive('consent', 'retention 90 days; the third purpose only when config consent.workflows is true; the payout line from config participants.link.amount', 'config.consent, config.participants')
  derive('goals[].answer.choices', "the expected answer among its distractors: as authored, else drafted into the snapshot by lint -u (a count's neighbours, else the model) and reviewed; shuffled by the study id and task index", 'task.answer, snapshot')

  const snapshotGroups = resolved.map(g => ({ name: g.name, quota: g.quota, source: g.source }))
  // An agent is not screened and takes no first look: a study only agents take needs no snapshot.
  const state: SnapshotState = actors.includes('human') ? snapshotState(snapshot, needs, { groups: snapshotGroups, screens: screener }) : { state: 'current', reasons: [] }
  derive('draft', 'the snapshot (<study file>.screener.snap) is missing or out of date; ui-tests lint -u drafts it', 'snapshot')

  const compiled: CompiledStudy = {
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
    ...(actors.includes('agent') && agentConfigOf(config) && { agents: { config: agentConfigOf(config)!, fingerprint: agentFingerprint(agentConfigOf(config)) } }),
    // The model that codes the first look on the server, pinned like the agent; its key stays on the server.
    ...(config.model && { model: config.model }),
    sample: { affecting: sampleOptions.affecting, confidence: sampleOptions.confidence, n, sentence: sampleText },
    impression,
    groups,
    screener,
    assistive: { id: 'assistive', text: ASSISTIVE_QUESTION, options: ASSISTIVE },
    purposeToYou,
    draft: state.state !== 'current',
    practice: true,
    brand,
    goals,
    questions,
    consent: consentText({ product, author: config.brand?.name ?? config.author ?? '' }, { workflows: config.consent?.workflows ?? false, ...(config.participants?.link?.amount && { amount: { minor: config.participants.link.amount, currency: config.participants.budget?.currency ?? 'USD' } }) }),
    derivations,
  }
  return { compiled, needs, groups: snapshotGroups, snapshot: state }
}
