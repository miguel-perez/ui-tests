import { z } from 'zod'
import { numberedRevisionSchema } from '../revisions.ts'
import { compiledGoalSchema, compiledStudySchema } from '../schema/compiled.ts'

export const RUN_RECORD_SCHEMA_ID = 'https://ui-tests.com/schemas/run-record.v1.json' as const

const hookResult = z.object({
  status: z.enum(['correct', 'incorrect', 'unknown']),
  reason: z.string().optional(),
  diff: z.object({ expected: z.unknown().optional(), actual: z.unknown().optional() }).optional(),
})
const verification = hookResult.extend({
  steps: z.array(hookResult.extend({ name: z.string() })),
  answer: hookResult.optional(),
})

/** The compiled study as the record carries it: the expected answer of a validation question stays with the author. */
const recordedGoal = compiledGoalSchema.extend({ answer: z.object({ question: z.string(), choices: z.array(z.string()) }).optional() })
const recordedStudy = compiledStudySchema.extend({ goals: z.array(recordedGoal) })

const handle = z.object({
  run: z.string(),
  key: z.string(),
  context: z.object({ users: compiledStudySchema.shape.users, purpose: z.string(), id: z.string() }),
  build: z.object({ url: z.string(), commit: z.string() }),
  actor: z.enum(['human', 'agent']),
  states: z.object({
    recruitment: z.enum(['open', 'filled', 'paused', 'stopped']),
    collection: z.enum(['waiting', 'collecting', 'complete']),
    verification: z.enum(['pending', 'complete', 'instrumentation-problem']),
    payment: z.enum(['none', 'reserved', 'paid', 'trued-up']),
  }),
  result: z.enum(['pending', 'problems-found', 'none-found', 'inconclusive']),
  deadline: z.string(),
  revision: z.number(),
})

/** "asked": the answer is stored (its code may be "no answer"); "never asked": the picture could not be taken, so no question was put; "off": the study has no first look; "pending": not reached yet. */
export const firstLookStates = ['asked', 'never asked', 'off', 'pending'] as const

const attempt = z.object({
  id: z.string(),
  /** The opaque runner id; identity never leaves the source adapter. */
  participant: z.string(),
  goalIndex: z.number(),
  status: z.enum(['created', 'consented', 'active', 'questions', 'finished']),
  source: z.literal('link'),
  /** What this person agreed to, and only that. */
  purposes: z.array(z.string()),
  /** The source's own restrictions (panel terms); none for a link. */
  restrictions: z.array(z.string()),
  /** The study's purposes this person did not agree to (what `purposes` leaves out). */
  purposesDeclined: z.array(z.string()),
  reason: z.enum(['done', 'gave up', 'timeout', 'withdrew', 'disconnected']).nullable(),
  verification: verification.nullable(),
  timings: z.object({ startedAt: z.string().optional(), endedAt: z.string().optional(), onGoalMs: z.number().optional() }),
  path: z.array(z.string()),
  firstLook: z.enum(firstLookStates),
  answers: z.record(z.string(), z.unknown()),
  environment: z.record(z.string(), z.string()),
  flags: z.array(z.string()),
  rehearsal: z.boolean(),
})

const goalMeasures = z.object({
  effectiveness: z.object({ reached: z.number(), n: z.number(), unknown: z.number() }),
  efficiency: z.object({ medianAllMs: z.number().optional(), medianVerifiedMs: z.number().optional(), deviations: z.number() }),
  satisfaction: z.object({ ease: z.array(z.number()), confidence: z.array(z.number()) }),
})

const issue = z.object({
  id: z.string(),
  goalIndex: z.number(),
  where: z.object({ page: z.string(), element: z.string().optional(), step: z.number().optional() }),
  title: z.string(),
  participants: z.array(z.string()),
  count: z.string(),
  impact: z.enum(['blocked', 'slowed', 'confused']),
  words: z.array(z.object({ participant: z.string(), text: z.string() })),
  access: z.array(z.string()),
  moments: z.array(z.object({ attempt: z.string(), at: z.number() })),
  recovered: z.array(z.string()),
  suggestedChange: z.string(),
  source: z.literal('found from traces'),
})

const money = z.object({ estimate: z.number(), reserved: z.number(), paid: z.number(), truedUp: z.number(), currency: z.string() })
const funnel = z.object({ invited: z.number(), screened: z.number(), started: z.number(), finished: z.number(), paid: z.number() })
export const clauseSchema = z.object({ clause: z.string(), title: z.string(), shows: z.string() })

export const runRecordSchema = z
  .object({
    schema: z.literal(RUN_RECORD_SCHEMA_ID),
    actor: z.enum(['human', 'agent']),
    revision: z.number(),
    handle,
    compiled: recordedStudy,
    derivations: compiledStudySchema.shape.derivations,
    attempts: z.array(attempt),
    measures: z.object({
      byGoal: z.record(z.string(), goalMeasures),
      satisfaction: z.object({ uxLite: z.object({
        n: z.number(), scores: z.array(z.number()), mean: z.number().optional(),
        /** The usefulness item on its own (adoption signal), each response as (response - 1) x 25. */
        useful: z.object({ scores: z.array(z.number()), mean: z.number().optional() }),
        easy: z.object({ scores: z.array(z.number()), mean: z.number().optional() }),
      }) }),
      fit: z.object({ scores: z.array(z.number()), summary: z.object({ n: z.number(), mean: z.number().optional(), outOf: z.number() }) }),
    }),
    impression: z.object({
      named: z.number(), didNot: z.number(), noAnswer: z.number(),
      /** People the first look was put to. People it was never asked of are in `neverAsked`, not here. */
      neverAsked: z.number(),
      denominator: z.number(),
      firstClickOnPath: z.object({ onPath: z.number(), offPath: z.number(), of: z.number() }),
      limits: z.string(),
    }),
    fit: z.object({ screened: z.number(), matched: z.number(), summary: z.string() }),
    issues: z.array(issue),
    money,
    quality: z.object({
      attempts: z.number(), counted: z.number(), rehearsal: z.number(), withdrawn: z.number(), disconnected: z.number(), retired: z.number(),
      awaitingVerification: z.number(), truncatedReplays: z.number(), instrumentationProblem: z.boolean(), flags: z.array(z.string()),
    }),
    /** Every revision the author made, numbered from one, with who and when; `undone` ones are kept. `handle.revision` goes up with each. */
    revisions: z.array(numberedRevisionSchema),
    /** People the author excluded as not the audience: out of n and the counts, still in `attempts`, and still paid. */
    exclusions: z.array(z.object({ attempt: z.string(), reason: z.string(), by: z.string(), at: z.string(), revision: z.number(), staysPaid: z.literal(true) })),
    /** Scenario wording and promoted paths still to paste into the study file. */
    studyEdits: z.array(z.object({ goalIndex: z.number(), scenario: z.string().optional(), path: z.array(z.string()).optional() })),
    incentive: z.object({ amount: z.object({ minor: z.number(), currency: z.string() }).optional(), attempts: z.record(z.string(), z.object({ minor: z.number(), currency: z.string() })) }).optional(),
    recruitment: z.record(z.string(), funnel),
    sentence: z.string(),
    evidence: z.array(clauseSchema),
    evidenceStatement: z.string(),
  })
  .meta({ title: 'ui-tests run record', description: `Published at ${RUN_RECORD_SCHEMA_ID}; the file names it in its schema field.` })

export type RunRecord = z.infer<typeof runRecordSchema>
export type Clause = z.infer<typeof clauseSchema>

/**
 * The published JSON Schema: zod's output with the schema's own `$id`, and the root left open so a later v1 addition (revisions detail,
 * agent trials) does not make a v1 validator reject a newer record. Everything below the root stays closed.
 */
export function runRecordJsonSchema(): Record<string, unknown> {
  const { additionalProperties: _closed, ...schema } = z.toJSONSchema(runRecordSchema) as Record<string, unknown>
  return { $schema: schema.$schema, $id: RUN_RECORD_SCHEMA_ID, ...schema }
}
