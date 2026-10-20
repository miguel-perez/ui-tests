import { buildRecord } from '../record/build.ts'
import { refreshRun, type ResultHook } from '../runner/progress.ts'
import { exclusionsOf, numbered, revisionSchema, type Revision } from '../revisions.ts'
import type { RunStore } from '../store/types.ts'

/** A revision as the author asks for it: who and when are added by the viewer, never taken from the request. */
export type RevisionRequest = Revision extends infer R ? (R extends Revision ? Omit<R, 'at' | 'by'> : never) : never

export class RevisionRefused extends Error {}

function refuse(message: string): never { throw new RevisionRefused(message) }

/**
 * Adds one revision to a run, attributed to `by`, and brings the run in line: an exclusion marks the attempt `excluded` (taking it out of n,
 * never out of the record), an `undo` lifts it again when no other exclusion stands, the run's revision number goes up, and the result is
 * settled again. The attempt, its recording and what is owed to the person are not touched. Returns the revision's number.
 */
export async function recordRevision(
  store: RunStore, runId: string, request: RevisionRequest,
  by: { by: string; now?: () => Date; onResult?: ResultHook },
): Promise<number> {
  const parsed = revisionSchema.safeParse({ ...request, at: (by.now ?? (() => new Date()))().toISOString(), by: by.by })
  if (!parsed.success) return refuse(parsed.error.issues.map(i => `${i.path.join('.') || 'revision'}: ${i.message}`).join('; '))
  const revision = parsed.data
  // Checking, the revision, the marks on attempts and the run's revision number are one unit: all happen or none.
  const number = await store.transaction(async tx => {
    const run = await tx.getRun(runId)
    if (!run) return refuse(`No such run: ${runId}`)
    const existing = await tx.listRevisions(runId)
    const attempts = await tx.listAttempts(runId)
    const attemptIds = new Set(attempts.map(a => a.id))
    const participantOf = (id: string) => attempts.find(a => a.id === id)?.participant
    const needAttempt = (id: string) => { if (!attemptIds.has(id)) refuse(`No such attempt in this run: ${id}`) }
    const needGoal = (index: number) => { if (index >= run.compiled.goals.length) refuse(`No task ${index} in this study`) }
    switch (revision.kind) {
      case 'exclude':
        needAttempt(revision.attempt)
        if (exclusionsOf(existing).some(e => participantOf(e.attempt) === participantOf(revision.attempt))) refuse('This person is already excluded')
        break
      case 'incentive':
        if (revision.attempt) needAttempt(revision.attempt)
        break
      case 'code-impression': {
        needAttempt(revision.attempt)
        const stored = attempts.find(a => a.id === revision.attempt)!.answers.impression as { code?: unknown } | undefined
        if (!stored || typeof stored !== 'object' || typeof stored.code !== 'string') refuse('This person gave no first-look answer to code')
        break
      }
      case 'scenario': case 'promote-path':
        needGoal(revision.goalIndex)
        break
      case 'issue-edit': case 'issue-merge': case 'issue-split': {
        const issues = (await buildRecord(tx, runId)).issues
        const find = (id: string) => issues.find(i => i.id === id) ?? refuse(`No such issue: ${id}`)
        if (revision.kind === 'issue-edit') {
          find(revision.issue)
          if (!revision.title && !revision.suggestedChange) refuse('Say what to change: a title or a suggested change')
        } else if (revision.kind === 'issue-merge') {
          const found = revision.issues.map(find)
          if (new Set(revision.issues).size !== revision.issues.length) refuse('Name each issue once')
          if (new Set(found.map(i => i.goalIndex)).size > 1) refuse('Issues of different tasks cannot be merged')
        } else {
          const source = find(revision.issue)
          const owned = new Set(source.moments.map(m => m.attempt))
          const seen = new Set<string>()
          for (const group of revision.moments) for (const id of group) {
            if (!owned.has(id)) refuse(`Attempt ${id} has no moment in this issue`)
            if (seen.has(id)) refuse('Each attempt goes to one new issue')
            seen.add(id)
          }
        }
        break
      }
      case 'undo': {
        const target = numbered(existing)[revision.revision - 1]
        if (!target) refuse(`No revision ${revision.revision}`)
        else if (target.revision.kind === 'undo') refuse('An undo cannot be undone; make the revision again instead')
        else if (target.undone) refuse(`Revision ${revision.revision} is already undone`)
        break
      }
    }


    const added = await tx.addRevision(runId, revision)
    // Excluding is about the person: every attempt of theirs carries the mark the counting reads; the revisions are the record of why.
    const standing = new Set(exclusionsOf([...existing, revision]).map(e => participantOf(e.attempt)))
    for (const attempt of await tx.listAttempts(runId)) {
      const marked = attempt.flags.includes('excluded')
      const should = standing.has(attempt.participant)
      if (marked !== should) await tx.updateAttempt(attempt.id, { flags: should ? [...attempt.flags, 'excluded'] : attempt.flags.filter(f => f !== 'excluded') })
    }
    const current = (await tx.getRun(runId))!
    if (!(await tx.updateRun(runId, {}, current.revision))) throw new Error('The run changed while the revision was being stored; nothing was stored. Try again.')
    return added
  })
  await refreshRun(store, runId, new Date(), by.onResult ? { onResult: by.onResult } : {})
  return number
}
