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
 * One screener question with the rule of each option. The rules, groups and `field` stay on the author's side: `participantView` copies
 * the labels only, in the order this participant sees them. `ordered` options (a scale) keep their order; the rest are shuffled.
 */
export const screenerQuestionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.object({
    label: z.string(),
    rule: z.enum(['accept', 'reject', 'may-select']),
    /** The groups this option accepts for; all of them when absent. */
    groups: z.array(z.string()).optional(),
    /** On the exclusions question: which exclusion the option is. */
    exclusion: z.enum(['insider', 'professional', 'author']).optional(),
  })),
  multi: z.boolean(),
  ordered: z.boolean(),
  criterion: z.enum(['recency', 'often', 'role', 'uses', 'not']),
  /** Where the question comes from: a `users` field. */
  field: z.string(),
  /** How the question is read, in words. */
  rule: z.string(),
  /** The groups the question screens for, when not all of them. */
  groups: z.array(z.string()).optional(),
  /** Read from a `users` sentence rather than written by the author. */
  inferred: z.boolean().optional(),
})
export type CompiledScreenerQuestion = z.infer<typeof screenerQuestionSchema>

/**
 * The first look, a home page tour: whether it runs (`on`), which page, the open prompt, the parts an answer is coded on, what the page
 * says (`says`, coded against; never the purpose) and where that came from, and `reason` saying why it is on or off.
 */
export const compiledImpressionSchema = z.object({
  on: z.boolean(),
  page: z.string().optional(),
  prompt: z.string(),
  parts: z.array(z.enum(['what', 'who', 'action', 'purpose'])),
  says: z.string().nullable(),
  source: z.enum(['h1', 'meta description', 'og:description', 'author']).nullable(),
  reason: z.string(),
})
export type CompiledImpression = z.infer<typeof compiledImpressionSchema>

/** A group of people sampled on its own, and how many it needs. One group, `everyone`, when the study does not split its people. */
export const compiledGroupSchema = z.object({ name: z.string(), quota: z.number() })

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

export const modelConfigSchema = z.object({ provider: z.enum(['anthropic', 'scripted']), name: z.string(), version: z.string().optional() })

export const agentConfigSchema = z.object({
  model: modelConfigSchema,
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

const criteriaShape = {
  did: z.string().optional(),
  within: z.string().optional(),
  often: z.string().optional(),
  role: z.union([z.array(z.string()), z.record(z.string(), z.number())]).optional(),
  uses: z.array(z.string()).optional(),
  not: z.array(z.string()).optional(),
}
/** The users as written, with `are` filled: written, or derived from `did` (the snapshot holds the derived one). */
const usersSchema = z.object({
  are: z.string(),
  ...criteriaShape,
  groups: z.array(z.object({ name: z.string(), quota: z.number().optional(), ...criteriaShape })).optional(),
  insiders: z.enum(['exclude', 'include']).optional(),
  professionals: z.enum(['exclude', 'include']).optional(),
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
  /** The config's `model`, pinned into the run: the server codes the first look with it, through its own `ANTHROPIC_API_KEY`. */
  model: modelConfigSchema.optional(),
  sample: z.object({ affecting: z.number(), confidence: z.number(), n: z.number(), sentence: z.string() }),
  impression: compiledImpressionSchema,
  /** The groups sampled, with their quotas; `sample.n` is their total. */
  groups: z.array(compiledGroupSchema),
  /** The screens before consent, at most five. */
  screener: z.array(screenerQuestionSchema),
  /** Asked after consent, optional, and filters nobody: the assistive technology a person uses. */
  assistive: z.object({ id: z.string(), text: z.string(), options: z.array(z.string()) }),
  /** The purpose as said to the participant, in the second person; only the scenario card says it, after the first look. */
  purposeToYou: z.string(),
  /** The screener and the first look come from a snapshot that is missing or out of date: a rehearsal shows them as drafts. */
  draft: z.boolean(),
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
export function readCompiled<T extends { author: string; product: string; brand: unknown }>(input: T): T {
  // A run compiled before groups and the tour has one group of everyone and no first look left to ask; its other answers read as stored.
  const old = input as unknown as Partial<CompiledStudy> & { sample?: { n: number } }
  const study = (old.groups || !old.impression || 'prompt' in old.impression ? input : {
    ...input,
    groups: [{ name: 'everyone', quota: old.sample?.n ?? 0 }],
    assistive: { id: 'assistive', text: '', options: [] },
    purposeToYou: old.purpose ?? '',
    draft: false,
    screener: [],
    impression: { on: false, prompt: '', parts: [], says: null, source: null, reason: 'off: compiled before the first look was a tour' },
  }) as T
  const stored = study.brand as (Partial<CompiledBrand> & { poweredBy?: unknown }) | undefined
  if (!stored || (typeof stored.name === 'string' && !('poweredBy' in stored))) return study
  const { poweredBy: _dropped, ...brand } = stored
  return { ...study, brand: { ...brand, name: typeof brand.name === 'string' ? brand.name : study.author || study.product } }
}
/** A stored run with its study read as this version reads it. */
export const readRun = <T extends { compiled: CompiledStudy }>(run: T): T => (run.compiled ? { ...run, compiled: readCompiled(run.compiled) } : run)
