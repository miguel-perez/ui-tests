'use client'
import { useRef, useState, type CSSProperties } from 'react'
import { Icon } from '../icon'
import { run, attempt, reachedLabel, endedLabel, wrongAndSure, clock, short, spoken, signal, impactLabel, type Blocker, type Moment } from '../../lib/attempts'

const shown = attempt('p3')
const blockers = shown.blockers ?? []
const ended = shown.moments.at(-1)!
/** The moments a card tells: every moment inside its clip, never the last row, which is how it ended. */
const steps = (blocker: Blocker) => shown.moments.filter(moment => moment !== ended && moment.seconds >= blocker.from && moment.seconds <= blocker.to)
/** The minute in order: routine moments as rows, each problem moment as its card at its own time, then how it ended. */
const flow: ({ row: Moment } | { card: Blocker; index: number })[] = []
for (const moment of shown.moments.slice(0, -1)) {
  const card = blockers.find(blocker => blocker.from === moment.seconds)
  if (card) flow.push({ card, index: blockers.indexOf(card) })
  else if (!blockers.some(blocker => moment.seconds >= blocker.from && moment.seconds <= blocker.to)) flow.push({ row: moment })
}
const others = run.attempts.filter(entry => entry !== shown).map(entry => entry.time)
/** Their path: each page once per visit, marked when it is on your path the first time, or off it when they went off your path to reach it. */
const visits = shown.moments.reduce<{ route: string; off: boolean }[]>((found, moment) => moment.route && moment.route !== found.at(-1)?.route ? [...found, { route: moment.route, off: moment.kind === 'off-path' }] : found, [])
const onPath = run.yourPath.filter(route => visits.some(visit => visit.route === route)).length

function What({ moment }: { moment: Moment }) {
  return <><span className="what" data-signal={signal[moment.kind]}>{moment.what}</span>{moment.rest}</>
}

/** One moment card: the clip on the left (7 of 12), playing the real recording in place; the text on the right (5 of 12). */
function MomentCard({ blocker, playing, now, onPress, onTime, onPause, video }: { blocker: Blocker; playing: boolean; now: number; onPress: () => void; onTime: () => void; onPause: () => void; video: (node: HTMLVideoElement | null) => void }) {
  const list = steps(blocker)
  const current = list.reduce((found, moment, index) => moment.seconds <= now ? index : found, 0)
  const length = blocker.to - blocker.from
  const progress = `${Math.min(100, Math.max(0, (now - blocker.from) / length * 100))}%`
  const about = blocker.title.replace(/\.$/, '').replace(/^./, letter => letter.toLowerCase())
  return <article className={`moment-card${playing ? ' is-playing' : ''}`} data-impact={blocker.impact}>
    <div className="moment-media">
      <div className="moment-clip">
        <video ref={video} src={`${shown.video}#t=${blocker.from}`} poster={blocker.poster} muted playsInline preload="none" tabIndex={-1} aria-hidden="true" onTimeUpdate={onTime} onPause={onPause} />
        <button className="moment-press" aria-label={`${playing ? 'Pause' : 'Play'} ${clock(blocker.from)} to ${clock(blocker.to)}: ${about}`} onClick={onPress}>
          <span className="moment-play"><Icon name={playing ? 'pause' : 'play'} size={14} /></span>
        </button>
        <span className="moment-secs" aria-hidden="true"><span className="now">{clock(now)}</span> → {clock(blocker.to)}</span>
      </div>
      <div className="moment-scrub" aria-hidden="true" style={{ '--now': progress } as CSSProperties}>
        <span className="track" /><span className="fill" />
        {list.slice(1).map(moment => <i key={moment.seconds} className="tick" style={{ '--at': `${(moment.seconds - blocker.from) / length * 100}%` } as CSSProperties} />)}
        <span className="dot" />
      </div>
    </div>
    <div className="moment-text">
      <span className="impact">{impactLabel(blocker, ' · ')}</span>
      <h3>{blocker.title}</h3>
      <p className="where">{blocker.where}</p>
      <ol className="moment-steps">{list.map((moment, index) => <li key={moment.seconds} aria-current={index === current ? 'step' : undefined}><time>{clock(moment.seconds)}</time><span><What moment={moment} /></span></li>)}</ol>
      {blocker.said ? <p className="said"><time>{blocker.said.when}</time><q>{blocker.said.text}</q></p> : <p className="unsaid">They said nothing about this moment.</p>}
      <p className="change"><b>Smallest change.</b> {blocker.change}</p>
    </div>
  </article>
}

/**
 * AttemptView: one person, one goal (design/artefacts/attempt-view.html). The result first, then the minute as one vertical flow
 * with the moments that got in the way set into it as cards whose clips play the real recording in place, then how it felt,
 * the mechanics folded, and the context as a footer. Light theme, as every product surface.
 */
export function AttemptView() {
  const videos = useRef<(HTMLVideoElement | null)[]>([])
  const [playing, setPlaying] = useState<number | null>(null)
  const [now, setNow] = useState<number[]>(() => blockers.map(blocker => blocker.from))
  const at = (index: number, value: number) => setNow(times => times.map((time, i) => i === index ? value : time))
  function stop(index: number) { videos.current[index]?.pause(); setPlaying(current => current === index ? null : current) }
  /** One clip at a time: pressing a clip pauses any other; pressing it again pauses it; at its end it starts over. */
  function press(index: number) {
    const video = videos.current[index]!, blocker = blockers[index]
    if (playing === index) { stop(index); return }
    if (playing !== null) stop(playing)
    const start = now[index] >= blocker.to ? blocker.from : now[index]
    const go = () => {
      video.currentTime = start
      at(index, start)
      void video.play().catch(() => setPlaying(current => current === index ? null : current))
    }
    setPlaying(index)
    if (video.readyState === 0) { video.addEventListener('loadedmetadata', go, { once: true }); video.load() } else go()
  }
  function tick(index: number) {
    const video = videos.current[index], blocker = blockers[index]
    if (!video || playing !== index) return
    if (video.currentTime >= blocker.to) { stop(index); at(index, blocker.to); return }
    at(index, Math.max(blocker.from, video.currentTime))
  }
  const sure = wrongAndSure(shown)
  return <figure className="window theme-light attempt-view" data-artefact="attempt-view" aria-label={`${shown.person}, ${run.goal}`}>
    <figcaption className="window-chrome attempt-crumb">
      <span>Run <b className="mono">{run.run}</b></span><span className="sep" aria-hidden="true">/</span>
      <span>Goal <b>{run.goal}</b></span><span className="sep" aria-hidden="true">/</span>
      <span><b>{shown.person}</b> of {run.people}</span>
      <span className="example-label">{run.label}</span>
    </figcaption>
    <div className="attempt-body">
      <header className="attempt-result">
        <div>
          <h3 className="attempt-headline">{shown.reached === 'yes' ? <>{shown.person} <span className="yes">reached the goal</span>.</>
            : shown.reached === 'no' ? <>{shown.person} <span className="no">did not reach the goal</span>{sure ? ', and was sure they had' : ''}.</>
            : <>The check couldn&apos;t tell whether {shown.person} reached the goal.</>}</h3>
          <p className="lede">{endedLabel[shown.ended]} with {shown.endState}. The check expects {run.expects}.</p>
        </div>
        <dl className="attempt-facts">
          <div><dt>Reached the goal?</dt><dd><span className={shown.reached === 'yes' ? 'yes' : 'no'}>{reachedLabel[shown.reached]}</span>{shown.reached === 'no' && <small>the check failed</small>}</dd></div>
          <div><dt>How it ended</dt><dd>{endedLabel[shown.ended]}<small>at {short(ended.seconds)}</small></dd></div>
          <div><dt>How sure they&apos;d done it</dt><dd>{shown.sure} of 7<span className="scale" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < shown.sure ? 'on' : undefined} />)}</span></dd></div>
          <div><dt>Time on this goal</dt><dd>{spoken(shown.time)}<small>stops at Done</small></dd></div>
        </dl>
      </header>

      <section className="attempt-blockers" aria-labelledby="attempt-blockers">
        <div className="attempt-sec">
          <h3 id="attempt-blockers">What got in the way</h3>
          <ol className="attempt-index" aria-label={`The ${blockers.length} moments, worst first`}>{blockers.map(blocker => <li key={blocker.n}>
            <a href={`#moment-${blocker.n}`}><span className="n" data-impact={blocker.impact} aria-hidden="true">{blocker.n}</span><b>{impactLabel(blocker)}</b> at {clock(blocker.from)}</a>
          </li>)}</ol>
        </div>
        <ol className="attempt-flow" aria-label="The whole minute, in order">
          {flow.map(entry => 'card' in entry
            ? <li key={`card-${entry.card.n}`} className="flow-moment" id={`moment-${entry.card.n}`} data-n={entry.card.n} data-impact={entry.card.impact}>
              <MomentCard blocker={entry.card} playing={playing === entry.index} now={now[entry.index]} onPress={() => press(entry.index)} onTime={() => tick(entry.index)}
                onPause={() => setPlaying(current => current === entry.index ? null : current)} video={node => { videos.current[entry.index] = node }} />
            </li>
            : <li key={entry.row.seconds} className="flow-row" data-signal={signal[entry.row.kind]}><time>{clock(entry.row.seconds)}</time><span className="flow-what"><What moment={entry.row} /></span><span className="url">{entry.row.route}</span></li>)}
          <li className="flow-row" data-signal="ended"><time>{clock(ended.seconds)}</time><span className="flow-what"><What moment={ended} /></span><span className="url">{ended.route}</span></li>
        </ol>
      </section>

      <section className="attempt-felt" aria-labelledby="attempt-felt">
        <div>
          <h3 id="attempt-felt">How it felt</h3>
          <dl>
            <div><dt>How easy was it?</dt><dd>{shown.ease} of 7<small>7 = very easy · typical 5.5</small></dd></div>
            <div><dt>How sure they&apos;d done it</dt><dd>{shown.sure} of 7<small>7 = completely sure</small></dd></div>
            <div><dt>Time on this goal</dt><dd>{spoken(shown.time)}<small>others: {short(Math.min(...others))} to {short(Math.max(...others))}</small></dd></div>
          </dl>
        </div>
        <div>
          <h3>What they said</h3>
          <blockquote className="attempt-words"><time>after</time><div><p>{shown.words}</p>{shown.wordsWhere && <span className="when">{shown.wordsWhere}</span>}</div></blockquote>
        </div>
      </section>

      <details className="attempt-fold">
        <summary><b>Their path and yours</b><span>{visits.length} pages visited · {onPath} on your path</span></summary>
        <div className="fold-body attempt-path">
          <div><span>Your path</span><span className="chain">{run.yourPath.map(route => <i key={route} className="on">{route}</i>)}</span></div>
          <div><span>Their path</span><span className="chain">{visits.map((visit, index) => <i key={index} className={visit.off ? 'off' : run.yourPath.includes(visit.route) && visits.findIndex(other => other.route === visit.route) === index ? 'on' : undefined}>{visit.route}{visit.off && <span className="sr-only"> (off your path)</span>}</i>)}</span></div>
        </div>
      </details>
      <details className="attempt-fold">
        <summary><b>What the check saw</b><span>outcome() ran after Done</span></summary>
        <div className="fold-body">
          <pre className="attempt-diff"><span className="c">{`// ${run.check}`}</span>{'\n'}<span className="m">{`− ${run.expects}`}</span>{'\n'}<span className="p">{`+ ${shown.endState}`}</span>{'\n'}<span className="c">{`// end state: ${ended.route}, ${clock(ended.seconds)}`}</span></pre>
        </div>
      </details>

      <footer className="attempt-foot">
        <span><b>{shown.person}</b> of {run.people} · {shown.source}</span>
        <span>Uses {shown.today} for this today</span>
        <span>{shown.device} · {shown.browser} · window {shown.window}</span>
        <span>{run.date}</span>
        <span>Recorded: {[shown.consent.screen && 'screen', shown.consent.voice && 'voice'].filter(Boolean).join(', ')}. Camera: {shown.consent.camera ? 'recorded' : 'declined'}.</span>
      </footer>
    </div>
  </figure>
}
