import { build } from 'esbuild'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { resetContexts, resolveFixtures, type Context, type Fixtures, type Goal } from './index.ts'
export { codeImpression } from './impression.ts'
import { deriveScreener, inferFacts, usersFacts, usersSchema, usersSentence, usersSource } from './screener.ts'

/** Human-readable derivation rules, shown beside each derived field in the compiled context and the trace. */
export const rule = {
  scenario: 'situation from users.are and purpose, action from the goal name, data from beforeEach; never from happyPath, outcome or the screener',
  scenarioTemplate: 'template(goal, fixture names); no happy path input',
  start: 'goal start, else the first page of happyPath, else the target root',
  timeBox: 'max(180, (happy-path length or task count or 1) × 90) seconds',
  sample: 'ceil(log(1-confidence) / log(1-prevalence))',
  impression: 'the page flashed for 500 ms, then one open question; answers coded against the purpose, which the person never sees',
  recording: 'event replay always; video: true adds the screen as a video, the browser prompt and a 1.5× incentive',
}
/** Deterministic scenario text from the goal and fixture names; the happy path is never an input. The fallback when the card cannot be derived from users and purpose. */
export function generateTemplate(goal: string, fixtures: string[] = []) {
  // How the task ends is the card's own line, not the scenario's (participant-overlay research, scenario card).
  return `Imagine you want to ${goal}.${fixtures.length ? ` Use ${fixtures.join(', ')}.` : ''}`
}
const capital = (text: string) => text[0].toUpperCase() + text.slice(1)
/**
 * The card from the goal, never the path (contract-to-study-research.md, "Derivation rule"): (1) the situation, the purpose's verb
 * phrase in the second person without its "without…" clause, on the fixture's object, and the motive from `users.are` with the
 * fixture's name; (2) the action, the goal in the imperative with the name substituted; (3) one sentence per other fixture value.
 * When the sentence does not name a person and an object the template above is used instead.
 */
export function deriveScenario(users: string, purpose: string, goal: string, fixtures: Fixtures = {}) {
  const need = purpose.replace(/,?\s+without\b.*$/i, '').trim()
  const motive = /\b(?:want|wants|need|needs)\s+(?:a|an)\s+([a-z]+)\s+on\s+(?:their|your|the)\s+([a-z]+)/i.exec(users)
  const name = motive && typeof fixtures[motive[1]] === 'string' ? String(fixtures[motive[1]]) : undefined
  if (!motive || !name) return undefined
  const [, role, object] = motive
  const together = /\s+together$/i.test(need), doing = need.replace(/\s+together$/i, '')
  const situation = `You ${doing} on this ${object} and want your ${role} ${name} ${together ? `to ${doing.split(' ')[0]} it with you` : `on it too`}.`
  const action = `${capital(goal.replace(new RegExp(`\\b(?:a|an|the|your)\\s+${role}\\b`, 'i'), name))} to the ${object}.`
  const data = Object.entries(fixtures).filter(([key]) => key !== role).map(([key, value]) => `${name}'s ${key} is ${value}.`)
  return [situation, action, ...data].join(' ')
}
/** Attempts needed to notice a problem affecting "1 in N" people at the given confidence. */
export function sampleSize(affecting = '1 in 3', confidence = 0.85) {
  const match = /^1 in (\d+)$/.exec(affecting)
  if (!match || Number(match[1]) < 2 || confidence <= 0 || confidence >= 1) throw new Error('catch: use affecting "1 in N" (N ≥ 2) and confidence between 0 and 1')
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - 1 / Number(match[1])))
}
/** The result sentence for a rehearsal: rehearsal attempts never count toward the planned sample. */
export function sentence(planned = 5) { return `Rehearsal: 0 of ${planned} planned attempts recorded.` }
/** What is recorded, as the plan prints it: event replay always, the screen as video only with `video: true`. */
export function recordingLine(video = false) {
  return video
    ? 'Recording: event replay (what people do on the page) and screen video (video: true; the browser asks first; incentive 1.5×). Voice only if they choose to talk; camera off.'
    : 'Recording: event replay (what people do on the page). Add video: true to record the screen as a video too. Voice only if they choose to talk; camera off.'
}
/** One lint finding: the rule, its severity, the reason, the authoring source and the fix. */
export type Diagnostic = { rule: string; severity: 'error' | 'warning'; reason: string; source: string; fix: string; draft?: string }
/** Interface words that belong in `task()` steps, not in goal names. */
const interfaceTerms = /\b(click|tap|button|link|menu|dropdown|checkbox|screen|page|tab|scroll|open)\b/i
const sitePath = z.string().startsWith('/')
/** Runs the authoring rules over the contexts and returns every finding with its rule, reason, source and fix. */
export function lint(contexts: Context[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const c of contexts) {
    const add = (name: string, reason: string, fix: string, g?: Goal, severity: 'error' | 'warning' = 'error') => diagnostics.push({ rule: name, severity, reason, fix, source: g?.source ?? c.source })
    const sentence = usersSentence(c.users)
    if (!sentence.trim() || !c.purpose?.trim()) add('context-named', 'Users and purpose are required.', 'Name the people and their purpose.')
    // The separate screen block and record: 'screen' were replaced in round six; say where their fields went.
    const legacy = c as Context & { screen?: unknown; record?: unknown }
    if (legacy.screen !== undefined) add('users-removed', 'The separate screen block is gone: how to check who the people are now lives in users.', `Write users: { are: '${sentence.replace(/'/g, "\\'") || 'the sentence'}', did, within, … } and delete screen.`)
    if (legacy.record !== undefined) add('video-removed', "record: 'screen' is gone: event replay is always recorded.", 'Write video: true to record the screen as a video too, or delete record.')
    if (c.video !== undefined && typeof c.video !== 'boolean') add('video-boolean', 'video is true or left out.', 'Write video: true, or leave it out for event replay only.')
    const users = c.users === undefined ? undefined : usersSchema.safeParse(c.users)
    if (users && !users.success) add('users-valid', `users is invalid: ${users.error.issues.map(issue => `${issue.path.join('.') || 'users'}: ${issue.message}`).join('; ')}.`, 'Write users as one sentence, or as { are: the sentence, did, within, often, role, uses, not, where, language, age } with the fields named above corrected.')
    if (typeof c.users === 'string' && c.users.trim()) {
      const draft = inferFacts(c.users)
      diagnostics.push({ rule: 'users-inferred', severity: 'warning', reason: 'users is the sentence alone: the screener was drafted from it and every field it filled is inferred.', fix: 'Paste the draft below over users in context() and correct it.', source: c.source, draft: usersSource(c.users, draft.facts, draft.inferred) })
      if (!draft.facts.did) add('users-did', 'The users sentence names no behaviour, so the screener has no gate.', "Add users.did: one past-tense phrase about the category, such as 'paid for accounting software'.", undefined, 'warning')
    } else if (users?.success && typeof c.users === 'object' && !c.users.did) add('users-did', 'users has no did, so the screener has no gate.', "Add users.did: one past-tense phrase about the category, such as 'paid for accounting software'.", undefined, 'warning')
    if (c.impression && c.impression.page !== undefined && !sitePath.safeParse(c.impression.page).success && !z.url().safeParse(c.impression.page).success) add('impression-page', 'impression.page is neither a path on your site nor a URL.', "Write a path such as '/' or a full URL such as 'https://github.com/you/app'.")
    if (/^(use|try|test|learn|understand|explore)\s+(the\s+)?[\w-]+[.!]?$/i.test(c.purpose)) add('person-purpose', 'The purpose names product use rather than a person’s need.', 'Describe what the person wants to accomplish, independent of the product.')
    if (!c.goals.length) add('goal-required', 'A context needs at least one goal.', 'Add a goal describing an observable result.')
    for (const g of c.goals) {
      if (interfaceTerms.test(g.name)) add('goal-no-interface', 'Goals describe intent, not interface operations.', 'Move interface instructions into task() steps.', g)
      if (/\b(understand|know|learn|and)\b/i.test(g.name)) add('outcome-strength', 'A compound or cognitive goal cannot be established by a single end-state URL.', 'Use one observable goal; split additional intents into separate goals.', g)
      if (g.outcomes.length > 1) add('one-outcome', 'Only one outcome is allowed per goal.', 'Combine assertions inside one outcome().', g)
      if (g.outcomes.length === 1 && !/\bexpect\b[\s\S]*\.\s*to(?:ContainEqual|Contain|Be|Exist)\s*\(/.test(g.outcomes[0].toString())) add('outcome-strength', 'The outcome contains no supported evidence assertion.', 'Assert the goal’s end state with expect(page.url()), expect(await page.textContent(...)) or expect(page.query(...)), or validate a participant.answer().', g)
      if (!g.outcomes.length) add('outcome-required', g.options.minutes ? 'Exploration produces issues only; no result sentence.' : 'An observable outcome is required unless time-boxed.', 'Add outcome(), or set minutes for issues-only exploration.', g, g.options.minutes ? 'warning' : 'error')
      if (g.options.minutes !== undefined && (!Number.isFinite(g.options.minutes) || g.options.minutes <= 0)) add('positive-minutes', 'Minutes must be positive.', 'Set minutes greater than zero.', g)
      if (g.options.start !== undefined && !sitePath.safeParse(g.options.start).success) add('start-path', 'start is where the person lands, a path on your site.', "Write a path such as '/board'.", g)
    }
    const estimate = c.goals.reduce((total, g) => total + (g.options.minutes ?? Math.max(3, (g.options.happyPath?.length || g.tasks.length || 1) * 1.5)), 0)
    if (estimate >= 30) add('under-30-minutes', `Estimated context takes ${estimate} minutes.`, 'Split this context into contexts under 30 minutes.')
  }
  return diagnostics
}
/** Zod schema enforced on each authored context before compilation. */
export const contextSchema = z.object({ users: usersSchema, purpose: z.string().min(1), video: z.boolean().optional(), impression: z.union([z.literal(false), z.object({ page: z.union([sitePath, z.url()]).optional() }).strict()]).optional(), goals: z.array(z.object({ name: z.string().min(1), options: z.object({ start: sitePath.optional(), happyPath: z.array(sitePath).optional(), minutes: z.number().positive().optional(), scenario: z.string().optional(), fixtures: z.array(z.string()).optional(), catch: z.object({ affecting: z.string(), confidence: z.number().gt(0).lt(1) }).optional() }), tasks: z.array(z.object({ name: z.string() })) })).min(1) })
/** Where the person lands for a goal: its `start`, else the first page of its happy path, else the target's root. */
export function startOf(g: Goal) { return g.options.start ?? g.options.happyPath?.[0] ?? '/' }
/** Validates each context and derives its id, name, recording level, impression stage, screener and, per goal, where it starts, the shape, scenario, time box, sample plan and result sentence, each with the rule that produced it. */
export function compile(contexts: Context[]) {
  return contexts.map(c => {
    contextSchema.parse(c)
    const users = usersSentence(c.users)
    const id = createHash('sha256').update(`${users}:${c.purpose}`).digest('hex').slice(0, 12)
    const video = c.video === true
    const draft = typeof c.users === 'string' ? inferFacts(c.users) : undefined
    return {
      id, name: `${users}: ${c.purpose}`, users, purpose: c.purpose, author: c.author ?? 'The author',
      // The chrome's one accent and the name the participant reads, set by the author under `chrome:` in the config; never sampled from the host page.
      accent: undefined as string | undefined, siteName: undefined as string | undefined,
      recording: { video, level: video ? 'event replay and screen video' : 'event replay', incentive: video ? 1.5 : 1, line: recordingLine(video), rule: rule.recording },
      impression: c.impression === false ? null : { page: c.impression?.page ?? startOf(c.goals[0]), flashMs: 500, question: 'What was that page for?', codedAgainst: 'purpose', rule: rule.impression },
      screener: draft ? deriveScreener(draft.facts, c.purpose, 'inferred', draft.inferred) : deriveScreener(usersFacts(c.users), c.purpose),
      goals: c.goals.map((g, index) => {
        const planned = sampleSize(g.options.catch?.affecting, g.options.catch?.confidence)
        const derived = g.options.scenario ? undefined : deriveScenario(users, c.purpose, g.name, c.fixtures)
        return { id: `${id}-${index}`, name: g.name, shape: g.options.minutes && !g.outcomes.length ? 'exploration' : g.tasks.length ? 'steps' : g.options.happyPath ? 'happy-path' : 'outcome',
          start: { path: startOf(g), rule: g.options.start ? 'author start' : rule.start },
          scenario: { text: g.options.scenario ?? derived ?? generateTemplate(g.name, g.options.fixtures), rule: g.options.scenario ? 'author scenario override' : derived ? rule.scenario : rule.scenarioTemplate },
          timeBox: { seconds: g.options.minutes ? g.options.minutes * 60 : Math.max(180, (g.options.happyPath?.length || g.tasks.length || 1) * 90), rule: g.options.minutes ? 'author minutes × 60 seconds' : rule.timeBox },
          sample: { planned, sentence: `${planned} attempts give ${Math.round((g.options.catch?.confidence ?? 0.85) * 100)}% confidence of noticing a problem affecting ${g.options.catch?.affecting ?? '1 in 3'} people.`, rule: rule.sample },
          resultSentence: g.outcomes.length ? sentence(planned) : null,
          resultRule: 'Rehearsals are excluded from n; report 0 of sample.planned attempts. No outcome means no result sentence.',
          happyPath: g.options.happyPath, tasks: g.tasks.map(t => ({ name: t.name, hasCheck: !!t.check })), hasOutcome: !!g.outcomes.length,
        }
      }),
    }
  })
}
/** A compiled context as written to `context.json` and stored with each run. */
export type CompiledContext = ReturnType<typeof compile>[number]
/** The plan a run prints before anything starts: people, recording level, and each goal with where it starts. */
export function plan(compiled: CompiledContext[]) {
  return compiled.flatMap(c => [`${c.name}`, `  ${c.recording.line}`, ...c.goals.map(g => `  Goal: ${g.name} · starts at ${g.start.path} · ${g.sample.planned} people`)]).join('\n')
}
/** Bundles a `*.ui.test.ts` file with esbuild, evaluates it, lints it and writes `context.json`. Returns the authored contexts, the compiled contexts, the diagnostics and the hooks bundle path the CLI later imports. */
export async function compileFile(file: string, output: string) {
  await mkdir(output, { recursive: true })
  const bundle = path.resolve(output, `hooks-${randomUUID()}.mjs`)
  resetContexts()
  await build({ stdin: { contents: `import ${JSON.stringify(path.resolve(file))}; import {getContexts} from 'ui-tests'; export default getContexts();`, resolveDir: path.dirname(path.resolve(file)) }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: bundle, sourcemap: 'inline' })
  const authored = await resolveFixtures((await import(pathToFileURL(bundle).href)).default as Context[])
  const diagnostics = lint(authored)
  const compiled = diagnostics.some(d => d.severity === 'error') ? [] : compile(authored)
  await writeFile(path.join(output, 'context.json'), JSON.stringify(compiled, null, 2))
  return { authored, compiled, diagnostics, bundle }
}
