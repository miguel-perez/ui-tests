import { z } from 'zod'

export const compiledSchemaUrl = 'https://ui-tests.com/schemas/compiled-study.v1.json' as const

const timeout = z.object({ seconds: z.number(), rule: z.string() })

/**
 * One question, minimal on purpose so the impression (Task 4) and screener (Task 19) can extend it: a stable `id`,
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
 * The first look at the start page. Task 4 fills the details; here: whether it runs, which page, and the fixed
 * words and timing. `enabled: false` leaves the rest out.
 */
export const compiledImpressionSchema = z.object({
  enabled: z.boolean(),
  page: z.string().optional(),
  flashMs: z.number().optional(),
  question: z.string().optional(),
  codes: z.array(z.string()).optional(),
})
export type CompiledImpression = z.infer<typeof compiledImpressionSchema>

/**
 * What the participant is asked to agree to. Task 4 fills `purposes` (the consent lines shown, in order); the
 * compiler only records the options that change them.
 */
export const compiledConsentSchema = z.object({
  workflows: z.boolean(),
  retentionDays: z.number(),
  purposes: z.array(z.string()),
})
export type CompiledConsent = z.infer<typeof compiledConsentSchema>

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
})
export type CompiledGoal = z.infer<typeof compiledGoalSchema>

const usersSchema = z.object({
  are: z.string(),
  did: z.string().optional(),
  within: z.string().optional(),
  often: z.string().optional(),
  role: z.string().optional(),
  uses: z.array(z.string()).optional(),
  not: z.array(z.string()).optional(),
  where: z.union([z.string(), z.array(z.string())]).optional(),
  language: z.string().optional(),
  age: z.union([z.string(), z.object({ min: z.number().optional(), max: z.number().optional() })]).optional(),
})

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
  sample: z.object({ affecting: z.number(), confidence: z.number(), n: z.number(), sentence: z.string() }),
  impression: compiledImpressionSchema,
  screener: z.array(compiledQuestionSchema),
  goals: z.array(compiledGoalSchema),
  questions: z.array(compiledQuestionSchema),
  consent: compiledConsentSchema,
  derivations: z.array(z.object({ field: z.string(), rule: z.string(), source: z.string() })),
})
export type CompiledStudy = z.infer<typeof compiledStudySchema>
