'use client'
import { useState } from 'react'
import { ScenarioCard, TaskBar, RecordingIndicator, Questions, useChrome, weekboardChrome } from 'ui-tests/next'
import { landing } from '../../lib/copy'

type Kind = 'card' | 'bar' | 'questions'
const addresses: Record<Kind, string> = { card: 'weekboard.app/board', bar: 'weekboard.app/board', questions: 'weekboard.app/board · questions' }

/**
 * PlayerSurface: the real player components from `ui-tests/next` over the light demo app in a browser frame, in the chrome they draw
 * on Weekboard: its ink and canvas turned over, its font and the mint accent its author sets.
 * Each frame starts on its own surface and plays forward on the visitor's action; nothing is sent anywhere.
 */
export function PlayerFrame({ kind }: { kind: Kind }) {
  const [stage, setStage] = useState<Kind | 'finished'>(kind)
  const [voice, setVoice] = useState({ live: false, recorded: false })
  const [started] = useState(() => Date.now())
  const [paused, setPaused] = useState(false)
  const chrome = useChrome(weekboardChrome)
  return <figure className="window player-frame" data-artefact={`player-${kind}`} aria-label={`The ${kind === 'card' ? 'scenario card' : kind === 'bar' ? 'task bar' : 'questions'} over the demo app`}>
    <figcaption className="window-chrome browser-chrome"><span className="address">{addresses[kind]}</span><span className="example-label">Example run</span></figcaption>
    <div className={`player-canvas stage-${stage}`}>
      <iframe title="Weekboard, the demo app" src="/demo/weekboard.html" loading="lazy" tabIndex={-1} aria-hidden="true" />
      <div className="player-overlay">
        {stage === 'card' && <ScenarioCard level={3} chrome={weekboardChrome} scenario={landing.scenario} onStart={() => setStage('bar')} />}
        {stage === 'bar' && <TaskBar contained chrome={weekboardChrome} scenario={landing.scenario} interacted={false} recording={{ startedAt: started, state: { events: true, screen: true, voice: false, webcam: false }, paused, onPause: () => setPaused(!paused) }} onDone={() => setStage('questions')} onGiveUp={() => setStage('questions')} />}
        {stage === 'questions' && <><Questions chrome={weekboardChrome} onSubmit={() => setStage('finished')} onVoiceState={setVoice} /><RecordingIndicator contained chrome={weekboardChrome} recording={{ events: true, screen: false, voice: voice.recorded, webcam: false }} live={voice.live} still /></>}
        {stage === 'finished' && <div className="uit uit-sheet uit-wait" style={chrome} role="status"><p>Thank you. This is an example run, so your answers and any recording were not saved.</p><span><button className="uit-primary" onClick={() => setStage(kind)}>Try again</button></span></div>}
      </div>
    </div>
  </figure>
}
