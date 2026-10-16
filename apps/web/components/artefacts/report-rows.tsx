'use client'
import { useState } from 'react'
import { problems, landing } from '../../lib/copy'
import { SessionVideo } from './session-video'
import { CopyControl } from './copy-control'
import { RecordingStatus, SessionRatings } from './session-details'
import { Icon } from '../icon'

export function ReportRows({ compact = false, share = false }: { compact?: boolean; share?: boolean }) {
  const [expanded, setExpanded] = useState<number | null>(compact ? null : 0)
  const [activated, setActivated] = useState<number | null>(null)
  const [watch, setWatch] = useState<{ row: number; person: string; seconds: number; label: string } | null>(null)
  return <div className={`window report-rows ${compact ? 'compact-report' : ''}`} data-artefact="report-rows">
    <div className="window-chrome"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span className="window-title">ui-tests.com/r/k2m9</span><span className="example-label">Example run</span>{share && <CopyControl text="https://ui-tests.com/r/k2m9" label="report link" action="Share" />}</div>
    <div className="report-columns" aria-hidden="true"><span>#</span><span>Problem</span><span>People</span><span>Watch</span><span>What to change</span></div>
    {problems.map((problem, i) => {
      const watching = watch?.row === i ? watch : null
      // The rank-1 reel carries the moment the hero promises, with its words, as the caption in its own chrome.
      const person = watching?.person ?? (i === 3 ? 'p2' : 'p3')
      return <div className={`report-row ${expanded === i ? 'expanded' : ''}`} key={problem.title}>
        <button className="report-toggle" aria-expanded={expanded === i} onClick={() => { setExpanded(expanded === i ? null : i); setActivated(i) }}><span className="rank">{i + 1}</span><span>{problem.title}{expanded !== i && <> · <span className="count">{problem.count}</span></>}</span>{expanded === i && <span className="count">{problem.count}</span>}<span className="report-chevron"><Icon name="chevron" size={16} /></span></button>
        {expanded === i && <div className="report-detail">
          <blockquote>{problem.quote}</blockquote>
          <div className="report-watch">
            <figure className="reel-frame">
              <figcaption className="reel-chrome"><span className="moment-label-small">{watching ? watching.label : i === 0 ? landing.moment : problem.moment}</span>{i === 0 && !watching && <span className="reel-words">{landing.words}</span>}</figcaption>
              <SessionVideo key={watching ? watching.label : `reel-${i}`} src={watching ? `/sessions/${watching.person}.webm` : `/sessions/problem-${i + 1}.webm`} poster={watching ? `/sessions/${watching.person}.jpg` : `/sessions/problem-${i + 1}.jpg`} startAt={watching?.seconds ?? 0} play={activated === i} />
              <div className="reel-meta"><SessionRatings id={person} compact /><RecordingStatus id={person} /></div>
            </figure>
            <p className="watch-list">{problem.watch.split(', ').map((label, index) => <span key={label}>{index > 0 && ', '}<button className="watch-moment" onClick={() => { const [who, timestamp] = label.split(' '); const [minutes, seconds] = timestamp.split(':').map(Number); setWatch({ row: i, person: who.toLowerCase(), seconds: minutes * 60 + seconds, label }); setActivated(i) }}>{label}</button></span>)}</p>
          </div>
          <p className="report-change"><strong>What to change:</strong><br />{problem.change}</p>
        </div>}
      </div>
    })}
    <div className="report-footer">{landing.result}</div>
  </div>
}
