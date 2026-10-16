'use client'
import { useState, type CSSProperties } from 'react'
import { problems, landing } from '../../lib/copy'
import { run, seconds } from '../../lib/sessions'
import { ReelFrame } from './reel-frame'
import { Icon } from '../icon'

const people = run.sessions.map(entry => entry.person).sort()
const total = people.length
type Watch = { row: number; person: string; at: number; label: string }
const stamp = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
/** Where each person met each problem: the moment-by-participant matrix, one cell per person (results-views audit, rule 2). */
const evidence = problems.map(problem => Object.fromEntries(problem.watch.split(', ').map(label => { const [person, time] = label.split(' '); return [person, seconds(time)] })) as Record<string, number>)

/**
 * FindingsList: the aggregate as a ranked list (results-views audit, rules 2 and 3). Fixed-width fields first and the one free-text
 * field last (issue #18, item 12): rank, count with its bar, a severity chip, the person-by-problem cells, then the problem.
 * Every cell opens the evidence moment; an opened row shows the reel, the quote, the moments to watch and what to change.
 */
export function FindingsList() {
  const [open, setOpen] = useState<number | null>(0)
  const [activated, setActivated] = useState<number | null>(null)
  const [watch, setWatch] = useState<Watch | null>(null)
  function show(row: number, person: string) {
    const at = evidence[row][person]
    setOpen(row); setActivated(row); setWatch({ row, person, at, label: `${person} ${stamp(at)}` })
  }
  return <section className="window theme-light findings-list" data-artefact="findings-list" aria-label="Problems found">
    <div className="window-chrome"><span className="window-title">ui-tests.com/r/k2m9 · {run.goal}</span><span className="example-label">Example run</span></div>
    <div className="findings-head" aria-hidden="true"><span className="num">#</span><span className="num">People</span><span>Severity</span><span className="cells">{people.map(person => <span key={person}>{person}</span>)}</span><span>Problem</span></div>
    <ol className="findings-rows">{problems.map((problem, row) => {
      const count = Object.keys(evidence[row]).length
      const watching = watch?.row === row ? watch : null
      const expanded = open === row
      return <li key={problem.title} className={`finding-row ${expanded ? 'expanded' : ''}`}>
        <div className="finding-line">
          <span className="num rank">{row + 1}</span>
          <span className="num count"><span>{count} of {total}</span><span className="count-bar" style={{ '--share': count / total } as CSSProperties} aria-hidden="true" /></span>
          <span className="severity" data-severity={problem.severity}>{problem.severity}</span>
          <span className="cells">{people.map(person => person in evidence[row]
            ? <button key={person} className="cell hit" aria-label={`Watch ${person} at ${stamp(evidence[row][person])}, problem ${row + 1}`} onClick={() => show(row, person)} />
            : <span key={person} className="cell" aria-hidden="true" />)}</span>
          <button className="finding-toggle" aria-expanded={expanded} onClick={() => { setOpen(expanded ? null : row); setActivated(row) }}><span>{problem.title}</span><Icon name="chevron" size={16} /></button>
        </div>
        {expanded && <div className="finding-detail">
          <ReelFrame key={watching ? watching.label : `reel-${row}`}
            src={watching ? `/sessions/${watching.person.toLowerCase()}.webm` : `/sessions/problem-${row + 1}.webm`}
            poster={watching ? `/sessions/${watching.person.toLowerCase()}.jpg` : `/sessions/problem-${row + 1}.jpg`}
            from={watching ? watching.at : seconds(problem.moment.split(' · ')[1].split(' → ')[0])} to={watching ? watching.at + 8 : seconds(problem.moment.split(' → ')[1])}
            label={watching ? `${watching.label} · ${problem.title.toLowerCase()}` : row === 0 ? landing.moment : `${problem.moment.split(' · ')[0]} · ${problem.title.toLowerCase()}`}
            words={!watching && row === 0 ? landing.words : undefined} play={activated === row} example={false} />
          <div className="finding-evidence">
            <blockquote>{problem.quote}</blockquote>
            <p className="evidence-label">Moments to watch</p>
            <ul className="evidence-moments">{problem.watch.split(', ').map(label => { const person = label.split(' ')[0]; return <li key={label}><button className="watch-moment" aria-pressed={watching?.person === person} onClick={() => show(row, person)}><Icon name="play" size={14} />{label}</button></li> })}</ul>
            <p className="evidence-label">What to change</p>
            <p className="finding-change">{problem.change}</p>
          </div>
        </div>}
      </li>
    })}</ol>
    <footer className="findings-footer"><p className="result-line">{landing.result}</p><p>{landing.priority}</p></footer>
  </section>
}
