import { useEffect, useRef, useState } from 'react'

export type { Transcriber } from '../transcriber.ts'
export { nullTranscriber } from '../transcriber.ts'

export const TALK_INSTEAD = 'Talk instead'
export const MIC_ASK = 'Your voice is recorded and kept like the rest of what you do, and deleted if you stop. Use the microphone?'
export const MIC_ALLOW = 'Use the microphone'
export const MIC_DECLINE = 'Keep typing'
export const STOP_TALKING = 'Stop and send'
export const RECORDING_NOW = 'Recording. Press Stop and send when you are done.'
export const TOO_LONG = 'Recording stopped at 90 seconds and was sent.'
export const TOO_BIG = 'That recording is too long to send. Try a shorter one, or type your answer.'
export const MIC_DENIED = 'The microphone is not available. You can type instead.'

/** A spoken answer stops by itself after this long, and may not be larger than the collector takes (1,900,000 base64 characters). */
export const MAX_RECORDING_MS = 90_000
export const MAX_RECORDING_BYTES = 1_400_000
export const BITS_PER_SECOND = 32_000
export const fitsTheCollector = (bytes: number) => bytes <= MAX_RECORDING_BYTES

export type VoiceAnswerProps = {
  /** The recording, and its words when something in the browser already has them. */
  onAnswer: (blob: Blob, transcript?: string) => void
  /** Where "asked once" is remembered for this participant; one run is one participant here. */
  participant: string
  disabled?: boolean
}

const key = (participant: string) => `ui-tests-mic:${participant}`
const remembered = (participant: string) => { try { return sessionStorage.getItem(key(participant)) === '1' } catch { return false } }
const remember = (participant: string) => { try { sessionStorage.setItem(key(participant), '1') } catch { /* asked again next time */ } }

/** "Talk instead": records a spoken answer. Asks once per participant whether the microphone may be used; shows nothing where there is none. */
export function VoiceAnswer({ onAnswer, participant, disabled }: VoiceAnswerProps) {
  const [available, setAvailable] = useState(false)
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'denied' | 'long' | 'big'>('idle')
  const recorder = useRef<MediaRecorder | undefined>(undefined)
  const stream = useRef<MediaStream | undefined>(undefined)
  const limit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const capped = useRef(false)
  useEffect(() => setAvailable(typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)), [])
  // Leaving the screen mid-recording discards it: the handlers go first, so nothing is sent for a question the person has left.
  useEffect(() => () => {
    clearTimeout(limit.current)
    const r = recorder.current
    if (r) { r.ondataavailable = null; r.onstop = null; if (r.state === 'recording') r.stop() }
    stream.current?.getTracks().forEach((t) => t.stop())
  }, [])
  if (!available) return null

  async function record() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const next = new MediaRecorder(stream.current, { audioBitsPerSecond: BITS_PER_SECOND })
      next.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      next.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop())
        clearTimeout(limit.current)
        const blob = new Blob(chunks, { type: next.mimeType || 'audio/webm' })
        if (!chunks.length) setState('idle')
        else if (!fitsTheCollector(blob.size)) setState('big')
        else { setState(capped.current ? 'long' : 'idle'); onAnswer(blob) }
      }
      recorder.current = next
      capped.current = false
      next.start()
      limit.current = setTimeout(() => { capped.current = true; if (next.state === 'recording') next.stop() }, MAX_RECORDING_MS)
      setState('recording')
    } catch {
      setState('denied')
    }
  }
  const press = () => {
    if (remembered(participant)) void record()
    else setState('asking')
  }

  return (
    <div className="pl-voice">
      {state === 'asking' ? (
        <>
          <p id={`mic-ask-${participant}`}>{MIC_ASK}</p>
          <div className="pl-row" role="group" aria-labelledby={`mic-ask-${participant}`}>
            <button type="button" onClick={() => { remember(participant); void record() }}>{MIC_ALLOW}</button>
            <button type="button" className="pl-ghost" onClick={() => setState('idle')}>{MIC_DECLINE}</button>
          </div>
        </>
      ) : state === 'recording' ? (
        <button type="button" onClick={() => recorder.current?.stop()}>{STOP_TALKING}</button>
      ) : (
        <button type="button" className="pl-ghost" disabled={disabled} onClick={press}>{TALK_INSTEAD}</button>
      )}
      <p className="pl-dim" role="status">{state === 'recording' ? RECORDING_NOW : state === 'denied' ? MIC_DENIED : state === 'long' ? TOO_LONG : state === 'big' ? TOO_BIG : ''}</p>
    </div>
  )
}
