'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icon'
import { run, clock } from '../../lib/attempts'
import { pullRequest } from '../../lib/copy'
import { rows, findings, total, result, legend, caveat, people, closing, source, clip, issueMarkdown, type Finding, type Moment } from '../../lib/pull-request'

const impactWord = (finding: Finding) => finding.impact === 'worked' ? 'Worked' : finding.impact[0].toUpperCase() + finding.impact.slice(1)

/** The clip card: the person's recording from the moment's second, its range, and one play control; muted, never autoplaying. */
function ClipCard({ moment, title }: { moment: Moment; title: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const { video, from, to } = clip(moment)
  function press() {
    const element = ref.current!
    if (playing) { element.pause(); return }
    const go = () => { if (element.currentTime < from || element.currentTime >= to) element.currentTime = from; void element.play().catch(() => setPlaying(false)) }
    setPlaying(true)
    if (element.readyState === 0) { element.addEventListener('loadedmetadata', go, { once: true }); element.load() } else go()
  }
  return <div className={`rr-clip${playing ? ' is-playing' : ''}`}>
    <video ref={ref} src={`${video}#t=${from}`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={event => { if (event.currentTarget.currentTime >= to) { event.currentTarget.pause(); event.currentTarget.currentTime = from } }} />
    <span className="rr-secs">{clock(from)} → {clock(to)}</span>
    <button className="rr-play" aria-label={`${playing ? 'Pause' : 'Play'} Person ${moment.person} · ${clock(from)}: ${title}`} onClick={press}><Icon name={playing ? 'pause' : 'play'} size={14} /></button>
  </div>
}

/** The five person marks in fixed order, filled for the people who hit it. */
function Marks({ finding }: { finding: Finding }) {
  return <span className="rr-marks" role="img" aria-label={`Hit by ${finding.people.map(person => `Person ${person}`).join(', ')}`}>
    {run.attempts.map(entry => <i key={entry.number} className={finding.people.includes(entry.number) ? 'on' : undefined} aria-hidden="true">{entry.number}</i>)}
  </span>
}

/** Reads `#problem-2&t=49` (the check's moment links) into a row and a moment. */
function fromHash(hash: string) {
  const match = /^#(problem-\d+|worked)(?:&t=(\d+))?$/.exec(hash)
  const index = match ? rows.findIndex(row => row.id === match[1]) : -1
  if (index < 0) return undefined
  const second = match![2] === undefined ? undefined : Number(match![2])
  return { index, moment: rows[index].moments.find(moment => moment.seconds === second) ?? rows[index].moments[0] }
}

/**
 * RunReport: the run report page, the viewer shape (design/artefacts/run-report.html). One line for the result; the five people in
 * one line, each linking to their attempt; the problems on the left, worst first by impact then count, what worked last; on the right
 * the evidence of the selected problem, which stays put while the list scrolls; one closing line. On a phone the two panes stack.
 * A white window on the site tokens; the landing draws it with an address bar, the page /r/<run> without.
 */
export function RunReport({ level = 1, address, links, example = false }: { level?: 1 | 4; address?: string; links?: Record<number, string>; example?: boolean }) {
  const [selected, setSelected] = useState(0)
  const [moment, setMoment] = useState<Moment>(rows[0].moments[0])
  const [status, setStatus] = useState('')
  const pane = useRef<HTMLElement>(null)
  const finding = rows[selected]
  const Heading = level === 1 ? 'h1' : 'h4'
  useEffect(() => {
    const follow = () => { const found = fromHash(location.hash); if (found) { setSelected(found.index); setMoment(found.moment); document.getElementById(rows[found.index].id)?.scrollIntoView({ block: 'nearest' }) } }
    follow(); addEventListener('hashchange', follow)
    return () => removeEventListener('hashchange', follow)
  }, [])
  function select(index: number) {
    setSelected(index); setMoment(rows[index].moments[0]); setStatus('')
    // Stacked on a phone: bring the evidence into view under the list.
    if (matchMedia('(max-width: 900px)').matches) pane.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  async function copyIssue() {
    try { await navigator.clipboard.writeText(issueMarkdown(finding, moment)); setStatus('Copied') } catch { setStatus('Could not copy. Select the text of the problem instead.') }
  }
  return <figure className="window run-report" data-artefact="run-report" aria-label={`Report: ${run.goal}, run ${run.run}`}>
    {address && <figcaption className="rr-addr"><span className="rr-dots" aria-hidden="true"><i /><i /><i /></span><span className="rr-url">{address}</span>{example && <span className="example-label">{run.label}</span>}</figcaption>}
    <div className="rr-body">
      <header className="rr-top">
        <p className="rr-crumb"><span>{pullRequest.product}</span><span>Run <b className="num">{run.run}</b></span><span>{run.date}</span><span>{total} people from a {source}</span>{!address && example && <span className="example-label">{run.label}</span>}</p>
        <Heading className="rr-result"><b>{run.goal}</b> · {result.reached} · {result.problems}{result.failed && <> · <span className="no">{result.failed}</span></>}</Heading>
      </header>
      <ul className="rr-people" aria-label="The people, each linking to their attempt">{people.map(person => <li key={person.number}>
        <a href={links?.[person.number] ?? person.href}><b>{person.person}</b></a> <span className={person.reached ? 'yes' : 'no'}>{person.reached ? 'reached' : 'not reached'}</span> · <span className="num">{person.time}</span> · ease {person.ease}
      </li>)}</ul>
      <div className="rr-viewer">
        <div className="rr-list">
          <p className="rr-legend">{legend.map(([impact, meaning], index) => <span key={impact}>{index > 0 && ' · '}<b data-impact={impact}>{impact[0].toUpperCase() + impact.slice(1)}</b> {meaning}</span>)}</p>
          <ol aria-label={`${findings.length} problems, worst first, then what worked`}>{rows.map((row, index) => <li key={row.id} id={row.id}>
            <button className={`rr-row${index === selected ? ' is-sel' : ''}`} aria-pressed={index === selected} aria-controls="rr-pane" onClick={() => select(index)}>
              <span className="rr-rank num">{row.rank ?? ''}</span>
              <span className="rr-what"><b>{row.title}.</b><span className="rr-sub"><span className="rr-impact" data-impact={row.impact}>{impactWord(row)}</span><span className="rr-where">{row.page} · {row.locator}</span><Marks finding={row} /></span></span>
              <span className="rr-count num">{row.people.length} of {total}</span>
            </button>
          </li>)}</ol>
        </div>
        <section className="rr-pane" id="rr-pane" ref={pane} aria-label={`Evidence: ${finding.title}`}>
          <ClipCard key={`${moment.person}-${moment.seconds}`} moment={moment} title={finding.title} />
          {finding.quote && <p className="rr-quote">{finding.quote.text}<small>{finding.quote.who}</small></p>}
          <dl>
            <div><dt>Where</dt><dd><code>{finding.page}</code> · <code>{finding.playwright}</code></dd></div>
            <div><dt>Moments</dt><dd><span className="rr-moments">{finding.moments.map(entry => <button key={`${entry.person}-${entry.seconds}`} className="rr-chip" aria-pressed={entry.person === moment.person && entry.seconds === moment.seconds} onClick={() => { setMoment(entry); setStatus('') }}><Icon name="play" size={10} />Person {entry.person} · {clock(entry.seconds)}</button>)}</span></dd></div>
            {finding.change && <div><dt>Suggested change</dt><dd className="rr-fix"><b>{finding.change}</b></dd></div>}
          </dl>
          {finding.impact !== 'worked' && <div className="rr-act"><button className="rr-copy" onClick={copyIssue}><Icon name="copy" size={13} />{pullRequest.copyIssue}</button><span role="status" className="rr-status">{status}</span></div>}
        </section>
      </div>
      <p className="rr-foot">After the goal: {closing.afterGoal.map(([label, value], index) => <span key={label}>{index > 0 && ' · '}{label} <b>{value} of 5</b></span>)} · First look: {closing.firstLook.map(([label, value], index) => <span key={label}>{index > 0 && ', '}{label} <b>{value} of {total}</b></span>)} · Who took part: {closing.whoTookPart} · {closing.environment} · {caveat}</p>
    </div>
  </figure>
}
