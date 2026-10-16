'use client'
import { useState } from 'react'
import { ScenarioCard, TaskControls, EaseQuestion } from 'ui-tests/next'
import { landing } from '../../lib/copy'

export function PlayerSurface({ surface }: { surface: 'scenario-card' | 'taskbar' | 'ease-question' }) {
  const [stage, setStage] = useState(surface)
  const [seq, setSeq] = useState('3'), [words, setWords] = useState('')
  return <div className="window player-frame" data-artefact={surface}>
    <div className="window-chrome"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span>weekboard · /board</span><span className="example-label">Example run</span></div>
    <div className="player-canvas"><iframe title={`Weekboard behind ${surface}`} src="/demo/weekboard.html" loading="lazy" tabIndex={-1} aria-hidden="true" />
    <div className={`player-overlay ${stage === 'taskbar' ? 'bar-overlay' : ''}`}>
      {stage === 'scenario-card' && <ScenarioCard scenario={landing.scenario} onStart={() => setStage('taskbar')} />}
      {stage === 'taskbar' && <TaskControls onDone={() => setStage('ease-question')} onStop={() => setStage('ease-question')} />}
      {stage === 'ease-question' && <form className="question-card" onSubmit={e => { e.preventDefault(); setStage('scenario-card') }}><EaseQuestion seq={seq} onSeq={setSeq} words={words} onWords={setWords} /><div className="question-action"><button type="submit">Send</button></div></form>}
    </div></div>
  </div>
}
