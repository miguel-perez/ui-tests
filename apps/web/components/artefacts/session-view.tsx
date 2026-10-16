'use client'
import { useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../icon'
import { run, session, uxLite, confidentFailure, clock, kinds, span, type Moment } from '../../lib/sessions'

const p3 = session('p3')
const moments = p3.moments as Moment[]
const length = p3.videoSeconds ?? 64
/** P3's words, split into the quotes the analysis attached to moments (results-views audit, rules 1 and 3). */
const [share, add] = p3.words.split(/(?<=\.) /)
const quotes = [{ text: share, moment: 1 }, { text: add, moment: 10 }]
const lanes = [
  { key: 'problem', label: 'Problems' },
  { key: 'deviation', label: 'Deviation' },
  { key: 'pause', label: 'Pause' },
  { key: 'dead', label: 'Dead click' },
  { key: 'done', label: 'Done' },
] as const
const lane = (moment: Moment) => moment.issue ? 'problem' : kinds[moment.kind]?.signal
/** One band per run of the same moment within a few seconds, so neighbouring pins never crowd one target (WCAG 2.5.8). */
const bands = lanes.map(({ key }) => moments.reduce<{ index: number; from: number; to: number; stamps: string[]; issue?: number }[]>((found, moment, index) => {
  if (lane(moment) !== key) return found
  const last = found.at(-1)
  if (last && last.issue === moment.issue && moment.seconds - last.to < 4) { last.to = moment.seconds + span(moment); last.stamps.push(moment.timestamp); return found }
  return [...found, { index, from: moment.seconds, to: moment.seconds + span(moment), stamps: [moment.timestamp], issue: moment.issue }]
}, []))

/**
 * Session: one person's attempt as a results view people already know (results-views audit, rule 1): the metadata as a row of
 * fields above, the recording top-left with a scrubber of coloured moment lanes beneath it, the timeline beside it, and the words
 * in a time-ordered feed below that seeks on click. Light theme; no terminal chrome.
 */
export function SessionView() {
  const video = useRef<HTMLVideoElement>(null)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const active = moments.reduce((found, moment, index) => moment.seconds <= time ? index : found, 0)
  const lite = uxLite(p3)
  function seek(value: number) {
    const element = video.current!
    if (element.readyState === 0) {
      element.addEventListener('loadedmetadata', () => { element.currentTime = value }, { once: true })
      element.load()
    } else element.currentTime = value
    setTime(value)
  }
  const fields: [string, React.ReactNode][] = [
    ['Participant', `${p3.person} · ${p3.source}`], ['Task', run.goal], ['Date', run.date], ['Duration', p3.duration],
    ['Device', `${p3.device}, ${p3.browser} · ${p3.viewport}`],
    ['Outcome', <span key="o" className={`outcome-${p3.outcome}`}>{p3.outcome}{confidentFailure(p3) ? ' · confident failure' : ''}</span>],
    ['SEQ ease', `${p3.ease} of 7`], ['Confidence', `${p3.confidence} of 7`], ['UX-Lite', `usefulness ${lite.usefulness} · ease ${lite.ease}`],
  ]
  return <figure className="window theme-light session-view" data-artefact="session-view" aria-label={`${p3.person} session`}>
    <figcaption className="window-chrome"><span className="window-title">{p3.person} · {run.goal}</span><span className="example-label">Example run</span></figcaption>
    <dl className="session-meta">{fields.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
      <div className="recording-state"><dt>Recording</dt><dd><span className="on"><Icon name="screen" size={14} />Screen · recorded · consent</span><span className={p3.consent.voice ? 'on' : ''}><Icon name={p3.consent.voice ? 'mic' : 'mic-off'} size={14} />Voice · {p3.consent.voice ? 'recorded · consent' : 'not recorded'}</span><span><Icon name="camera-off" size={14} />Webcam · off</span></dd></div>
    </dl>
    <div className="session-body">
      <div className="session-media">
        <div className="session-video"><video ref={video} src={p3.video} poster={p3.poster} preload="none" muted playsInline onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} aria-label={`${p3.person} session recording`} />
          <button className="video-play" aria-label={playing ? `Pause ${p3.person} session` : `Play ${p3.person} session`} onClick={() => { if (playing) video.current?.pause(); else void video.current?.play().catch(() => setPlaying(false)) }}><Icon name={playing ? 'pause' : 'play'} /></button>
          <span className="session-time">{clock(time)} / {clock(length)}</span>
        </div>
        <div className="session-scrub">
          <label className="scrub" style={{ '--played': `${Math.min(100, time / length * 100)}%` } as CSSProperties}><span className="sr-only">Seek session</span><input type="range" min="0" max={Math.floor(length)} step="0.1" value={time} onChange={event => seek(Number(event.target.value))} /></label>
          <div className="lanes">{lanes.map(({ key, label }) => <div className="lane" key={key} data-lane={key}><span className="lane-label">{label}</span><span className="lane-track">{bands[lanes.findIndex(entry => entry.key === key)].map(band => { const moment = moments[band.index]; return <button key={band.index} className="band" data-lane={key} data-hovered={hovered === band.index || undefined} style={{ left: `${band.from / length * 100}%`, width: `${(band.to - band.from) / length * 100}%` }} aria-label={`${key === 'problem' ? `Problem ${band.issue}` : label} at ${band.stamps.join(' and ')}: ${moment.detail}`} onMouseEnter={() => setHovered(band.index)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(band.index)} onBlur={() => setHovered(null)} onClick={() => seek(band.from)}>{key === 'problem' && <span>{band.issue}</span>}</button> })}</span></div>)}</div>
        </div>
      </div>
      <ol className="session-timeline" aria-label="Timeline: time, kind, detail">{moments.map((moment, index) => {
        const kind = kinds[moment.kind] ?? { label: moment.kind }
        return <li key={index}><button data-kind={moment.kind} data-signal={kind.signal} data-issue={moment.issue} data-hovered={hovered === index || undefined} aria-current={index === active ? 'step' : undefined} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} onClick={() => seek(moment.seconds)}>
          <time>{moment.timestamp}</time><span className="kind">{kind.label}</span><span className="rank-chip" aria-label={moment.issue ? `problem ${moment.issue}` : undefined}>{moment.issue ?? ''}</span><span className="detail">{moment.detail}{moment.note ? ` · ${moment.note}` : ''}</span>
        </button></li>
      })}</ol>
    </div>
    <div className="session-words">
      <p className="words-head"><Icon name="mic" size={14} />Their words, spoken after the questions · transcript<span className="words-audio">audio kept with the attempt; not published with the example</span></p>
      <ol>{quotes.map(quote => { const moment = moments[quote.moment]; return <li key={quote.text}><button onClick={() => seek(moment.seconds)} data-hovered={hovered === quote.moment || undefined} onMouseEnter={() => setHovered(quote.moment)} onMouseLeave={() => setHovered(null)}><time>{moment.timestamp}</time><span className="rank-chip">{moment.issue}</span><q>{quote.text}</q></button></li> })}</ol>
    </div>
  </figure>
}
