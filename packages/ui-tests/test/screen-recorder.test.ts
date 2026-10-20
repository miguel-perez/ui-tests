import { describe, expect, it } from 'vitest'
import { startScreenRecording } from '../src/next/screen-recorder.ts'

class FakeRecorder {
  static types = ['video/webm']
  static isTypeSupported(type: string) { return FakeRecorder.types.includes(type) }
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(public stream: unknown, public options: Record<string, unknown>) { made.push(this) }
  start(ms: number) { this.state = 'recording'; this.every = ms }
  every = 0
  pause() { this.state = 'paused' }
  resume() { this.state = 'recording' }
  stop() { this.ondataavailable?.({ data: new Blob(['last']) }); this.state = 'inactive'; this.onstop?.() }
}
const made: FakeRecorder[] = []
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
