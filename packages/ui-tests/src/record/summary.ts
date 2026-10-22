import { PART_LABELS, TOUR_PARTS } from '../derive/tour.ts'
import type { RunRecord } from './schema.ts'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const CRITERIA: Record<string, string> = { recency: 'when they last did it', often: 'how often they do it', role: 'the role', uses: 'the tools they use', insider: 'the insider exclusion', professional: 'the professional exclusion', not: "the study's own exclusions" }
const criterionName = (key: string) => CRITERIA[key.replace(/\.\d+$/, '')] ?? key

/**
 * Who took part, group by group: each group's n, its detection sentence, whether it filled and how many issues its people met; then
 * the people the screener placed in no group, and any criterion most of the screened fell outside. A study of one group says only the
 * last two, as it always has.
 */
export function groupLines(record: Pick<RunRecord, 'groups' | 'screened'>): string[] {
  const lines: string[] = []
  if (record.groups.length > 1) {
    for (const g of record.groups) {
      lines.push(`${g.name}: ${g.n} of ${g.quota}. ${g.sentence}${g.filled ? '' : ' This group did not fill.'} ${plural(g.issues.length, 'issue', 'issues')} among its people.`)
    }
    if (record.screened.noGroup) lines.push(`${plural(record.screened.noGroup, 'person', 'people')} screened met no group's criteria; they are counted in no group.`)
  }
  const { n, outside } = record.screened
  for (const { criterion, count } of outside) if (count * 2 > n) lines.push(`Most people screened (${count} of ${n}) fell outside ${criterionName(criterion)}.`)
  return lines
}

/** The first look in words, beside the issues and never counted in them: each part, and the answers nobody has coded yet. */
export function firstLookLines(record: Pick<RunRecord, 'impression'>): string[] {
  const { answered, coded, parts, noAnswer, uncoded } = record.impression
  if (!answered && !noAnswer) return []
  const lines: string[] = []
  if (coded) lines.push(`First look, of ${coded} coded ${coded === 1 ? 'answer' : 'answers'}: ${TOUR_PARTS.map(p => `${parts[p]} ${PART_LABELS[p]}`).join(', ')}.`)
  if (noAnswer) lines.push(`${plural(noAnswer, 'person', 'people')} gave no answer to the first look.`)
  if (uncoded.length) lines.push(`${plural(uncoded.length, 'first-look answer is', 'first-look answers are')} not coded yet (${[...new Set(uncoded.map(u => u.reason))].join('; ')}); code them in the trace.`)
  return lines
}
