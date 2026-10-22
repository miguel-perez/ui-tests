import type { RunRecord } from './record/schema.ts'
import { GOAL_ORDER } from './runner/sequence.ts'
import { MORE_TIME } from './server/view.ts'

/**
 * The answers that hold none of the person's words: codes, timings, scales and flags. An allowlist, so a free-text answer added later
 * (or one stored inside an object, like the first look's `text`) stays out until it is named here.
 */
const NON_WORDS = new Set(['uxliteVersion', MORE_TIME, 'replay-truncated', GOAL_ORDER, 'screenerResult', 'assistive'])
const GOAL_SCALE = /^goal\d+\.(ease|confidence)$/

/**
 * A verdict without the words the person typed as their answer to the task's question: its diff goes from the answer's verdict, and
 * from the overall verdict when that is the answer's. The status and reasons stay.
 */
export function withoutTypedAnswer<T extends { diff?: { actual?: unknown } | undefined; answer?: { diff?: { actual?: unknown } | undefined } | undefined }>(v: T | null | undefined): T | null {
  if (!v) return null
  if (!v.answer?.diff) return v
  const { diff: typed, ...answer } = v.answer
  const { diff, ...rest } = v
  const sameAsAnswer = diff !== undefined && JSON.stringify(diff.actual) === JSON.stringify(typed.actual)
  return { ...(sameAsAnswer ? rest : v), answer } as T
}

/** An attempt's answers with every word the person wrote or said taken out; the first look keeps its coded parts, never its text. */
function withoutWords(answers: Record<string, unknown>, scales: Set<string>): Record<string, unknown> {
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(answers)) {
    if (key === 'impression' && value && typeof value === 'object') {
      const { looked, parts, codedBy, uncoded } = value as Record<string, unknown>
      kept.impression = { looked, parts, ...(codedBy !== undefined && { codedBy }), ...(uncoded !== undefined && { uncoded }) }
    } else if (NON_WORDS.has(key) || ((GOAL_SCALE.test(key) || scales.has(key)) && typeof value === 'number')) kept[key] = value
  }
  return kept
}

export type Purpose = 'words' | 'recordings' | 'workflow'

/** The consent purpose (derive/consent.ts) each kind of reading needs. */
const needs: Record<Purpose, string> = {
  words: 'model-assisted analysis of the trace',
  recordings: 'analysis by the author',
  workflow: 'sharing the record with an automated workflow',
}

/**
 * Whether a consumer may read an attempt's words, recording or hand it to a workflow: only what the person agreed to, and only when
 * the source's own restrictions (panel terms; none for a link) are empty. An attempt with no purposes, or a purpose they declined, is not read.
 * The report page (`mayShow`) reads the same rule.
 */
export function canRead(attempt: { purposes: string[]; restrictions: string[] }, purpose: Purpose): boolean {
  return attempt.purposes.includes(needs[purpose]) && attempt.restrictions.length === 0
}

/** Agent results may serve as an optimisation signal; human results never do. */
export const optimisable = (record: Pick<RunRecord, 'actor'>): boolean => record.actor === 'agent'

/** Records of one actor, together. Human and agent records are separate and no aggregate is computed across them. */
export function combine<T extends Pick<RunRecord, 'actor'>>(records: T[]): { actor: T['actor'] | undefined; records: T[] } {
  const actors = new Set(records.map(r => r.actor))
  if (actors.size > 1) throw new Error('human and agent records are never combined')
  return { actor: records[0]?.actor, records }
}

/**
 * The record as a consumer for `use` may read it: an attempt whose purposes do not include that use keeps no words (its answers but
 * the coded and numeric ones, the typed answer in its verdict, and what it said in the issues) and no recordings (the moments of its replay). Counts, verdicts and numbers stay: they are not the person's words or recording.
 */
export function readableRecord(record: RunRecord, use: Purpose): RunRecord {
  const closed = record.attempts.filter(a => !canRead(a, use))
  const byId = new Set(closed.map(a => a.id))
  const byParticipant = new Set(closed.map(a => a.participant))
  const scales = new Set((record.compiled?.questions ?? []).filter(q => q.type === 'scale').map(q => q.id))
  return {
    ...record,
    attempts: record.attempts.map(a => byId.has(a.id) ? { ...a, answers: withoutWords(a.answers, scales), verification: withoutTypedAnswer(a.verification) } : a),
    issues: record.issues.map(issue => ({
      ...issue,
      words: issue.words.filter(w => !byParticipant.has(w.participant)),
      moments: issue.moments.filter(m => !byId.has(m.attempt)),
    })),
  }
}
