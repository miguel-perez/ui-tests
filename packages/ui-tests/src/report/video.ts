import type { AttemptRow, RunStore } from '../store/types.ts'
import { videoChunks } from '../video.ts'

export type Video = { bytes: Uint8Array; contentType: string }

/** One recording of an attempt, its chunks joined in order. Undefined when there is none, or a chunk has been deleted. */
export async function assembleVideo(store: RunStore, attempt: AttemptRow, segment?: number): Promise<Video | undefined> {
  const all = videoChunks(attempt.answers)
  const wanted = segment ?? all.map((c) => c.segment).sort((a, b) => a - b)[0]
  const chunks = all.filter((c) => c.segment === wanted).sort((a, b) => a.seq - b.seq)
  if (!chunks.length) return undefined
  const parts: Uint8Array[] = []
  let contentType = 'video/webm'
  for (const chunk of chunks) {
    const blob = await store.getBlob(chunk.blob)
    if (!blob) return undefined
    parts.push(blob.bytes)
    contentType = blob.contentType
  }
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return { bytes, contentType }
}

/** The video as a response, honouring a `Range` request so the browser can seek. */
export function videoResponse(video: Video, range: string | null): Response {
  const size = video.bytes.length
  const headers = { 'Content-Type': video.contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  const asked = range && /^bytes=(\d*)-(\d*)$/.exec(range)
  if (asked && (asked[1] || asked[2])) {
    const start = asked[1] ? Number(asked[1]) : Math.max(0, size - Number(asked[2]))
    const end = asked[1] && asked[2] ? Math.min(Number(asked[2]), size - 1) : size - 1
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    return new Response(Buffer.from(video.bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
  }
  return new Response(Buffer.from(video.bytes), { headers: { ...headers, 'Content-Length': String(size) } })
}

