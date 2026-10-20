import { z } from 'zod'
import type { RunRecord } from './record/schema.ts'

const money = z.object({ minor: z.number().int().nonnegative(), currency: z.string().min(1) })
const base = { at: z.string().min(1), by: z.string().min(1) }

/**
 * One revision of a run, made in the local trace viewer. The run is never edited: each of these is added beside it, attributed, and can be
 * undone by a later `undo`. `attempt` is an attempt id; `issue` an issue id of the record; `revision` (in `undo`) the 1-based number of an earlier one.
 */
export const revisionSchema = z.discriminatedUnion('kind', [
  /** "Not my audience": the person leaves n and the counts, and stays paid. */
  z.object({ ...base, kind: z.literal('exclude'), attempt: z.string().min(1), reason: z.string().trim().min(1) }),
  z.object({ ...base, kind: z.literal('incentive'), attempt: z.string().min(1).optional(), amount: money }),
  z.object({ ...base, kind: z.literal('issue-edit'), issue: z.string().min(1), title: z.string().trim().min(1).optional(), suggestedChange: z.string().trim().min(1).optional() }),
  z.object({ ...base, kind: z.literal('issue-merge'), issues: z.array(z.string().min(1)).min(2) }),
  /** `moments`: the attempt ids that go to each new issue. */
  z.object({ ...base, kind: z.literal('issue-split'), issue: z.string().min(1), moments: z.array(z.array(z.string().min(1)).min(1)).min(2) }),
  z.object({ ...base, kind: z.literal('scenario'), goalIndex: z.number().int().nonnegative(), text: z.string().trim().min(1) }),
  z.object({ ...base, kind: z.literal('promote-path'), goalIndex: z.number().int().nonnegative(), path: z.array(z.string().min(1)).min(1) }),
  z.object({ ...base, kind: z.literal('code-impression'), attempt: z.string().min(1), code: z.enum(['named the purpose', 'did not name it', 'no answer']) }),
  z.object({ ...base, kind: z.literal('undo'), revision: z.number().int().positive() }),
])
export type Revision = z.infer<typeof revisionSchema>
export type RevisionKind = Revision['kind']

/** A revision as the record carries it: its number, and whether a later `undo` has taken it back. */
export const numberedRevisionSchema = z.object({ number: z.number().int().positive(), undone: z.boolean(), revision: revisionSchema })
export type NumberedRevision = z.infer<typeof numberedRevisionSchema>

/** Numbers the revisions from one and marks the ones a later `undo` took back. An `undo` that names nothing earlier, or another `undo`, takes nothing back. */
export function numbered(revisions: Revision[]): NumberedRevision[] {
  const rows = revisions.map((revision, i): NumberedRevision => ({ number: i + 1, undone: false, revision }))
  for (const row of rows) {
    if (row.revision.kind !== 'undo') continue
    const target = rows[row.revision.revision - 1]
    if (target && target.number < row.number && target.revision.kind !== 'undo') target.undone = true
  }
  return rows
}

/** The revisions in force: not undone, and not an `undo` themselves. */
export const inForce = (revisions: Revision[]): NumberedRevision[] => numbered(revisions).filter(r => !r.undone && r.revision.kind !== 'undo')

export type Exclusion = { attempt: string; reason: string; by: string; at: string; revision: number }

/** Attempts excluded from n by a revision in force. The person stays paid: nothing here touches what is owed. */
export function exclusionsOf(revisions: Revision[]): Exclusion[] {
  const found = new Map<string, Exclusion>()
  for (const { number, revision } of inForce(revisions)) {
    if (revision.kind === 'exclude') found.set(revision.attempt, { attempt: revision.attempt, reason: revision.reason, by: revision.by, at: revision.at, revision: number })
  }
  return [...found.values()]
}

export type StudyEdit = { goalIndex: number; scenario?: string; path?: string[] }

/** What the author still has to paste into the study file: the latest scenario wording and promoted path of each task, in task order. */
export function pendingStudyEdits(revisions: Revision[]): StudyEdit[] {
  const byGoal = new Map<number, StudyEdit>()
  for (const { revision } of inForce(revisions)) {
    if (revision.kind !== 'scenario' && revision.kind !== 'promote-path') continue
    const edit = byGoal.get(revision.goalIndex) ?? { goalIndex: revision.goalIndex }
    if (revision.kind === 'scenario') edit.scenario = revision.text
    else edit.path = revision.path
    byGoal.set(revision.goalIndex, edit)
  }
  return [...byGoal.values()].sort((x, y) => x.goalIndex - y.goalIndex)
}

const quoted = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

/** The TypeScript to paste into the task's options for one edit. */
export function studyEditSnippet(edit: StudyEdit): string[] {
  return [
    ...(edit.scenario !== undefined ? [`scenario: ${quoted(edit.scenario)},`] : []),
    ...(edit.path ? [`path: [${edit.path.map(quoted).join(', ')}],`] : []),
  ]
}

type Issue = RunRecord['issues'][number]
const impactRank = { blocked: 0, slowed: 1, confused: 2 } as const

function mergeIssues(issues: Issue[], ids: string[], n: number): Issue[] {
  const members = ids.map(id => issues.find(issue => issue.id === id)).filter((issue): issue is Issue => issue !== undefined)
  if (members.length < 2) return issues
  const [first] = members
  const participants = [...new Set(members.flatMap(issue => issue.participants))]
  const merged: Issue = {
    ...first!,
    participants,
    count: `${participants.length} of ${n}`,
    impact: members.map(issue => issue.impact).sort((x, y) => impactRank[x] - impactRank[y])[0]!,
    words: members.flatMap(issue => issue.words).filter((w, i, all) => all.findIndex(o => o.participant === w.participant && o.text === w.text) === i),
    access: [...new Set(members.flatMap(issue => issue.access))].sort(),
    moments: members.flatMap(issue => issue.moments).sort((x, y) => x.at - y.at),
    recovered: [...new Set(members.flatMap(issue => issue.recovered))],
  }
  const gone = new Set(members.slice(1).map(issue => issue.id))
  return issues.filter(issue => !gone.has(issue.id)).map(issue => (issue.id === first!.id ? merged : issue))
}

function splitIssue(issues: Issue[], id: string, groups: string[][], attemptsOf: Map<string, string>, n: number): Issue[] {
  const source = issues.find(issue => issue.id === id)
  if (!source) return issues
  const pieces = groups.map((group, i): Issue => {
    const mine = new Set(group)
    const participants = [...new Set(group.flatMap(attempt => (attemptsOf.has(attempt) ? [attemptsOf.get(attempt)!] : [])))].filter(p => source.participants.includes(p))
    return {
      ...source,
      id: `${id}#${i + 1}`,
      participants,
      count: `${participants.length} of ${n}`,
      words: source.words.filter(w => participants.includes(w.participant)),
      moments: source.moments.filter(m => mine.has(m.attempt)),
      recovered: source.recovered.filter(p => participants.includes(p)),
    }
  })
  return issues.flatMap(issue => (issue.id === id ? pieces : [issue]))
}

/**
 * The record with the author's revisions in force laid over it. The attempts, the compiled study and the stored run stay as they were: issues are
 * edited, merged and split here, and the revisions, the exclusions (with their reasons, and that the person stays paid), the incentive and the
 * edits still to paste into the study file are listed beside them. What leaves n is decided where the attempts are counted, not here.
 */
export function applyRevisions<T extends Omit<RunRecord, 'evidence' | 'evidenceStatement'>>(record: T, revisions: Revision[]): T {
  const n = record.compiled.sample.n
  const participantOf = new Map(record.attempts.map(a => [a.id, a.participant]))
  let issues = record.issues
  let incentive: { amount?: z.infer<typeof money>; attempts: Record<string, z.infer<typeof money>> } | undefined
  for (const { revision } of inForce(revisions)) {
    switch (revision.kind) {
      case 'issue-edit':
        issues = issues.map(issue => (issue.id === revision.issue ? { ...issue, ...(revision.title && { title: revision.title }), ...(revision.suggestedChange && { suggestedChange: revision.suggestedChange }) } : issue))
        break
      case 'issue-merge': issues = mergeIssues(issues, revision.issues, n); break
      case 'issue-split': issues = splitIssue(issues, revision.issue, revision.moments, participantOf, n); break
      case 'incentive':
        incentive ??= { attempts: {} }
        if (revision.attempt) incentive.attempts[revision.attempt] = revision.amount
        else incentive.amount = revision.amount
        break
      default: break
    }
  }
  return {
    ...record,
    issues,
    revisions: numbered(revisions),
    exclusions: exclusionsOf(revisions).map(e => ({ ...e, staysPaid: true as const })),
    studyEdits: pendingStudyEdits(revisions),
    ...(incentive && { incentive }),
  }
}
