'use client'
import { useState } from 'react'
import { ScenarioCard, TaskBar, RecordingIndicator, Questions } from 'ui-tests/next'
import { landing } from '../../lib/copy'

type Kind = 'card' | 'bar' | 'questions'
const addresses: Record<Kind, string> = { card: 'weekboard.app/board', bar: 'weekboard.app/board', questions: 'weekboard.app/board · questions' }

/**
 * PlayerSurface: the real player components from `ui-tests/next`, in their light theme, over the demo app in a browser frame.
 * Each frame starts on its own surface and plays forward on the visitor's action; nothing is sent anywhere.
 */
export function PlayerFrame({ kind }: { kind: Kind }) {
  const [stage, setStage] = useState<Kind | 'finished'>(kind)
  const [voice, setVoice] = useState({ live: false, recorded: false })
  const [started] = useState(() => Date.now())
  return <figure className="window player-frame" data-artefact={`player-${kind}`} aria-label={`The ${kind === 'card' ? 'scenario card' : kind === 'bar' ? 'task bar' : 'questions'} over the demo app`}>
    <figcaption className="window-chrome browser-chrome"><span className="address">{addresses[kind]}</span><span className="example-label">Example run</span></figcaption>
    <div className={`player-canvas stage-${stage}`}>
      <iframe title="Weekboard, the demo app" src="/demo/weekboard.html" loading="lazy" tabIndex={-1} aria-hidden="true" />
      <div className="player-overlay">
        {stage === 'card' && <ScenarioCard level={3} scenario={landing.scenario} onStart={() => setStage('bar')} />}
        {stage === 'bar' && <><TaskBar contained scenario={landing.scenario} interacted={false} onDone={() => setStage('questions')} onGiveUp={() => setStage('questions')} /><RecordingIndicator contained startedAt={started} recording={{ events: true, screen: false, voice: false, webcam: false }} /></>}
        {stage === 'questions' && <><Questions onSubmit={() => setStage('finished')} onVoiceState={setVoice} /><RecordingIndicator contained recording={{ events: true, screen: false, voice: voice.recorded, webcam: false }} live={voice.live} still /></>}
        {stage === 'finished' && <div className="uit uit-wait" role="status"><p>Thank you. This is an example run, so your answers and any recording were not saved.</p><span><button className="uit-primary" onClick={() => setStage(kind)}>Try again</button></span></div>}
      </div>
    </div>
  </figure>
}
