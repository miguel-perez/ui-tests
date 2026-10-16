'use client'
import { useState, type CSSProperties } from 'react'
import { problems, landing } from '../../lib/copy'
import { run, seconds, clock } from '../../lib/attempts'
import { ReelFrame } from './reel-frame'
import { Icon } from '../icon'

const people = run.attempts.map(entry => entry.number).sort()
const total = people.length
type Watch = { row: number; person: number; at: number; label: string }
/** Where each person met each problem: the problem-by-person matrix, one cell per person (results-views audit, rule 2). */
const evidence = problems.map(problem => Object.fromEntries([...problem.watch.matchAll(/Person (\d) at (\d\d:\d\d)/g)].map(([, person, time]) => [Number(person), seconds(time)])) as Record<number, number>)
const file = (person: number) => run.attempts.find(entry => entry.number === person)!

/**
 * FindingsList: the aggregate as a ranked list (results-views audit, rules 2 and 3). Fixed-width fields first and the one free-text
 * field last (issue #18, item 12): rank, count with its bar, the impact, the person-by-problem cells, then the problem. Ranked by impact, then
 * by how many people hit it (issue #22).
 * Every cell opens the evidence moment; an opened row shows the reel, the quote, the moments to watch and what to change.
 */
export function FindingsList() {
  const [open, setOpen] = useState<number | null>(0)
  const [activated, setActivated] = useState<number | null>(null)
  const [watch, setWatch] = useState<Watch | null>(null)
  function show(row: number, person: number) {
    const at = evidence[row][person]
    setOpen(row); setActivated(row); setWatch({ row, person, at, label: `Person ${person} at ${clock(at)}` })
  }
  return <section className="window findings-list" data-artefact="findings-list" aria-label="Problems found">
    <div className="window-chrome"><span className="window-title">ui-tests.com/r/k2m9 · {run.goal}</span><span className="example-label">Example run</span></div>
    <div className="findings-head" aria-hidden="true"><span className="num">#</span><span className="num">People</span><span>Impact</span><span className="cells" data-label="Person">{people.map(person => <span key={person}>{person}</span>)}</span><span>Problem</span></div>
    <ol className="findings-rows">{problems.map((problem, row) => {
      const count = Object.keys(evidence[row]).length
      const watching = watch?.row === row ? watch : null
      const expanded = open === row
      return <li key={problem.title} className={`finding-row ${expanded ? 'expanded' : ''}`}>
        <div className="finding-line">
          <span className="num rank">{row + 1}</span>
          <span className="num count"><span>{count} of {total}</span><span className="count-bar" style={{ '--share': count / total } as CSSProperties} aria-hidden="true" /></span>
          <span className="finding-impact" data-impact={problem.impact}>{problem.impact}</span>
          <span className="cells">{people.map(person => person in evidence[row]
            ? <button key={person} className="cell hit" aria-label={`Watch Person ${person} at ${clock(evidence[row][person])}, problem ${row + 1}`} onClick={() => show(row, person)} />
            : <span key={person} className="cell" aria-hidden="true" />)}</span>
          <button className="finding-toggle" aria-expanded={expanded} onClick={() => { setOpen(expanded ? null : row); setActivated(row) }}><span>{problem.title}</span><Icon name="chevron" size={16} /></button>
        </div>
        {expanded && <div className="finding-detail">
          <ReelFrame key={watching ? watching.label : `reel-${row}`}
            src={watching ? file(watching.person).video : `/sessions/problem-${row + 1}.webm`}
            poster={watching ? file(watching.person).poster : `/sessions/problem-${row + 1}.jpg`}
            from={watching ? watching.at : seconds(problem.moment.split(' · ')[1].split(' → ')[0])} to={watching ? watching.at + 8 : seconds(problem.moment.split(' → ')[1])}
            label={watching ? `${watching.label} · ${problem.title.toLowerCase()}` : row === 0 ? landing.moment : `${problem.moment.split(' · ')[0]} · ${problem.title.toLowerCase()}`}
            words={!watching && row === 0 ? landing.words : undefined} play={activated === row} example={false} />
          <div className="finding-evidence">
            <blockquote>{problem.quote}</blockquote>
            <p className="evidence-label">Moments to watch</p>
            <ul className="evidence-moments">{problem.watch.split(', ').map(label => { const person = Number(/\d/.exec(label)![0]); return <li key={label}><button className="watch-moment" aria-pressed={watching?.person === person} onClick={() => show(row, person)}><Icon name="play" size={14} />{label}</button></li> })}</ul>
            <p className="evidence-label">What to change</p>
            <p className="finding-change">{problem.change}</p>
          </div>
        </div>}
      </li>
    })}</ol>
    <footer className="findings-footer"><p className="result-line">{landing.reached} {landing.result}</p><p>{landing.afterGoal}</p><p>{landing.priority}</p></footer>
  </section>
}
