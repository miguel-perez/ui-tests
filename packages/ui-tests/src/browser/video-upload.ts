import type { ChunkInfo } from './screen-recorder.ts'

const TRIES = 4

/**
 * Sends one chunk of video, base64 in JSON. A failed connection is tried again (four tries, a little longer between each); a refusal
 * from the collector is final. Returns whether the chunk is stored; a chunk that is not leaves a gap, which the caller notes.
 */
export async function uploadChunk(
  send: (body: unknown) => Promise<Response>,
  chunk: Blob,
  seq: number,
  info: ChunkInfo,
  wait: (ms: number) => Promise<unknown> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  const bytes = new Uint8Array(await chunk.arrayBuffer())
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  const body = { action: 'video', segment: info.startedAt, seq, pauses: info.pauses, contentType: chunk.type || 'video/webm', data: btoa(text) }
  for (let tries = 0; tries < TRIES; tries++) {
    try {
      const response = await send(body)
      if (response.ok) return true
      if (response.status >= 400 && response.status < 500) return false
    } catch { /* try again */ }
    if (tries < TRIES - 1) await wait(500 * (tries + 1))
  }
  return false
}
