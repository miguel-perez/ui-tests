import type { ReactNode } from 'react'
import { Invitation, JoinSheet, weekboardChrome } from 'ui-tests/next'
import { sources } from '../../lib/copy'
import { Icon } from '../icon'
import { Prose } from '../site/code'
import { SectionHead } from '../site/section-head'
import { SourcesTable } from './sources-table'

type Row = (typeof sources.rows)[number]
type Fill = typeof sources.fill

/** The light host page's address bar, as in every frame. */
function Address({ url }: { url: string }) { return <div className="frame-addr" aria-hidden="true"><i /><i /><i /><span>{url}</span></div> }
/** Prolific's and CloudResearch Connect's own wordmarks, in the ink of the page; the name is the mark's accessible name. */
function Wordmark({ id, name }: { id: string; name: string }) {
  return <span className="wordmark-group" role="img" aria-label={name}>{id === 'connect' && <span className="wordmark-maker" aria-hidden="true">CloudResearch</span>}<i className={`wordmark ${id}`} aria-hidden="true" /></span>
}

/** The run filling across Prolific and CloudResearch Connect: a bar for each with its count and first person, its pool and speed, then the payment against the cap. */
function FillPicture({ fill }: { fill: Fill }) {
  return <div className="src-fill" role="group" aria-label={fill.label}>
    <div className="src-fill-h"><span>Run <b className="num">{fill.run}</b> · {fill.wanted}</span><span className="num">{fill.elapsed}</span></div>
    {fill.sources.map(source => <div className="src-fill-source" key={source.id}>
      <div className="src-fill-row"><Wordmark id={source.id} name={source.name} /><span className="src-bar" aria-hidden="true"><i /></span><span className="num">{source.count}</span><span className="src-when">{source.first}</span></div>
      <dl className="src-fill-sub"><div><dt>Pool</dt><dd><Prose text={source.pool} /></dd></div><div><dt>Speed</dt><dd>{source.speed}</dd></div></dl>
    </div>)}
    <div className="src-fill-f"><span>Paid <b>{fill.paid}</b> of the {fill.cap} cap · {fill.back} back</span><span>{fill.labelled}</span></div>
  </div>
}

/** Each row's picture: the join screen and the invitation are the real player components over the light Weekboard page; the paid panel's is the run filling. */
const pictures: Record<Row['picture'], ReactNode> = {
  join: <figure className="src-frame auto" aria-label="What a person sees when they open your link">
    <Address url="weekboard-git-invite-flow.vercel.app/ui-tests/k2m9" />
    <JoinSheet name="Weekboard" minutes={10} video level={3} chrome={weekboardChrome} />
  </figure>,
  invitation: <figure className="src-frame shot" aria-label="The invitation as a visitor sees it">
    {/* The board is the light demo app; the invitation over it is the chrome, its inverse. */}
    <img className="frame-shot" src="/sessions/board.jpg" alt="" />
    <Address url="weekboard.app/board" />
    <Invitation name="Weekboard" contained chrome={weekboardChrome} />
  </figure>,
  fill: <FillPicture fill={sources.fill} />,
}

const chevron = <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 4l4 4 4-4" /></svg>
/** A cell with its column's name: hidden on the wide table, where the header names it, and shown as a label on a phone's card. */
function Cell({ k, value, note }: { k: string; value: string; note?: string }) {
  return <span className="src-cell"><span className="src-k">{k}</span><span className="src-v"><Prose text={value} />{note && <small>{note}</small>}</span></span>
}

/**
 * Sources (docs/design/site-schema.md; design/artefacts/sources-section.html): where the people come from. The heading in five
 * columns and the lead in seven, then a table of the three sources (Source, Who, Cost, Time, Good for), one row open at a time; the open row and its well
 * take the surface token edge to edge. The well is 5/7: how it works and the caveat under the name column, the picture on the right.
 */
export function Sources() {
  const [, who, cost, time, goodFor] = sources.columns
  const rows = sources.rows.map(row => ({
    id: row.id, name: row.name,
    cells: <>
      <span className="src-ico" aria-hidden="true"><Icon name={row.icon} size={20} /></span>
      <span className="src-name"><b>{row.name}</b><span><Prose text={row.what} /></span></span>
      <Cell k={who} value={row.who} />
      <Cell k={cost} value={row.cost} note={row.costNote} />
      <Cell k={time} value={row.time} note={row.timeNote} />
      <Cell k={goodFor} value={row.goodFor} />
      <span className="src-chev">{chevron}</span>
    </>,
    well: <>
      <div className="src-how">
        <h3>{sources.how}</h3>
        <ol className="src-steps">{row.steps.map(step => <li key={step}><span><Prose text={step} /></span></li>)}</ol>
        <p className="src-caveat"><b>{row.caveat[0]}</b> {row.caveat[1]}</p>
      </div>
      <div className="src-show">{pictures[row.picture]}</div>
    </>,
  }))
  return <section className="block sources" aria-labelledby="people" data-section="sources">
    <SectionHead id="people" heading={sources.heading} lead={sources.lead} />
    <SourcesTable columns={sources.columns} rows={rows} />
  </section>
}
