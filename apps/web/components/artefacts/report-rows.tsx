'use client'
import { useState } from 'react'
import { problems, landing } from '../../lib/copy'
import { SessionVideo } from './session-video'

export function ReportRows() {
  const [expanded, setExpanded] = useState<number | null>(0)
  const [activated, setActivated] = useState<number | null>(null)
  const [watch, setWatch] = useState<{ row: number; person: string; seconds: number; label: string } | null>(null)
  return <div className="window report-rows" data-artefact="report-rows">
    <div className="window-chrome"><span className="example-label">Example run</span><span className="window-dots" aria-hidden="true"><i /><i /></span></div>
    <div className="report-columns" aria-hidden="true"><span>#</span><span>Problem</span><span>People</span><span>Watch</span><span>What to change</span></div>
    {problems.map((problem, i) => <div className={`report-row ${expanded === i ? 'expanded' : ''}`} key={problem.title}>
      <button className="report-toggle" aria-expanded={expanded === i} onClick={() => { setExpanded(expanded === i ? null : i); setActivated(i) }}><span className="rank">{i + 1}</span><span>{problem.title}{expanded !== i && <> · <span className="count">{problem.count}</span></>}</span>{expanded === i && <span className="count">{problem.count}</span>}<span aria-hidden="true">{expanded === i ? '−' : '›'}</span></button>
      {expanded === i && <div className="report-detail"><blockquote>{problem.quote}</blockquote><div className="report-watch"><SessionVideo key={watch?.row === i ? watch.label : `reel-${i}`} src={watch?.row === i ? `/sessions/${watch.person}.webm` : `/sessions/problem-${i + 1}.webm`} poster={watch?.row === i ? `/sessions/${watch.person}.jpg` : `/sessions/problem-${i + 1}.jpg`} startAt={watch?.row === i ? watch.seconds : 0} play={activated === i} /><span className="moment-label-small">{watch?.row === i ? watch.label : problem.moment}</span><p>{problem.watch.split(', ').map((label, index) => <span key={label}>{index > 0 && ', '}<button className="watch-moment" onClick={() => { const [person, timestamp] = label.split(' '); const [minutes, seconds] = timestamp.split(':').map(Number); setWatch({ row: i, person: person.toLowerCase(), seconds: minutes * 60 + seconds, label }); setActivated(i) }}>{label}</button></span>)}</p></div><p className="report-change"><strong>What to change:</strong><br />{problem.change}</p></div>}
    </div>)}
    <div className="report-footer">{landing.result}</div>
  </div>
}
