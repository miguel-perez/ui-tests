/** The few parts of the browser this uses; each is replaced in tests. */
export type ScreenRecorderDeps = {
  getDisplayMedia?: (constraints: { video: boolean; audio: boolean }) => Promise<MediaStream>
  MediaRecorder?: typeof MediaRecorder
  /** The clock in epoch milliseconds; replaced in tests. */
  now?: () => number
  /** Called when the browser's own "stop sharing" ends the recording. */
  onEnded?: () => void
  /** Length of a chunk in milliseconds. */
  chunkMs?: number
}

/** What goes with each chunk: when the recording began (once the browser had begun it, not when the picker opened) and the pauses so far. */
export type ChunkInfo = { startedAt: number; pauses: [number, number][] }

export type ScreenRecording = { stop(): Promise<void>; pause(): void; resume(): void }

export const CHUNK_MS = 5000
const BITS_PER_SECOND = 1_500_000
const TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']

/**
 * Asks the browser to share the screen and records it as a video in chunks of five seconds, each given to `post` with its number.
 * The browser asks the person first; if they say no, or the browser cannot, this answers `'declined'` and records nothing. The
 * microphone is never asked for: the video has no sound.
 */
export async function startScreenRecording(post: (chunk: Blob, seq: number, info: ChunkInfo) => Promise<void>, deps: ScreenRecorderDeps = {}): Promise<ScreenRecording | 'declined'> {
  const ask = deps.getDisplayMedia ?? (typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia ? navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices) : undefined)
  const Recorder = deps.MediaRecorder ?? (typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined)
  if (!ask || !Recorder) return 'declined'
  let stream: MediaStream
  try { stream = await ask({ video: true, audio: false }) } catch { return 'declined' }
  const mimeType = TYPES.find((type) => Recorder.isTypeSupported?.(type))
  let recorder: MediaRecorder
  try {
    recorder = new Recorder(stream, { ...(mimeType && { mimeType }), videoBitsPerSecond: BITS_PER_SECOND })
  } catch {
    stream.getTracks().forEach((track) => track.stop())
    return 'declined'
  }
  const now = deps.now ?? Date.now
  let seq = 0
  let startedAt = now()
  const pauses: [number, number][] = []
  let pausedAt: number | undefined
  const info = (): ChunkInfo => ({ startedAt, pauses: [...pauses, ...(pausedAt === undefined ? [] : [[pausedAt, now()] as [number, number]])] })
  const pending: Promise<void>[] = []
  recorder.onstart = () => { startedAt = now() }
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) pending.push(post(event.data, seq++, info()).catch(() => {}))
  }
  const closed = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
  const release = () => stream.getTracks().forEach((track) => track.stop())
  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (recorder.state !== 'inactive') recorder.stop()
    deps.onEnded?.()
  })
  recorder.start(deps.chunkMs ?? CHUNK_MS)
  return {
    async stop() {
      if (pausedAt !== undefined) { pauses.push([pausedAt, now()]); pausedAt = undefined }
      if (recorder.state !== 'inactive') recorder.stop()
      await closed
      release()
      await Promise.all(pending)
    },
    pause() { if (recorder.state === 'recording') { recorder.pause(); pausedAt = now() } },
    resume() { if (recorder.state === 'paused') { recorder.resume(); if (pausedAt !== undefined) pauses.push([pausedAt, now()]); pausedAt = undefined } },
  }
}
