import { z } from 'zod'

export const compiledSchemaUrl = 'https://ui-tests.com/schemas/compiled-study.v1.json' as const

const timeout = z.object({ seconds: z.number(), rule: z.string() })

/**
 * One question, minimal on purpose so the impression can extend it: a stable `id`,
 * the words shown, how it is answered, and optionally a follow-up condition. One question is shown per screen and
 * nothing is preselected.
 */
export const compiledQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['scale', 'open', 'choice']),
  /** Points on the scale; present when `type` is `scale`. */
  points: z.number().optional(),
  /** Options in display order; present when `type` is `choice`. */
  choices: z.array(z.string()).optional(),
  /** Asked only when the answer to question `id` is at or below `atOrBelow`. */
  askIf: z.object({ id: z.string(), atOrBelow: z.number() }).optional(),
})
export type CompiledQuestion = z.infer<typeof compiledQuestionSchema>

/**
 * One screener question with the rule of each option. The rules and `field` stay on the author's side: `participantView` copies the
 * labels only.
 */
export const screenerQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.object({ label: z.string(), rule: z.enum(['accept', 'reject', 'may-select']) })),
  multi: z.boolean(),
  /** Where the question comes from: a `users` field, `purpose`, or `environment`. */
  field: z.string(),
  /** How the question is read, in words. */
  rule: z.string(),
  /** Read from a `users` sentence rather than written by the author. */
  inferred: z.boolean().optional(),
  /** A free-text question: no options. */
  open: z.boolean().optional(),
})
export type CompiledScreenerQuestion = z.infer<typeof screenerQuestionSchema>

/**
 * The first look at the start page: whether it runs (`on`), which page, the fixed timing and words, and `reason`
 * saying why it is on or off. The fixed fields are present either way.
 */
export const compiledImpressionSchema = z.object({
  on: z.boolean(),
  page: z.string().optional(),
  flashMs: z.literal(500),
  question: z.string(),
  codes: z.array(z.string()),
  reason: z.string(),
})
export type CompiledImpression = z.infer<typeof compiledImpressionSchema>

/**
 * What the participant is asked to agree to. `purposes` names what is agreed to; `text` is what is shown.
 */
export const compiledConsentSchema = z.object({
  workflows: z.boolean(),
  retentionDays: z.number(),
  /** The purposes agreed to, in order. */
  purposes: z.array(z.string()),
  /** The consent screen's paragraphs: one sentence per purpose, retention, then the payout line. */
  text: z.array(z.string()),
  /** The payout line, also the last entry of `text`. */
  payout: z.string(),
})
export type CompiledConsent = z.infer<typeof compiledConsentSchema>

export const agentConfigSchema = z.object({
  model: z.object({ provider: z.enum(['anthropic', 'scripted']), name: z.string(), version: z.string().optional() }),
  system: z.string().optional(),
  tools: z.array(z.string()).optional(),
  permissions: z.object({ network: z.boolean().optional(), write: z.boolean().optional() }).optional(),
  budgets: z.object({ tokens: z.number().optional(), calls: z.number().optional(), seconds: z.number().optional(), dollars: z.number().optional() }).optional(),
})

/** What an agent trial of a task runs against and how its trials are read. */
export const compiledAgentSchema = z.object({
  target: z.object({ kind: z.enum(['web', 'cli', 'mcp', 'http']), value: z.string(), description: z.string().optional() }),
  trials: z.number(),
  reliability: z.enum(['all', 'any']),
})

export const compiledGoalSchema = z.object({
  index: z.number(),
  name: z.string(),
  shape: z.enum(['goal-only', 'happy-path', 'steps', 'time-boxed']),
  start: z.string(),
  startFrom: z.enum(['option', 'path', 'setup', 'root']),
  scenario: z.object({ text: z.string(), pinned: z.boolean() }),
  steps: z.array(z.object({ name: z.string(), hasCheck: z.boolean() })),
  path: z.array(z.string()).optional(),
  answer: z.object({ question: z.string(), choices: z.array(z.string()), expected: z.string() }).optional(),
  hasOutcome: z.boolean(),
  timeout,
  minutes: z.number().optional(),
  primary: z.boolean(),
  questions: z.array(compiledQuestionSchema),
  /** Present when the study admits the agent actor. */
  agent: compiledAgentSchema.optional(),
})
export type CompiledGoal = z.infer<typeof compiledGoalSchema>

const usersSchema = z.object({
  are: z.string(),
  did: z.string().optional(),
  within: z.string().optional(),
  often: z.string().optional(),
  role: z.union([z.string(), z.array(z.string())]).optional(),
  uses: z.array(z.string()).optional(),
  not: z.array(z.string()).optional(),
  where: z.union([z.string(), z.array(z.string())]).optional(),
  language: z.string().optional(),
  age: z.union([z.string(), z.object({ min: z.number().optional(), max: z.number().optional() })]).optional(),
})

/** What participants see in place of our name: stored with the run so the server and the bar render it without the author's files. */
export const compiledBrandSchema = z.object({
  name: z.string(),
  logo: z.string().optional(),
  accent: z.string().optional(),
  background: z.string().optional(),
  text: z.string().optional(),
  font: z.object({ family: z.string(), url: z.string().optional() }).optional(),
})
export type CompiledBrand = z.infer<typeof compiledBrandSchema>

export const compiledStudySchema = z.object({
  schema: z.literal(compiledSchemaUrl),
  id: z.string(),
  name: z.string(),
  label: z.string(),
  users: usersSchema,
  purpose: z.string(),
  environment: z.string(),
  product: z.string(),
  author: z.string(),
  record: z.enum(['events', 'video']),
  actors: z.array(z.enum(['human', 'agent'])),
  independent: z.boolean().optional(),
  /** The agent configuration pinned into the run, with its fingerprint; present when the study admits the agent actor. */
  agents: z.object({ config: agentConfigSchema, fingerprint: z.string() }).optional(),
  sample: z.object({ affecting: z.number(), confidence: z.number(), n: z.number(), sentence: z.string() }),
  impression: compiledImpressionSchema,
  screener: z.array(screenerQuestionSchema),
  /** Whether link participants see the practice screen before the first look. */
  practice: z.boolean(),
  brand: compiledBrandSchema,
  goals: z.array(compiledGoalSchema),
  questions: z.array(compiledQuestionSchema),
  consent: compiledConsentSchema,
  derivations: z.array(z.object({ field: z.string(), rule: z.string(), source: z.string() })),
})
export type CompiledStudy = z.infer<typeof compiledStudySchema>

/**
 * A stored study as this version reads it. Runs compiled before the brand carried a name stored `{ accent?, poweredBy }`: the name is
 * filled as compileStudy fills it (the author, else the product) and `poweredBy` is dropped, since participants never see our name.
 */
export function readCompiled<T extends { author: string; product: string; brand: unknown }>(study: T): T {
  const stored = study.brand as (Partial<CompiledBrand> & { poweredBy?: unknown }) | undefined
  if (!stored || (typeof stored.name === 'string' && !('poweredBy' in stored))) return study
  const { poweredBy: _dropped, ...brand } = stored
  return { ...study, brand: { ...brand, name: typeof brand.name === 'string' ? brand.name : study.author || study.product } }
}
/** A stored run with its study read as this version reads it. */
export const readRun = <T extends { compiled: CompiledStudy }>(run: T): T => ({ ...run, compiled: readCompiled(run.compiled) })
