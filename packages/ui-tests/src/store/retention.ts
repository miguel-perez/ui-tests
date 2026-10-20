import { VIDEO_KEY } from '../video.ts'
import type { RunStore } from './types.ts'

export const RETENTION_DAYS = 90
const DAY_MS = 86_400_000

/**
 * Deletes what is older than the retention window (90 days unless told otherwise): blobs by the time they were stored, and the events
 * (the replay), snapshots and video references of every attempt that ended before the cutoff. What the person said and the verdicts stay;
 * the recording does not. Safe to run again: a second run finds nothing more. Returns how many things were deleted.
 */
export async function applyRetention(store: RunStore, now: Date, days = RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(now.getTime() - days * DAY_MS)
  let deleted = await store.deleteBlobsBefore(cutoff)
  for (const run of await store.listRuns()) {
    for (const attempt of await store.listAttempts(run.run)) {
      const when = Date.parse(attempt.endedAt ?? attempt.startedAt ?? '')
      if (!Number.isFinite(when) || when >= cutoff.getTime()) continue
      deleted += await store.deleteBlobs(attempt.id)
      deleted += await store.deleteEvents(attempt.id)
      deleted += await store.deleteSnapshots(attempt.id)
      if (attempt.answers[VIDEO_KEY] !== undefined) {
        const { [VIDEO_KEY]: _gone, ...answers } = attempt.answers
        await store.updateAttempt(attempt.id, { answers })
        deleted += 1
      }
    }
  }
  return deleted
}
