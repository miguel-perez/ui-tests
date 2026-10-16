'use client'
import { useRef, useState } from 'react'
import metadata from '../../public/sessions/sessions.json'
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
  return <figure className="window trace-viewer" data-artefact="trace-viewer"><figcaption className="window-chrome"><span>P3 · invite a colleague · panel · MacBook, Chrome · 1280×800 · 1:03 · outcome incorrect · ease 3 of 7</span><span className="example-label">Example run</span></figcaption>
    <div className="trace-content"><div className="trace-media"><video ref={ref} src={session.video} poster={session.poster} preload="none" muted playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} aria-label="P3 session recording" /><button className="video-play" aria-label={playing ? 'Pause P3 session' : 'Play P3 session'} onClick={() => { if (playing) ref.current?.pause(); else void ref.current?.play().catch(() => setPlaying(false)) }}>{playing ? 'Ⅱ' : '▷'}</button><label className="trace-scrub"><span className="sr-only">Seek session</span><input type="range" min="0" max="63" step="0.1" value={time} onChange={e => seek(Number(e.target.value))} /></label><span className="trace-time">{String(Math.floor(time / 60)).padStart(2, '0')}:{String(Math.floor(time % 60)).padStart(2, '0')}</span></div>
    <ol className="trace-timeline">{session.moments.map((moment, index) => <li key={index}><button aria-current={index === active ? 'step' : undefined} onClick={() => seek(moment.seconds)}><span className={('issue' in moment || ['pause', 'deviation', 'dead-click'].includes(moment.kind)) ? 'issue-dot' : 'no-dot'} aria-hidden="true" /><time>{moment.timestamp}</time><span>{moment.detail}{'note' in moment ? ` · ${moment.note}` : ''}</span></button></li>)}</ol></div>
    <p className="trace-words"><strong>Their words:</strong> &quot;{session.words}&quot;</p>
  </figure>
}
