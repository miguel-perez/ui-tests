'use client'
import { useRef, useState, type CSSProperties } from 'react'
import metadata from '../../public/sessions/sessions.json'
import { RecordingStatus, SessionRatings } from './session-details'
import { Icon } from '../icon'
const session = metadata.sessions.find(session => session.id === 'p3')!

export function TraceViewer() {
  const ref = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const active = session.moments.reduce((found, moment, index) => moment.seconds <= time ? index : found, 0)
  function seek(seconds: number) {
    const video = ref.current!
    if (video.readyState === 0) {
      video.addEventListener('loadedmetadata', () => { video.currentTime = seconds }, { once: true })
      video.load()
    } else video.currentTime = seconds
    setTime(seconds)
  }
  return <figure className="window trace-viewer" data-artefact="trace-viewer"><figcaption className="window-chrome"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span className="window-title">{session.person} · {metadata.goal} · {session.source} · {session.device}, {session.browser} · {session.viewport} · {session.duration}</span><span className="example-label">Example run</span></figcaption>
    <RecordingStatus /><SessionRatings />
    <div className="trace-content"><div className="trace-media"><video ref={ref} src={session.video} poster={session.poster} preload="none" muted playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} aria-label="P3 session recording" /><button className="video-play" aria-label={playing ? 'Pause P3 session' : 'Play P3 session'} onClick={() => { if (playing) ref.current?.pause(); else void ref.current?.play().catch(() => setPlaying(false)) }}><Icon name={playing ? 'pause' : 'play'} /></button><label className="trace-scrub" style={{ '--played': `${time / 63 * 100}%` } as CSSProperties}><span className="sr-only">Seek session</span><input type="range" min="0" max="63" step="0.1" value={time} onChange={e => seek(Number(e.target.value))} /></label><span className="trace-time">{String(Math.floor(time / 60)).padStart(2, '0')}:{String(Math.floor(time % 60)).padStart(2, '0')}</span></div>
    <ol className="trace-timeline">{session.moments.map((moment, index) => <li key={index}><button data-kind={moment.kind} data-issue={'issue' in moment ? moment.issue : undefined} aria-current={index === active ? 'step' : undefined} onClick={() => seek(moment.seconds)}><span className="issue-dot" aria-hidden="true" /><time>{moment.timestamp}</time><span>{moment.detail}{'note' in moment ? ` · ${moment.note}` : ''}</span></button></li>)}</ol></div>
    <p className="trace-words"><strong>Their words, after the ease question:</strong> &ldquo;{session.words}&rdquo;</p>
  </figure>
}
