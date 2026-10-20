import { useEffect, useRef, useState } from 'react'

export type { Transcriber } from '../transcriber.ts'
export { nullTranscriber } from '../transcriber.ts'

export const TALK_INSTEAD = 'Talk instead'
export const MIC_ASK = 'Your voice is recorded and kept like the rest of what you do, and deleted if you stop. Use the microphone?'
export const MIC_ALLOW = 'Use the microphone'
export const MIC_DECLINE = 'Keep typing'
export const STOP_TALKING = 'Stop and send'
export const RECORDING_NOW = 'Recording. Press Stop and send when you are done.'
export const MIC_DENIED = 'The microphone is not available. You can type instead.'

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
  const [state, setState] = useState<'idle' | 'asking' | 'recording' | 'denied'>('idle')
  const recorder = useRef<MediaRecorder | undefined>(undefined)
  const stream = useRef<MediaStream | undefined>(undefined)
  useEffect(() => setAvailable(typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)), [])
  useEffect(() => () => { recorder.current?.state === 'recording' && recorder.current.stop(); stream.current?.getTracks().forEach((t) => t.stop()) }, [])
  if (!available) return null

  async function record() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const next = new MediaRecorder(stream.current)
      next.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
      next.onstop = () => {
        stream.current?.getTracks().forEach((t) => t.stop())
        setState('idle')
        if (chunks.length) onAnswer(new Blob(chunks, { type: next.mimeType || 'audio/webm' }))
      }
      recorder.current = next
      next.start()
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
      <p className="pl-dim" role="status">{state === 'recording' ? RECORDING_NOW : state === 'denied' ? MIC_DENIED : ''}</p>
    </div>
  )
}
