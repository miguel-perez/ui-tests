import { describe, expect, it } from 'vitest'
import { startScreenRecording, type ChunkInfo } from '../src/browser/screen-recorder.ts'

class FakeRecorder {
  static types = ['video/webm']
  static isTypeSupported(type: string) { return FakeRecorder.types.includes(type) }
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(public stream: unknown, public options: Record<string, unknown>) { made.push(this) }
  start(ms: number) { this.state = 'recording'; this.every = ms; setTimeout(() => { clock += 0; this.onstart?.() }, 0) }
  onstart: (() => void) | null = null
  every = 0
  pause() { this.state = 'paused' }
  resume() { this.state = 'recording' }
  stop() { this.ondataavailable?.({ data: new Blob(['last']) }); this.state = 'inactive'; this.onstop?.() }
}
const made: FakeRecorder[] = []
let clock = 0
const stream = () => {
  const stopped: boolean[] = []
  const track = { stop: () => stopped.push(true), addEventListener: () => {} }
  return { stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream, stopped }
}

describe('startScreenRecording', () => {
  it('answers declined when the person says no, asking for no sound', async () => {
    let constraints: unknown
    const result = await startScreenRecording(async () => {}, { MediaRecorder: FakeRecorder as never, getDisplayMedia: async (c) => { constraints = c; throw new DOMException('no', 'NotAllowedError') } })
    expect(result).toBe('declined')
    expect(constraints).toEqual({ video: true, audio: false })
    expect(made).toHaveLength(0)
  })

  it('answers declined where the browser cannot share a screen', async () => {
    expect(await startScreenRecording(async () => {}, { MediaRecorder: FakeRecorder as never })).toBe('declined')
  })

  it('records in chunks of five seconds, numbers them, pauses, and sends the last one on stop', async () => {
    const { stream: media, stopped } = stream()
    const sent: [string, number][] = []
    const result = await startScreenRecording(async (chunk, seq) => { sent.push([await chunk.text(), seq]) }, { MediaRecorder: FakeRecorder as never, getDisplayMedia: async () => media })
    if (result === 'declined') throw new Error('declined')
    const recorder = made.at(-1)!
    expect(recorder.every).toBe(5000)
    recorder.ondataavailable?.({ data: new Blob(['a']) })
    result.pause()
    expect(recorder.state).toBe('paused')
    result.resume()
    expect(recorder.state).toBe('recording')
    await result.stop()
    expect(sent).toEqual([['a', 0], ['last', 1]])
    expect(stopped).toEqual([true])
  })
})

describe('the clock of a recording', () => {
  it('begins when the browser starts recording, not when the picker opened, and keeps the pauses', async () => {
    clock = 1000
    const { stream: media } = stream()
    const seen: ChunkInfo[] = []
    const result = await startScreenRecording(async (_chunk, _seq, info) => { seen.push(info) }, {
      MediaRecorder: FakeRecorder as never,
      now: () => clock,
      // The person takes three seconds over the picker.
      getDisplayMedia: async () => { clock += 3000; return media },
    })
    if (result === 'declined') throw new Error('declined')
    await new Promise((resolve) => setTimeout(resolve, 5))
    clock = 4000
    const recorder = made.at(-1)!
    recorder.ondataavailable?.({ data: new Blob(['a']) })
    expect(seen[0]).toEqual({ startedAt: 4000, pauses: [] })
    clock = 10_000
    result.pause()
    clock = 15_000
    recorder.ondataavailable?.({ data: new Blob(['b']) })
    expect(seen[1]!.pauses).toEqual([[10_000, 15_000]])
    result.resume()
    clock = 20_000
    await result.stop()
    expect(seen.at(-1)!.pauses).toEqual([[10_000, 15_000]])
    expect(seen.at(-1)!.startedAt).toBe(4000)
  })
})
