/** The key in `attempt.answers` under which a screen video's chunks are listed. */
export const VIDEO_KEY = 'video'
/** The flag an attempt carries when the participant said no to sharing their screen. The attempt goes on with the event replay alone. */
export const VIDEO_DECLINED = 'video-declined'
/** Flags for a recording that is not whole: a chunk could not be sent, or the person ended the share from the browser. */
export const VIDEO_GAP = 'video-gap'
export const VIDEO_STOPPED = 'video-stopped'
/**
 * What one attempt may store of video: 300 chunks (25 minutes at five seconds each, the longest a task runs with extra time),
 * 600 MB in all, and 50 recordings (one for each time the share began). A chunk past any of them is refused with 413.
 */
export const MAX_VIDEO_CHUNKS = 300
export const MAX_VIDEO_BYTES = 600 * 1024 * 1024
export const MAX_VIDEO_SEGMENTS = 50
/** The most bytes one video chunk may carry once decoded: five seconds of screen is well under it. */
export const VIDEO_CHUNK_BYTES = 5 * 1024 * 1024

/** One stored chunk: the recording it belongs to (its start, in epoch milliseconds), its place in it, and the blob that holds it. */
export type VideoChunk = { segment: number; seq: number; blob: string; size?: number }
/** The wall-clock stretches (epoch milliseconds) during which a recording was paused: the video holds none of that time. */
export type Pauses = [number, number][]

/** The chunks listed in an attempt's answers. */
export function videoChunks(answers: Record<string, unknown>): VideoChunk[] {
  const kept = (answers[VIDEO_KEY] as { chunks?: unknown } | undefined)?.chunks
  return Array.isArray(kept) ? (kept as VideoChunk[]) : []
}

/** The recordings of an attempt, in order: one for each time the participant shared their screen (a full page load ends a share). */
export type VideoSegments = { startedAt: number; chunks: number; pauses: Pauses; /** A chunk between the first and the last is missing. */ gap: boolean }[]

/** The pauses kept for each recording, by its start. */
export function videoPauses(answers: Record<string, unknown>): Record<string, Pauses> {
  return ((answers[VIDEO_KEY] as { pauses?: Record<string, Pauses> } | undefined)?.pauses) ?? {}
}

export function videoSegments(answers: Record<string, unknown>): VideoSegments {
  const seqs = new Map<number, number[]>()
  for (const chunk of videoChunks(answers)) seqs.set(chunk.segment, [...(seqs.get(chunk.segment) ?? []), chunk.seq])
  const pauses = videoPauses(answers)
  return [...seqs].map(([startedAt, list]) => ({ startedAt, chunks: list.length, pauses: pauses[String(startedAt)] ?? [], gap: new Set(list).size !== Math.max(...list) + 1 })).sort((a, b) => a.startedAt - b.startedAt)
}

/** Seconds of video at wall-clock time `at`: the time since the recording began, less the time it was paused. */
function videoSeconds(segment: { startedAt: number; pauses: Pauses }, at: number): number {
  const paused = segment.pauses.reduce((sum, [from, to]) => sum + Math.max(0, Math.min(to, at) - Math.max(from, segment.startedAt)), 0)
  return Math.max(0, Math.round((at - segment.startedAt - paused) / 100) / 10)
}

/** Where a moment (epoch milliseconds) sits in the video: the recording that was running, and the seconds into it. Undefined before any recording began. */
export function clipAt(segments: VideoSegments, at: number): { segment: number; seconds: number } | undefined {
  const own = segments.filter((s) => s.startedAt <= at).at(-1)
  return own && { segment: own.startedAt, seconds: videoSeconds(own, at) }
}

/**
 * A moment of the reel (start and end, epoch milliseconds) as a clip: the recording that was running when it ended, and the seconds it
 * spans in it, from where the recording began if the moment began earlier. Undefined when no recording had begun by its end.
 */
export function clipOf(segments: VideoSegments, start: number, end: number): { segment: number; from: number; to: number } | undefined {
  const own = segments.filter((s) => s.startedAt <= end).at(-1)
  if (!own) return undefined
  return { segment: own.startedAt, from: videoSeconds(own, start), to: videoSeconds(own, end) }
}
