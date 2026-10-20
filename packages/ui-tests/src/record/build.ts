import { applyRevisions } from '../revisions.ts'
import { clusterIssues, retitleWithModel } from '../issues.ts'
import { medians, uxLite } from '../measures.ts'
import type { TextModel } from '../model.ts'
import { FIRST_LOOK_SHOT, FIRST_LOOK_SKIPPED } from '../runner/screenshot.ts'
import { countsTowardN, handleOf } from '../runner/progress.ts'
import type { AttemptRow, HookResult, RunStore, Verification } from '../store/types.ts'
import { buildTrace, type TraceAttempt } from '../trace/build.ts'
import { clauseEvidence, EVIDENCE_STATEMENT } from './clauses.ts'
import { RUN_RECORD_SCHEMA_ID, runRecordSchema, type RunRecord } from './schema.ts'

const FIT_OUT_OF = 7
const LIMITS =
  'The first look is a 500 ms flash and one open answer, coded by a rule or a model from the words given. It shows whether people name the purpose from the first screen; it is a signal from the people who answered, not a measure of how well the page is remembered or understood.'

const mean = (values: number[]) => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : undefined)
const numbers = (values: unknown[]) => values.filter((v): v is number => typeof v === 'number')

/** Answers as the record carries them: without the raw screener answers, recording references or voice blobs. */
function exportedAnswers(answers: Record<string, unknown>): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(answers)) {
    if (key === 'screener' || key === FIRST_LOOK_SHOT || key.endsWith('.voice')) continue
    kept[key] = value
  }
  return kept
}

/** A verdict without the author's expected answer: whenever the task asks a validation question, no verdict carries an `expected` in its diff. */
function withoutExpected<T extends HookResult>(result: T): T {
  if (!result.diff) return result
  return { ...result, diff: { actual: result.diff.actual } }
}
function exportedVerification(v: Verification | undefined, asksQuestion: boolean): Verification | null {
  if (!v) return null
  const strip = asksQuestion || v.answer !== undefined
  return { ...(strip ? withoutExpected(v) : v), steps: v.steps, ...(v.answer && { answer: withoutExpected(v.answer) }) }
}

function firstLookOf(on: boolean, attempt: AttemptRow, item: TraceAttempt): RunRecord['attempts'][number]['firstLook'] {
  if (typeof attempt.answers[FIRST_LOOK_SKIPPED] === 'string') return 'never asked'
  if (item.impression) return 'asked'
  return on ? 'pending' : 'off'
}

/** Everything a consumer needs about one run, read from the store: nothing here comes from the participant's browser. */
export async function buildRecord(store: RunStore, runId: string, options: { model?: TextModel; currency?: string } = {}): Promise<RunRecord> {
  const trace = await buildTrace(store, runId)
  const { run, compiled } = trace
  const n = compiled.sample.n
  const revisions = await store.listRevisions(runId)
  const issues = await retitleWithModel(clusterIssues({ n, attempts: trace.attempts.map(({ attempt, signals }) => ({ attempt, signals })) }), options.model)

  const attempts: RunRecord['attempts'] = trace.attempts.map(item => {
    const { attempt } = item
    const goal = compiled.goals[attempt.goalIndex]
    const consented = attempt.status !== 'created'
    return {
      id: attempt.id,
      participant: attempt.participant,
      goalIndex: attempt.goalIndex,
      status: attempt.status,
      source: 'link',
      purposes: attempt.purposes,
      restrictions: [],
      purposesDeclined: consented ? compiled.consent.purposes.filter(p => !attempt.purposes.includes(p)) : [],
      reason: attempt.reason ?? null,
      verification: exportedVerification(attempt.verification, goal?.answer !== undefined),
      timings: { ...(attempt.startedAt && { startedAt: attempt.startedAt }), ...(attempt.endedAt && { endedAt: attempt.endedAt }), ...item.timings },
      path: item.path,
      firstLook: firstLookOf(compiled.impression.on, attempt, item),
      answers: exportedAnswers(attempt.answers),
      environment: attempt.environment ?? {},
      flags: attempt.flags,
      rehearsal: attempt.rehearsal,
    }
  })

  const byGoal: RunRecord['measures']['byGoal'] = {}
  for (const goal of compiled.goals) {
    const mine = trace.attempts.filter(t => t.attempt.goalIndex === goal.index && countsTowardN(t.attempt))
    const timed = mine.map(t => ({ ...(t.timings.onGoalMs !== undefined && { durationMs: t.timings.onGoalMs }), verified: t.attempt.verification?.status === 'correct' }))
    const { allMs, verifiedMs } = medians(timed)
    byGoal[String(goal.index)] = {
      effectiveness: {
        reached: mine.filter(t => t.attempt.verification?.status === 'correct').length,
        n: mine.length,
        unknown: mine.filter(t => t.attempt.verification?.status === 'unknown').length,
      },
      efficiency: {
        ...(allMs !== undefined && { medianAllMs: allMs }),
        ...(verifiedMs !== undefined && { medianVerifiedMs: verifiedMs }),
        deviations: mine.filter(t => t.signals.some(s => s.kind === 'deviation')).length,
      },
      satisfaction: {
        ease: numbers(mine.map(t => t.attempt.answers[`goal${goal.index}.ease`])),
        confidence: numbers(mine.map(t => t.attempt.answers[`goal${goal.index}.confidence`])),
      },
    }
  }

  const live = trace.attempts.filter(t => !t.attempt.rehearsal && !t.attempt.flags.includes('excluded') && t.attempt.reason !== 'withdrew' && t.attempt.reason !== 'disconnected' && !t.attempt.flags.includes('retired'))
  const rated = live.flatMap(({ attempt }) => {
    const { useful, easy } = attempt.answers
    const point = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5
    return point(useful) && point(easy) ? [uxLite(useful as 1, easy as 1)] : []
  })
  const scores = rated.map(r => r.score)
  const usefulScores = rated.map(r => r.useful)
  const easyScores = rated.map(r => r.easy)
  const screened = live.filter(t => t.screener)
  const fitTotals = screened.map(t => t.screener!.fit.total)
  const matched = screened.filter(t => t.screener!.matches).length

  const asked = live.filter(t => t.impression)
  const clicks = asked.flatMap(t => (t.impression!.firstClick && t.impression!.firstClick.onPath !== null ? [t.impression!.firstClick.onPath] : []))
  const named = asked.filter(t => t.impression!.code === 'named the purpose').length
  const didNot = asked.filter(t => t.impression!.code === 'did not name it').length
  const noAnswer = asked.filter(t => t.impression!.code === 'no answer').length

  const real = trace.attempts.filter(t => !t.attempt.rehearsal)
  const funnelOf = (rows: TraceAttempt[]) => ({
    invited: rows.filter(t => !t.attempt.flags.includes('retired')).length,
    screened: rows.filter(t => t.screener).length,
    started: rows.filter(t => t.attempt.startedAt !== undefined).length,
    finished: rows.filter(t => t.attempt.status === 'finished').length,
    paid: 0,
  })

  const partial = {
    schema: RUN_RECORD_SCHEMA_ID,
    actor: run.actor,
    revision: run.revision,
    handle: handleOf(run),
    compiled,
    derivations: compiled.derivations,
    attempts,
    measures: {
      byGoal,
      satisfaction: {
        uxLite: {
          n: scores.length, scores, ...(mean(scores) !== undefined && { mean: mean(scores) }),
          useful: { scores: usefulScores, ...(mean(usefulScores) !== undefined && { mean: mean(usefulScores) }) },
          easy: { scores: easyScores, ...(mean(easyScores) !== undefined && { mean: mean(easyScores) }) },
        },
      },
      fit: { scores: fitTotals, summary: { n: fitTotals.length, ...(mean(fitTotals) !== undefined && { mean: mean(fitTotals) }), outOf: FIT_OUT_OF } },
    },
    impression: {
      named, didNot, noAnswer,
      neverAsked: live.filter(t => typeof t.attempt.answers[FIRST_LOOK_SKIPPED] === 'string').length,
      denominator: asked.length,
      firstClickOnPath: { onPath: clicks.filter(Boolean).length, offPath: clicks.filter(c => !c).length, of: clicks.length },
      limits: LIMITS,
    },
    fit: {
      screened: screened.length,
      matched,
      summary: screened.length
        ? `${matched} of ${screened.length} screened ${screened.length === 1 ? 'person matched' : 'people matched'} the stated users; mean fit to the purpose ${mean(fitTotals)} of ${FIT_OUT_OF}.`
        : 'No one answered the screener.',
    },
    issues,
    money: { estimate: 0, reserved: 0, paid: 0, truedUp: 0, currency: options.currency ?? 'USD' },
    quality: {
      attempts: trace.attempts.length,
      counted: trace.attempts.filter(t => countsTowardN(t.attempt)).length,
      rehearsal: trace.attempts.filter(t => t.attempt.rehearsal).length,
      withdrawn: trace.attempts.filter(t => t.attempt.reason === 'withdrew').length,
      disconnected: trace.attempts.filter(t => t.attempt.reason === 'disconnected').length,
      retired: trace.attempts.filter(t => t.attempt.flags.includes('retired')).length,
      awaitingVerification: trace.attempts.filter(t => t.attempt.status === 'finished' && t.attempt.reason !== 'disconnected' && !t.attempt.verification).length,
      truncatedReplays: trace.attempts.filter(t => t.replayTruncated).length,
      instrumentationProblem: run.states.verification === 'instrumentation-problem',
      flags: [...new Set(trace.attempts.flatMap(t => t.attempt.flags))].sort(),
    },
    revisions: [],
    exclusions: [],
    studyEdits: [],
    recruitment: { link: funnelOf(real) },
    sentence: trace.sentence,
  }
  const revised = applyRevisions(partial as Omit<RunRecord, 'evidence' | 'evidenceStatement'>, revisions)
  const record = { ...revised, evidence: clauseEvidence(revised), evidenceStatement: EVIDENCE_STATEMENT }
  // Parsing drops anything the schema does not name, so a field added upstream cannot leak into the record.
  return runRecordSchema.parse(record)
}
