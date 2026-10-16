import { build } from 'esbuild'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { resetContexts, type Context, type Goal } from './index.ts'
import { deriveScreener, inferScreen, screenSchema, screenSource } from './screener.ts'

/** Human-readable derivation rules, shown beside each derived field in the compiled context and the trace. */
export const rule = { scenario: 'template(goal, fixture names); no happy path input', timeout: 'max(180, (happy-path length or task count or 1) × 90) seconds', sample: 'ceil(log(1-confidence) / log(1-prevalence))', impression: 'purpose recognition with template distractors', fit: 'purpose-derived relevance, frequency and current approach' }
/** Deterministic scenario text from the goal and fixture names; the happy path is never an input. A model generator can replace this function later. */
export function generateTemplate(goal: string, fixtures: string[] = []) {
  // How the task ends is the card's own line, not the scenario's (participant-overlay research, scenario card).
  return `Imagine you want to ${goal}.${fixtures.length ? ` Use ${fixtures.join(', ')}.` : ''}`
}
/** Attempts needed to notice a problem affecting "1 in N" people at the given confidence. */
export function sampleSize(affecting = '1 in 3', confidence = 0.85) {
  const match = /^1 in (\d+)$/.exec(affecting)
  if (!match || Number(match[1]) < 2 || confidence <= 0 || confidence >= 1) throw new Error('catch: use affecting "1 in N" (N ≥ 2) and confidence between 0 and 1')
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - 1 / Number(match[1])))
}
/** The result sentence for a rehearsal: rehearsal attempts never count toward the planned sample. */
export function sentence(planned = 5) { return `Rehearsal: 0 of ${planned} planned attempts recorded.` }
/** One lint finding: the rule, its severity, the reason, the authoring source and the fix. */
export type Diagnostic = { rule: string; severity: 'error' | 'warning'; reason: string; source: string; fix: string; draft?: string }
/** Interface words that belong in `task()` steps, not in goal names. */
const interfaceTerms = /\b(click|tap|button|link|menu|dropdown|checkbox|screen|page|tab|scroll|open)\b/i
/** Runs the authoring rules over the contexts and returns every finding with its rule, reason, source and fix. */
export function lint(contexts: Context[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const c of contexts) {
    const add = (name: string, reason: string, fix: string, g?: Goal, severity: 'error' | 'warning' = 'error') => diagnostics.push({ rule: name, severity, reason, fix, source: g?.source ?? c.source })
    if (!c.users?.trim() || !c.purpose?.trim()) add('context-named', 'Users and purpose are required.', 'Name the people and their purpose.')
    const screen = c.screen === undefined ? undefined : screenSchema.safeParse(c.screen)
    if (screen && !screen.success) add('screen-valid', `The screen block is invalid: ${screen.error.issues.map(issue => `${issue.path.join('.') || 'screen'}: ${issue.message}`).join('; ')}.`, 'Correct the screen fields named above; every field is optional.')
    if (!c.screen && c.users?.trim()) {
      const draft = inferScreen(c.users)
      diagnostics.push({ rule: 'screen-inferred', severity: 'warning', reason: 'No screen block: the screener was drafted from the users sentence and every field it filled is inferred.', fix: 'Paste the draft below into context() and correct it.', source: c.source, draft: screenSource(draft.screen, draft.inferred) })
      if (!draft.screen.did) add('screen-did', 'The users sentence names no behaviour, so the screener has no gate.', "Add screen.did: one past-tense phrase about the category, such as 'paid for accounting software'.", undefined, 'warning')
    } else if (screen?.success && !c.screen?.did) add('screen-did', 'The screen block has no did, so the screener has no gate.', "Add screen.did: one past-tense phrase about the category, such as 'paid for accounting software'.", undefined, 'warning')
    if (/^(use|try|test|learn|understand|explore)\s+(the\s+)?[\w-]+[.!]?$/i.test(c.purpose)) add('person-purpose', 'The purpose names product use rather than a person’s need.', 'Describe what the person wants to accomplish, independent of the product.')
    if (!c.goals.length) add('goal-required', 'A context needs at least one goal.', 'Add a goal describing an observable result.')
    for (const g of c.goals) {
      if (interfaceTerms.test(g.name)) add('goal-no-interface', 'Goals describe intent, not interface operations.', 'Move interface instructions into task() steps.', g)
      if (/\b(understand|know|learn|and)\b/i.test(g.name)) add('outcome-strength', 'A compound or cognitive goal cannot be established by a single end-state URL.', 'Use one observable goal; split additional intents into separate goals.', g)
      if (g.outcomes.length > 1) add('one-outcome', 'Only one outcome is allowed per goal.', 'Combine assertions inside one outcome().', g)
      if (g.outcomes.length === 1 && !/\bexpect\b[\s\S]*\.\s*to(?:ContainEqual|Contain|Be|Exist)\s*\(/.test(g.outcomes[0].toString())) add('outcome-strength', 'The outcome contains no supported evidence assertion.', 'Assert the goal’s end state with expect(page.url()) or expect(page.query(...)), or validate a participant.answer().', g)
      if (!g.outcomes.length) add('outcome-required', g.options.minutes ? 'Exploration produces issues only; no result sentence.' : 'An observable outcome is required unless time-boxed.', 'Add outcome(), or set minutes for issues-only exploration.', g, g.options.minutes ? 'warning' : 'error')
      if (g.options.minutes !== undefined && (!Number.isFinite(g.options.minutes) || g.options.minutes <= 0)) add('positive-minutes', 'Minutes must be positive.', 'Set minutes greater than zero.', g)
    }
    const estimate = c.goals.reduce((total, g) => total + (g.options.minutes ?? Math.max(3, (g.options.happyPath?.length || g.tasks.length || 1) * 1.5)), 0)
    if (estimate >= 30) add('under-30-minutes', `Estimated context takes ${estimate} minutes.`, 'Split this context into contexts under 30 minutes.')
  }
  return diagnostics
}
/** Zod schema enforced on each authored context before compilation. */
export const contextSchema = z.object({ users: z.string().min(1), purpose: z.string().min(1), screen: screenSchema.optional(), goals: z.array(z.object({ name: z.string().min(1), options: z.object({ happyPath: z.array(z.string().startsWith('/')).optional(), minutes: z.number().positive().optional(), scenario: z.string().optional(), fixtures: z.array(z.string()).optional(), catch: z.object({ affecting: z.string(), confidence: z.number().gt(0).lt(1) }).optional() }), tasks: z.array(z.object({ name: z.string() })) })) })
/** Validates each context and derives its id, name, impression stage, fit questions and, per goal, the shape, scenario, timeout, sample plan and result sentence, each with the rule that produced it. */
export function compile(contexts: Context[]) {
  return contexts.map(c => {
    contextSchema.parse(c)
    const id = createHash('sha256').update(`${c.users}:${c.purpose}`).digest('hex').slice(0, 12)
    return {
      id, name: `${c.users}: ${c.purpose}`, users: c.users, purpose: c.purpose, author: c.author ?? 'The author',
      impression: { question: 'What would this help you do?', answer: c.purpose, distractors: [generateTemplate('manage a different part of your day'), generateTemplate('share updates with your team')], rule: rule.impression },
      fitQuestions: [
        { question: `How relevant is it to ${c.purpose}?`, choices: ['Not relevant', 'Somewhat relevant', 'Very relevant'], rule: rule.fit },
        { question: `How often do you need to ${c.purpose}?`, choices: ['Rarely', 'Monthly', 'Weekly', 'Daily'], rule: rule.fit },
        { question: `How do you currently ${c.purpose}?`, distractors: [generateTemplate('ask someone else'), generateTemplate('do something unrelated')], rule: rule.fit },
      ],
      screener: c.screen ? deriveScreener(c.screen) : (draft => deriveScreener(draft.screen, 'inferred', draft.inferred))(inferScreen(c.users)),
      goals: c.goals.map((g, index) => {
        const planned = sampleSize(g.options.catch?.affecting, g.options.catch?.confidence)
        return { id: `${id}-${index}`, name: g.name, shape: g.options.minutes && !g.outcomes.length ? 'exploration' : g.tasks.length ? 'steps' : g.options.happyPath ? 'happy-path' : 'outcome',
          scenario: { text: g.options.scenario ?? generateTemplate(g.name, g.options.fixtures), rule: g.options.scenario ? 'author scenario override' : rule.scenario },
          timeout: { seconds: g.options.minutes ? g.options.minutes * 60 : Math.max(180, (g.options.happyPath?.length || g.tasks.length || 1) * 90), rule: g.options.minutes ? 'author minutes × 60 seconds' : rule.timeout },
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
/** Bundles a `*.ui.test.ts` file with esbuild, evaluates it, lints it and writes `context.json`. Returns the authored contexts, the compiled contexts, the diagnostics and the hooks bundle path the CLI later imports. */
export async function compileFile(file: string, output: string) {
  await mkdir(output, { recursive: true })
  const bundle = path.resolve(output, `hooks-${randomUUID()}.mjs`)
  resetContexts()
  await build({ stdin: { contents: `import ${JSON.stringify(path.resolve(file))}; import {getContexts} from 'ui-tests'; export default getContexts();`, resolveDir: path.dirname(path.resolve(file)) }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: bundle, sourcemap: 'inline' })
  const authored = (await import(pathToFileURL(bundle).href)).default as Context[]
  const diagnostics = lint(authored)
  const compiled = diagnostics.some(d => d.severity === 'error') ? [] : compile(authored)
  await writeFile(path.join(output, 'context.json'), JSON.stringify(compiled, null, 2))
  return { authored, compiled, diagnostics, bundle }
}
