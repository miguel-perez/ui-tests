import { build } from 'esbuild'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { resetContexts, type Context, type Fixtures, type Goal } from './index.ts'
export { codeImpression } from './impression.ts'
import { deriveScreener, inferFacts, usersFacts, usersSchema, usersSentence, usersSource } from './screener.ts'

/** Human-readable derivation rules, shown beside each derived field in the compiled context and the trace. */
export const rule = {
  scenario: 'situation from users.are and purpose, action from the task name, data from setup; never from path, outcome or the screener',
  scenarioTemplate: 'template(task, fixture names); no path input',
  start: 'setup start, else the first page of path, else the target root',
  timeBox: 'timeLimit, or three silent minutes',
  sample: 'the study sample: ceil(log(1-confidence) / log(1-affecting))',
  impression: 'the start, or the public page firstLook names; off when setup returns the start, behind a sign-in, unless firstLook names one; the page flashed for 500 ms, one appeal rating from 1 to 9, one open question coded against the purpose, which the person never sees, then the page back for a first click toward the first task, coded against its path',
  recording: 'event replay always; record: \'video\' adds the screen as a video, the browser prompt and a 1.5× incentive',
}
/** Deterministic scenario text from the task and fixture names; the path is never an input. The fallback when the card cannot be derived from users and purpose. */
export function generateTemplate(goal: string, fixtures: string[] = []) {
  // How the task ends is the card's own line, not the scenario's (participant-overlay research, scenario card).
  return `Imagine you want to ${goal}.${fixtures.length ? ` Use ${fixtures.join(', ')}.` : ''}`
}
const capital = (text: string) => text[0].toUpperCase() + text.slice(1)
/** A value the card can say: words or an address. A bare identifier (no spaces, no @, such as a board id) names a thing, never its value. */
const sayable = (value: unknown) => typeof value === 'string' && /[\s@]/.test(value)
/**
 * The card from the task and what `setup` returned, never the path (contract-to-study-research.md, "Derivation rule"): (1) the
 * situation, the purpose's verb phrase in the second person without its "without…" clause, on the object, and the motive with the
 * person's name; (2) the action, the task in the imperative with the name substituted; (3) one sentence per other value the card can
 * say. The person and the object come from `users.are` ("want a colleague on their board"), or else from `setup`: the value the task
 * names ("invite a colleague" and `colleague: 'Sam'`), and the value that is an identifier (`board: board.id`). `start` is never on
 * the card. When neither names a person and an object the template above is used instead.
 */
export function deriveScenario(users: string, purpose: string, goal: string, fixtures: Fixtures = {}) {
  const need = purpose.replace(/,?\s+without\b.*$/i, '').trim()
  const values = Object.fromEntries(Object.entries(fixtures).filter(([key]) => key !== 'start'))
  const motive = /\b(?:want|wants|need|needs)\s+(?:a|an)\s+([a-z]+)\s+on\s+(?:their|your|the)\s+([a-z]+)/i.exec(users)
  const role = motive?.[1] ?? Object.keys(values).find(key => typeof values[key] === 'string' && new RegExp(`\\b(?:a|an|the|your)\\s+${key}\\b`, 'i').test(goal))
  const object = motive?.[2] ?? Object.keys(values).find(key => key !== role && /^[a-z]+$/.test(key) && !sayable(values[key]))
  const name = role && typeof values[role] === 'string' ? String(values[role]) : undefined
  if (!role || !object || !name) return undefined
  const together = /\s+together$/i.test(need), doing = need.replace(/\s+together$/i, '')
  const situation = `You ${doing} on this ${object} and want your ${role} ${name} ${together ? `to ${doing.split(' ')[0]} it with you` : `on it too`}.`
  const action = `${capital(goal.replace(new RegExp(`\\b(?:a|an|the|your)\\s+${role}\\b`, 'i'), name))} to the ${object}.`
  const data = Object.entries(values).filter(([key, value]) => key !== role && (key !== object || sayable(value)) && (motive || sayable(value))).map(([key, value]) => `${name}'s ${key} is ${value}.`)
  return [situation, action, ...data].join(' ')
}
/** Attempts needed to notice a problem affecting "1 in N" people at the given confidence. Affecting may be a fraction (1/3) or the string "1 in 3". */
export function sampleSize(affecting: number | string = '1 in 3', confidence = 0.85) {
  if (typeof affecting === 'number') {
    if (!Number.isFinite(affecting) || affecting <= 0 || affecting >= 1) throw new Error('sample: affecting must be between 0 and 1, such as 1 / 3')
    affecting = `1 in ${Math.round(1 / affecting)}`
  }
  const match = /^1 in (\d+)$/.exec(affecting)
  if (!match || Number(match[1]) < 2 || confidence <= 0 || confidence >= 1) throw new Error('sample: use affecting "1 in N" (N ≥ 2) and confidence between 0 and 1')
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - 1 / Number(match[1])))
}
/** The result sentence for a rehearsal: rehearsal attempts never count toward the planned sample. */
export function sentence(planned = 5) { return `Rehearsal: 0 of ${planned} planned attempts recorded.` }
/** What is recorded, as the plan prints it: event replay always, the screen as video only with `record: 'video'`. */
export function recordingLine(video = false) {
  return video
    ? "Recording: event replay (what people do on the page) and screen video (record: 'video'; the browser asks first; incentive 1.5×). Voice only if they choose to talk; camera off."
    : "Recording: event replay (what people do on the page). Add record: 'video' to record the screen as a video too. Voice only if they choose to talk; camera off."
}
/** One lint finding: the rule, its severity, the reason, the authoring source and the fix. */
export type Diagnostic = { rule: string; severity: 'error' | 'warning'; reason: string; source: string; fix: string; draft?: string }
/** Interface words that belong in `task()` names, not in step names. */
const interfaceTerms = /\b(click|tap|button|link|menu|dropdown|checkbox|screen|page|tab|scroll|open)\b/i
const sitePath = z.string().startsWith('/')
const timeLimit = z.string().regex(/^\d+(\.\d+)?\s*min$/, "Write timeLimit as a minutes string such as '3 min'.")
/** The old authoring names, each with the rule that reports it and the fix that names the replacement. */
export const renamed: Record<string, { rule: string; reason: string; fix: string }> = {
  context: { rule: 'context-renamed', reason: '`context` is now `study`.', fix: "Write study('invite flow', { users, purpose }, () => { … }) instead of context({ … }, () => { … })." },
  goal: { rule: 'goal-renamed', reason: '`goal` is now `task`.', fix: "Write task('invite a colleague', { path, timeLimit, firstLook }, () => { … }) instead of goal(…)." },
  beforeEach: { rule: 'beforeEach-renamed', reason: '`beforeEach` is now `setup`, and it sets the attempt up.', fix: 'Write setup(async ({ request }) => ({ start, ...values })) instead of beforeEach(…): it runs once per attempt against your app.' },
  happyPath: { rule: 'happyPath-renamed', reason: '`happyPath` is now `path`, the route you expect; it sets nothing else.', fix: "Write path: ['/board', '/settings/members'] instead of happyPath." },
  minutes: { rule: 'minutes-renamed', reason: '`minutes` is now `timeLimit`, the silent limit.', fix: "Write timeLimit: '3 min' instead of minutes." },
  start: { rule: 'start-renamed', reason: '`start` is no longer an option: the attempt starts where `setup` says.', fix: "Return { start: '/board', … } from setup(async ({ request }) => …) instead of the start option." },
  catch: { rule: 'catch-renamed', reason: '`catch` is now `sample`, on the study: one sample for the whole study.', fix: 'Write sample: { affecting: 1 / 3, confidence: 0.85 } in the study options instead of catch on the goal.' },
  sample: { rule: 'sample-on-study', reason: '`sample` belongs to the study: it sets how many people take the whole study.', fix: 'Move sample: { affecting, confidence } from the task to the study options.' },
  video: { rule: 'video-renamed', reason: "`video` is now `record: 'video'`.", fix: "Write record: 'video' in the study options instead of video: true, or leave it out for event replay only." },
  impression: { rule: 'impression-renamed', reason: '`impression` is now `firstLook`, on the task.', fix: "Write firstLook: { page: '/' } on the task instead of impression, or firstLook: false to turn it off." },
  fixtures: { rule: 'fixtures-renamed', reason: '`fixtures` is gone: the card takes its values from what `setup` returns.', fix: "Return the values from setup(async ({ request }) => ({ start, colleague: 'Sam' })) instead of listing fixtures." },
}
/** Runs the authoring rules over the studies and returns every finding with its rule, reason, source and fix. */
export function lint(contexts: Context[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const c of contexts) {
    const add = (name: string, reason: string, fix: string, g?: Goal, severity: 'error' | 'warning' = 'error') => diagnostics.push({ rule: name, severity, reason, fix, source: g?.source ?? c.source })
    // The old names still load, so each one is an error whose fix names its replacement.
    for (const name of Object.keys(c.legacy ?? {})) if (renamed[name]) add(renamed[name].rule, renamed[name].reason, renamed[name].fix)
    const sentence = usersSentence(c.users)
    if (!sentence.trim() || !c.purpose?.trim()) add('study-named', 'Users and purpose are required.', 'Name the people and their purpose.')
    if (c.record !== undefined && c.record !== 'video') add('record-valid', "record is 'video' or left out.", "Write record: 'video', or leave it out for event replay only.")
    const users = c.users === undefined ? undefined : usersSchema.safeParse(c.users)
    if (users && !users.success) add('users-valid', `users is invalid: ${users.error.issues.map(issue => `${issue.path.join('.') || 'users'}: ${issue.message}`).join('; ')}.`, 'Write users as one sentence, or as { are: the sentence, did, within, often, role, uses, not, where, language, age } with the fields named above corrected.')
    if (typeof c.users === 'string' && c.users.trim()) {
      const draft = inferFacts(c.users)
      diagnostics.push({ rule: 'users-inferred', severity: 'warning', reason: 'users is the sentence alone: the screener was drafted from it and every field it filled is inferred.', fix: 'Paste the draft below over users in study() and correct it.', source: c.source, draft: usersSource(c.users, draft.facts, draft.inferred) })
      if (!draft.facts.did) add('users-did', 'The users sentence names no behaviour, so the screener has no gate.', "Add users.did: one past-tense phrase about the category, such as 'paid for accounting software'.", undefined, 'warning')
    } else if (users?.success && typeof c.users === 'object' && !c.users.did) add('users-did', 'users has no did, so the screener has no gate.', "Add users.did: one past-tense phrase about the category, such as 'paid for accounting software'.", undefined, 'warning')
    if (/^(use|try|test|learn|understand|explore)\s+(the\s+)?[\w-]+[.!]?$/i.test(c.purpose)) add('person-purpose', 'The purpose names product use rather than a person’s need.', 'Describe what the person wants to accomplish, independent of the product.')
    if (!c.goals.length) add('task-required', 'A study needs at least one task.', 'Add a task describing an observable result.')
    for (const g of c.goals) {
      for (const name of Object.keys(g.legacy ?? {})) if (renamed[name]) add(renamed[name].rule, renamed[name].reason, renamed[name].fix, g)
      if (interfaceTerms.test(g.name)) add('task-no-interface', 'Tasks describe intent, not interface operations.', 'Move interface instructions out of the task name.', g)
      if (/\b(understand|know|learn|and)\b/i.test(g.name)) add('outcome-strength', 'A compound or cognitive task cannot be established by a single end-state URL.', 'Use one observable task; split additional intents into separate tasks.', g)
      if (g.outcomes.length > 1) add('one-outcome', 'Only one outcome is allowed per task.', 'Combine assertions inside one outcome().', g)
      if (g.outcomes.length === 1 && !/\bexpect\b[\s\S]*\.\s*to(?:ContainEqual|Contain|Be|Exist)\s*\(/.test(g.outcomes[0].toString())) add('outcome-strength', 'The outcome contains no supported evidence assertion.', 'Assert what your app holds with expect(await (await request.get(…)).json()), or the page they ended on with expect(page.url()) or expect(page.query(…)), or validate a participant.answer().', g)
      if (!g.outcomes.length) add('outcome-required', 'An observable outcome is required.', 'Add outcome(), or request the issues-only shape.', g, 'warning')
      if (g.options.timeLimit !== undefined && !timeLimit.safeParse(g.options.timeLimit).success) add('timeLimit-valid', 'timeLimit is the silent limit, in minutes.', "Write timeLimit: '3 min', or leave it out for three minutes.", g)
      if (g.options.path && g.options.path.some(p => !sitePath.safeParse(p).success)) add('path-valid', 'path is the expected route: site paths only.', "Write a path such as '/board'.", g)
      if (g.options.firstLook && typeof g.options.firstLook === 'object' && g.options.firstLook.page !== undefined && !sitePath.safeParse(g.options.firstLook.page).success && !z.url().safeParse(g.options.firstLook.page).success) add('firstLook-page', 'firstLook.page is neither a path on your site nor a URL.', "Write a path such as '/' or a full URL such as 'https://github.com/you/app'.", g)
    }
  }
  return diagnostics
}
/** Zod schema enforced on each authored study before compilation. */
export const contextSchema = z.object({ users: usersSchema, purpose: z.string().min(1), record: z.literal('video').optional(), sample: z.object({ affecting: z.union([z.number().gt(0).lt(1), z.string().regex(/^1 in (\d+)$/)]).optional(), confidence: z.number().gt(0).lt(1).optional() }).strict().optional(), author: z.string().optional(), goals: z.array(z.object({ name: z.string().min(1), options: z.object({ path: z.array(sitePath).optional(), timeLimit: timeLimit.optional(), firstLook: z.union([z.literal(false), z.object({ page: z.union([sitePath, z.url()]).optional() }).strict()]).optional(), scenario: z.string().optional() }).strict().optional(), outcomes: z.array(z.function()).min(0) })).min(1) })
/** Where the person starts: setup's `start`, else the first page of the path, else the target's root. */
export function startOf(g: Goal, fixtures: Fixtures) { return (typeof fixtures.start === 'string' ? fixtures.start : undefined) ?? g.options.path?.[0] ?? '/' }
/** A `timeLimit` string in minutes, parsed to seconds (default three minutes). */
function timeLimitSeconds(g: Goal) {
  const text = g.options.timeLimit ?? '3 min'
  return Math.round(Number(/^(\d+(?:\.\d+)?)\s*min$/.exec(text)![1]) * 60)
}
/** Validates each study and derives its id, name, recording level, first-look stage, screener and, per task, where it starts, the shape, scenario, time box, sample plan and result sentence, each with the rule that produced it. */
export function compile(contexts: Context[]) {
  return contexts.map(c => {
    contextSchema.parse({ ...c, goals: c.goals.map(g => ({ name: g.name, options: g.options, outcomes: g.outcomes })) })
    const users = usersSentence(c.users)
    const id = createHash('sha256').update(`${users}:${c.purpose}`).digest('hex').slice(0, 12)
    const video = c.record === 'video'
    const draft = typeof c.users === 'string' ? inferFacts(c.users) : undefined
    const fixtures = c.fixtures ?? {}
    const planned = sampleSize(c.sample?.affecting, c.sample?.confidence)
    return {
      id, name: `${users}: ${c.purpose}`, users, purpose: c.purpose, author: c.author ?? 'The author',
      // The chrome's one accent and the name the participant reads, set by the author under `chrome:` in the config; never sampled from the host page.
      accent: undefined as string | undefined, siteName: undefined as string | undefined,
      recording: { video, level: video ? 'event replay and screen video' : 'event replay', incentive: video ? 1.5 : 1, line: recordingLine(video), rule: rule.recording },
      impression: (() => {
        const first = c.goals[0]
        const firstLook = first.options.firstLook
        if (firstLook === false) return null
        // `named`: firstLook names the page. Otherwise it is the start, and an attempt whose setup returns a start (behind a sign-in) has none.
        return { page: firstLook?.page ?? startOf(first, fixtures), named: !!firstLook?.page, flashMs: 500, appeal: { question: 'How appealing did that page look?', points: 9 }, question: 'What was that page for?', codedAgainst: 'purpose', firstClick: { toward: c.goals[0].name, codedAgainst: 'path' }, rule: rule.impression }
      })(),
      screener: draft ? deriveScreener(draft.facts, c.purpose, 'inferred', draft.inferred) : deriveScreener(usersFacts(c.users), c.purpose),
      goals: c.goals.map((g, index) => {
        const derived = g.options.scenario ? undefined : deriveScenario(users, c.purpose, g.name, fixtures)
        const startPath = startOf(g, fixtures)
        const conf = c.sample?.confidence ?? 0.85, affecting = c.sample?.affecting ?? '1 in 3'
        const affectingText = typeof affecting === 'number' ? `1 in ${Math.round(1 / affecting)}` : affecting
        return { id: `${id}-${index}`, name: g.name, shape: g.options.path ? 'happy-path' : 'outcome',
          start: { path: startPath, rule: typeof fixtures.start === 'string' ? 'setup start' : g.options.path ? 'first page of path' : rule.start },
          scenario: { text: g.options.scenario ?? derived ?? generateTemplate(g.name), rule: g.options.scenario ? 'author scenario override' : derived ? rule.scenario : rule.scenarioTemplate },
          timeBox: { seconds: timeLimitSeconds(g), rule: g.options.timeLimit ? 'author timeLimit' : rule.timeBox },
          sample: { planned, sentence: `${planned} attempts give ${Math.round(conf * 100)}% confidence of noticing a problem affecting ${affectingText} people.`, rule: rule.sample },
          resultSentence: g.outcomes.length ? sentence(planned) : null,
          resultRule: 'Rehearsals are excluded from n; report 0 of sample.planned attempts. No outcome means no result sentence.',
          happyPath: g.options.path, hasOutcome: !!g.outcomes.length,
        }
      }),
    }
  })
}
/** A compiled study as written to `context.json` and stored with each run. */
export type CompiledContext = ReturnType<typeof compile>[number]
/**
 * The study as one attempt meets it, once its `setup` has run: each task starts at the `start` setup returned, and the card is written
 * again from the values it returned. A pinned `scenario` stays as written.
 */
export function forAttempt(compiled: CompiledContext, values: Fixtures): CompiledContext {
  const attempt = structuredClone(compiled)
  // A start from setup is behind a sign-in: no first look there, unless firstLook named a public page.
  if (typeof values.start === 'string' && attempt.impression && !attempt.impression.named) attempt.impression = null
  for (const g of attempt.goals) {
    if (typeof values.start === 'string') g.start = { path: values.start, rule: 'setup start' }
    if (g.scenario.rule === 'author scenario override') continue
    const derived = deriveScenario(attempt.users, attempt.purpose, g.name, values)
    g.scenario = derived ? { text: derived, rule: rule.scenario } : { text: generateTemplate(g.name), rule: rule.scenarioTemplate }
  }
  return attempt
}
/** Where the paid panel finds people (PRD 03, Sources): the run's router spreads invitations across both under the cap. */
export const panels = ['Prolific', 'CloudResearch Connect'] as const
/** The run's one deadline sentence: the default deadline, said as a deadline, never a promise of when people arrive. */
export const deadlineSentence = 'The run closes at its deadline, 48 hours unless you set one.'
/** How long people take, from the desk research (sources-desk-research.md, "Realistic turnaround"), never the deadline. */
export const timeStatement = 'First people within minutes. Usually all five within a few hours; a narrow audience a day or more'
/**
 * Where the people come from, as `recruit` prints it: your link, and the paid panel on Prolific and CloudResearch Connect under the cap,
 * each person labelled with the one they came from; then how long it takes and the deadline.
 */
export function peopleLines(planned: number, cap?: number) {
  return [
    `  People: ${planned} · your link, to anyone you send it to, or the paid panel on ${panels.join(' and ')}: invitations spread across both ${cap ? `under your $${cap} cap` : 'under the cap you set (budget: { max: 70 } holds five with the reserve)'}, each person labelled with the one they came from.`,
    `  Time: ${timeStatement.replace('all five', `all ${planned}`)}. ${deadlineSentence}`,
  ]
}
/** The plan a run prints before anything starts: recording level, each task with where it starts, and, for `recruit`, where the people come from. */
export function plan(compiled: CompiledContext[], people?: { cap?: number }) {
  return compiled.flatMap(c => [`${c.name}`, `  ${c.recording.line}`, ...c.goals.map(g => `  Task: ${g.name} · starts at ${g.start.path} · ${g.sample.planned} people`), ...(people ? peopleLines(Math.max(...c.goals.map(g => g.sample.planned)), people.cap) : [])]).join('\n')
}
/** Bundles a `*.ui.test.ts` file with esbuild, evaluates it, lints it and writes `context.json`. Returns the authored studies, the compiled studies, the diagnostics and the hooks bundle path the CLI later imports. */
export async function compileFile(file: string, output: string) {
  await mkdir(output, { recursive: true })
  const bundle = path.resolve(output, `hooks-${randomUUID()}.mjs`)
  resetContexts()
  await build({ stdin: { contents: `import ${JSON.stringify(path.resolve(file))}; import {getContexts} from 'ui-tests'; export default getContexts();`, resolveDir: path.dirname(path.resolve(file)) }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: bundle, sourcemap: 'inline' })
  // setup runs once per attempt against the target, never here: lint and the plan need no app running.
  const authored = (await import(pathToFileURL(bundle).href)).default as Context[]
  const diagnostics = lint(authored)
  const compiled = diagnostics.some(d => d.severity === 'error') ? [] : compile(authored)
  await writeFile(path.join(output, 'context.json'), JSON.stringify(compiled, null, 2))
  return { authored, compiled, diagnostics, bundle }
}