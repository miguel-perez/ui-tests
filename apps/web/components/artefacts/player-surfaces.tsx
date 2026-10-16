'use client'
import { useState } from 'react'
import { ScenarioCard, TaskControls, EaseQuestion } from 'ui-tests/next'
import { landing } from '../../lib/copy'

export function PlayerSurface({ surface }: { surface: 'scenario-card' | 'taskbar' | 'ease-question' }) {
  const [stage, setStage] = useState<string>(surface)
  const [seq, setSeq] = useState('3'), [words, setWords] = useState('')
  const [confidence, setConfidence] = useState('6')
  return <div className="window player-frame" data-artefact={surface}>
    <div className="window-chrome"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span>weekboard · /board</span><span className="example-label">Example run</span></div>
    <div className="player-canvas"><iframe title={`Weekboard behind ${surface}`} src="/demo/weekboard.html" loading="lazy" tabIndex={-1} aria-hidden="true" />
    <div className={`player-overlay ${stage === 'taskbar' ? 'bar-overlay' : ''}`}>
      {stage === 'scenario-card' && <ScenarioCard scenario={landing.scenario} onStart={() => setStage('taskbar')} />}
      {stage === 'taskbar' && <TaskControls onDone={() => setStage('ease-question')} onStop={() => setStage('ease-question')} />}
      {stage === 'ease-question' && <form className="question-card" onSubmit={e => { e.preventDefault(); setStage('ux-lite') }}><EaseQuestion seq={seq} onSeq={setSeq} words={words} onWords={setWords} /><label className="confidence-label">How confident are you that you completed the task? <select value={confidence} onChange={event => setConfidence(event.target.value)}>{[1,2,3,4,5,6,7].map(value => <option key={value} value={value}>{value} of 7{value === 1 ? ' · not at all' : value === 7 ? ' · very confident' : ''}</option>)}</select></label><p className="caption">SEQ ease and confidence · per goal</p><div className="question-action"><button type="submit">Next</button></div></form>}
      {stage === 'ux-lite' && <form className="question-card ux-lite" onSubmit={e => { e.preventDefault(); setStage('finished') }}><h3>At the end · UX-Lite</h3><p>From strongly disagree (1) to strongly agree (5).</p>{['This system is easy to use.', 'This system’s capabilities meet my requirements.'].map((question, index) => <label key={question}>{question}<select defaultValue={index === 0 ? '2' : '4'}>{[1,2,3,4,5].map(value => <option key={value} value={value}>{value} of 5</option>)}</select></label>)}<div className="question-action"><button type="submit">Send</button></div></form>}
      {stage === 'finished' && <div className="question-card" role="status">Thank you. This is an example run, so your goal ratings, UX-Lite and words were not saved.<button className="button quiet" onClick={() => setStage('scenario-card')}>Try again</button></div>}
    </div></div>
  </div>
}
