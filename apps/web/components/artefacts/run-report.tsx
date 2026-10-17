'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icon'
import { run, clock } from '../../lib/attempts'
import { runFacts } from '../../lib/copy'
import { rows, findings, total, result, legend, caveat, people, closing, source, clip, type Finding, type Moment } from '../../lib/pull-request'

const impactWord = (finding: Finding) => finding.impact === 'worked' ? 'Worked' : finding.impact[0].toUpperCase() + finding.impact.slice(1)

/** The clip card: the person's recording from the moment's second, its second, and one play control; muted, never autoplaying. */
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
    <span className="rr-secs">{clock(from)}</span>
    <button className="rr-play" aria-label={`${playing ? 'Pause' : 'Play'} Person ${moment.person} · ${clock(from)}: ${title}`} onClick={press}><Icon name={playing ? 'pause' : 'play'} size={12} /></button>
  </div>
}

/** The five person marks in fixed order, filled for the people who hit it. */
function Marks({ finding }: { finding: Finding }) {
  return <span className="rr-marks" role="img" aria-label={`Hit by ${finding.people.map(person => `Person ${person}`).join(', ')}`}>
    {run.attempts.map(entry => <i key={entry.number} className={finding.people.includes(entry.number) ? 'on' : undefined} aria-hidden="true">{entry.number}</i>)}
  </span>
}

/** A card's head: rank, impact, the sentence with where it happened, and who hit it with how many. */
function Head({ row }: { row: Finding }) {
  return <div className="rr-hd">
    <span className="rr-rank num">{row.rank ?? ''}</span>
    <span className="rr-impact" data-impact={row.impact}>{impactWord(row)}</span>
    <span className="rr-what"><b>{row.title}.</b><span className="rr-where">{row.page} · {row.locator}</span></span>
    <span className="rr-who"><Marks finding={row} /><span className="rr-count num">{row.people.length} of {total}</span></span>
  </div>
}

/** Reads `#problem-2&t=49` (the check's moment links) into a problem and the moment to play. */
function fromHash(hash: string) {
  const match = /^#(problem-\d+|worked)(?:&t=(\d+))?$/.exec(hash)
  const finding = match ? rows.find(row => row.id === match[1]) : undefined
  if (!finding) return undefined
  const second = match![2] === undefined ? undefined : Number(match![2])
  return { finding, moment: finding.moments.find(moment => moment.seconds === second) ?? finding.moments[0] }
}

/**
 * RunReport: the run report page as the list (design/artefacts/run-report-list.html; issue #49). One line for the result; then one
 * card per problem, worst first by impact then count, each with its evidence inline: rank, impact, the sentence, where, the five
 * person marks and x of n, the words and who said them, the moments as play chips, the suggested change, and the clip on the right;
 * what worked as the last card; the people in a strip, each linking to their attempt; one closing line. A moment chip plays that
 * person's clip in its card, and the check's links (`#problem-2&t=49`) open their card at that moment. On a phone the clip goes under
 * the card's text. A white window on the site tokens; the landing draws it with an address bar, the page /r/<run> without.
 */
export function RunReport({ level = 1, address, links, example = false }: { level?: 1 | 4; address?: string; links?: Record<number, string>; example?: boolean }) {
  const [shown, setShown] = useState<Record<string, Moment>>(() => Object.fromEntries(findings.map(finding => [finding.id, finding.moments[0]])))
  const Heading = level === 1 ? 'h1' : 'h4'
  useEffect(() => {
    const follow = () => {
      const found = fromHash(location.hash)
      if (!found) return
      setShown(current => ({ ...current, [found.finding.id]: found.moment }))
      document.getElementById(found.finding.id)?.scrollIntoView({ block: 'start' })
    }
    follow(); addEventListener('hashchange', follow)
    return () => removeEventListener('hashchange', follow)
  }, [])
  return <figure className="window run-report" data-artefact="run-report" data-figure aria-label={`Report: ${run.goal}, run ${run.run}`}>
    {address && <figcaption className="rr-addr"><span className="rr-dots" aria-hidden="true"><i /><i /><i /></span><span className="rr-url">{address}</span>{example && <span className="example-label">{run.label}</span>}</figcaption>}
    <div className="rr-body">
      <header className="rr-top">
        <p className="rr-crumb"><span>{runFacts.product}</span><span>Run <b className="num">{run.run}</b></span><span>{run.date}</span><span>{total} people from a {source}</span>{!address && example && <span className="example-label">{run.label}</span>}</p>
        <Heading className="rr-result"><b>{run.goal}</b> · {result.reached} · {result.problems}{result.failed && <> · <span className="no">{result.failed}</span></>}</Heading>
      </header>
      <p className="rr-legend">{legend.map(([impact, meaning], index) => <span key={impact}>{index > 0 && ' · '}<b data-impact={impact}>{impact[0].toUpperCase() + impact.slice(1)}</b> {meaning}</span>)}</p>
      <ol className="rr-cards" aria-label={`${findings.length} problems, worst first, then what worked`}>
        {findings.map(finding => {
          const moment = shown[finding.id]
          return <li className="rr-card" key={finding.id} id={finding.id}>
            <div className="rr-text">
              <Head row={finding} />
              <div className="rr-ev">
                {finding.quote && <p className="rr-quote">{finding.quote.text}<small>{finding.quote.who}</small></p>}
                <div className="rr-moments" role="group" aria-label="Moments">{finding.moments.map(entry => <button key={`${entry.person}-${entry.seconds}`} type="button" className="rr-chip" aria-pressed={entry.person === moment.person && entry.seconds === moment.seconds} onClick={() => setShown(current => ({ ...current, [finding.id]: entry }))}><Icon name="play" size={10} />Person {entry.person} · {clock(entry.seconds)}</button>)}</div>
                {finding.change && <p className="rr-fix"><b>{finding.change}</b></p>}
              </div>
            </div>
            <ClipCard key={`${moment.person}-${moment.seconds}`} moment={moment} title={finding.title} />
          </li>
        })}
        {rows.filter(row => row.impact === 'worked').map(row => <li className="rr-card worked" key={row.id} id={row.id}><Head row={row} /></li>)}
      </ol>
      <ul className="rr-strip" aria-label="The people, each linking to their attempt">{people.map(person => <li key={person.number}>
        <a href={links?.[person.number] ?? person.href}><b>{person.person}</b><span className={person.reached ? 'yes' : 'no'}>{person.reached ? 'Reached the goal' : 'Did not reach it'}</span><span className="rr-f num">{person.time} · ease {person.ease} of 7 · {person.ended}</span></a>
      </li>)}</ul>
      <p className="rr-foot">After the goal: {closing.afterGoal.map(([label, value], index) => <span key={label}>{index > 0 && ' · '}{label} <b>{value} of 5</b></span>)} · First look: {closing.firstLook.map(([label, value], index) => <span key={label}>{index > 0 && ', '}{label} <b>{value} of {total}</b></span>)} · Who took part: {closing.whoTookPart} · {closing.environment} · {caveat}</p>
    </div>
  </figure>
}
