import type { RunRecord } from './record/schema.ts'

export type Purpose = 'words' | 'recordings' | 'workflow'

/** The consent purpose (derive/consent.ts) each kind of reading needs. */
const needs: Record<Purpose, string> = {
  words: 'model-assisted analysis of the trace',
  recordings: 'analysis by the author',
  workflow: 'sharing the record with an automated workflow',
}

/**
 * Whether a consumer may read an attempt's words, recording or hand it to a workflow: only what the person agreed to, and nothing the
 * source's own restrictions rule out (`no-<purpose>`). An attempt with no purposes, or a purpose they declined, is not read.
 */
export function canRead(attempt: { purposes: string[]; restrictions: string[] }, purpose: Purpose): boolean {
  return attempt.purposes.includes(needs[purpose]) && !attempt.restrictions.includes(`no-${purpose}`)
}

/** Agent results may serve as an optimisation signal; human results never do. */
export const optimisable = (record: Pick<RunRecord, 'actor'>): boolean => record.actor === 'agent'

/** Records of one actor, together. Human and agent records are separate and no aggregate is computed across them. */
export function combine<T extends Pick<RunRecord, 'actor'>>(records: T[]): { actor: T['actor'] | undefined; records: T[] } {
  const actors = new Set(records.map(r => r.actor))
  if (actors.size > 1) throw new Error('human and agent records are never combined')
  return { actor: records[0]?.actor, records }
}
