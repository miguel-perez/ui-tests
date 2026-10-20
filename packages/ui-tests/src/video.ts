/** The key in `attempt.answers` under which a screen video's chunks are listed. */
export const VIDEO_KEY = 'video'
/** The flag an attempt carries when the participant said no to sharing their screen. The attempt goes on with the event replay alone. */
export const VIDEO_DECLINED = 'video-declined'
/** The most bytes one video chunk may carry once decoded: five seconds of screen is well under it. */
export const VIDEO_CHUNK_BYTES = 5 * 1024 * 1024

/** One stored chunk: the recording it belongs to (its start, in epoch milliseconds), its place in it, and the blob that holds it. */
export type VideoChunk = { segment: number; seq: number; blob: string }

/** The chunks listed in an attempt's answers. */
export function videoChunks(answers: Record<string, unknown>): VideoChunk[] {
  const kept = (answers[VIDEO_KEY] as { chunks?: unknown } | undefined)?.chunks
  return Array.isArray(kept) ? (kept as VideoChunk[]) : []
}

/** The recordings of an attempt, in order: one for each time the participant shared their screen (a full page load ends a share). */
export type VideoSegments = { startedAt: number; chunks: number }[]

export function videoSegments(answers: Record<string, unknown>): VideoSegments {
  const counts = new Map<number, number>()
  for (const chunk of videoChunks(answers)) counts.set(chunk.segment, (counts.get(chunk.segment) ?? 0) + 1)
  return [...counts].map(([startedAt, chunks]) => ({ startedAt, chunks })).sort((a, b) => a.startedAt - b.startedAt)
}

/** Where a moment (epoch milliseconds) sits in the video: the recording that was running, and the seconds into it. Undefined before any recording began. */
export function clipAt(segments: VideoSegments, at: number): { segment: number; seconds: number } | undefined {
  const own = segments.filter((s) => s.startedAt <= at).at(-1)
  return own && { segment: own.startedAt, seconds: Math.max(0, Math.round((at - own.startedAt) / 100) / 10) }
}

/**
 * A moment of the reel (start and end, epoch milliseconds) as a clip: the recording that was running when it ended, and the seconds it
 * spans in it, from where the recording began if the moment began earlier. Undefined when no recording had begun by its end.
 */
export function clipOf(segments: VideoSegments, start: number, end: number): { segment: number; from: number; to: number } | undefined {
  const own = segments.filter((s) => s.startedAt <= end).at(-1)
  if (!own) return undefined
  const seconds = (at: number) => Math.max(0, Math.round((at - own.startedAt) / 100) / 10)
  return { segment: own.startedAt, from: seconds(start), to: seconds(end) }
}
