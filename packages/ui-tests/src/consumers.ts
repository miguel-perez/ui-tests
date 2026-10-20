import type { RunRecord } from './record/schema.ts'

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
 * The record as a consumer for `use` may read it: an attempt whose purposes do not include that use keeps no words (its text answers, and what it said
 * in the issues) and no recordings (the moments of its replay). Counts, verdicts and numbers stay: they are not the person's words or recording.
 */
export function readableRecord(record: RunRecord, use: Purpose): RunRecord {
  const closed = record.attempts.filter(a => !canRead(a, use))
  const byId = new Set(closed.map(a => a.id))
  const byParticipant = new Set(closed.map(a => a.participant))
  const numbersOnly = (answers: Record<string, unknown>) => Object.fromEntries(Object.entries(answers).filter(([, v]) => typeof v !== 'string'))
  return {
    ...record,
    attempts: record.attempts.map(a => byId.has(a.id) ? { ...a, answers: numbersOnly(a.answers) } : a),
    issues: record.issues.map(issue => ({
      ...issue,
      words: issue.words.filter(w => !byParticipant.has(w.participant)),
      moments: issue.moments.filter(m => !byId.has(m.attempt)),
    })),
  }
}
