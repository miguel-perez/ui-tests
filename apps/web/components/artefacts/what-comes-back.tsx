import type { ReactNode } from 'react'
import { checkTitle, ranked, legendLine } from '../../lib/check'
import { run, clock, attempt } from '../../lib/attempts'
import { problems, runFacts, whatComesBack } from '../../lib/copy'
import { exampleCheck, checkLead } from '../../lib/pull-request'
import { SectionHead } from '../site/section-head'
import { Prose } from '../site/code'

/** GitHub's marks, drawn in the current colour: the check's neutral dot in a ring, and the tick of a successful check. */
function Neutral() { return <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="8" r="2.2" /></svg> }
function Passed() { return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M5 8.2l2 2 4-4.2" /></svg> }
/** A link the check carries to the report, as a path on this site. */

/** The check in the merge box: GitHub's own heading, our line with its neutral mark, the team's other checks. */
function MergeBox() {
  return <div className="window pr-gh pr-merge" data-artefact="merge-box" data-figure role="group" aria-label="The merge box on the pull request">
    <div className="pr-gh-hd"><span className="pr-ic ok"><Passed /></span><span>{whatComesBack.check.heading}</span><span className="pr-sub">· {whatComesBack.check.counts}</span><span className="example-label">{run.label}</span></div>
    <div className="pr-chk ours"><span className="pr-ic neutral" role="img" aria-label="Neutral"><Neutral /></span><span className="pr-t"><b>ui-tests</b> · {checkTitle(exampleCheck)}</span><a href="#check-page" aria-label="ui-tests details">Details</a></div>
    {whatComesBack.check.others.map(check => <div className="pr-chk" key={check.name}><span className="pr-ic ok" role="img" aria-label="Successful"><Passed /></span><span className="pr-t"><b>{check.name}</b> · {check.summary}</span><a href="#check-page" aria-label={`${check.name} details`}>Details</a></div>)}
  </div>
}

/** The check's own page on GitHub: its title, the sentence, the three problems to fix first, the legend, the links and the footer. A drawing: its links are drawn, not followed. */
function CheckPage() {
  const top = ranked(exampleCheck.problems).slice(0, 3), rest = exampleCheck.problems.length - top.length
  return <div className="window pr-gh pr-cp" data-artefact="check-page" data-figure role="group" aria-label="The check's page on GitHub">
    <div className="pr-side"><b>Checks</b><span className="on">ui-tests</span>{whatComesBack.check.others.map(check => <span key={check.name}>{check.name}</span>)}<span className="example-label">{run.label}</span></div>
    <div className="pr-main">
      <h4><span className="pr-ic neutral"><Neutral /></span>{checkTitle(exampleCheck)}</h4>
      <div className="pr-md">
        <p>{checkLead.split('*').map((part, index) => index % 2 ? <em key={index}>{part}</em> : part)}</p>
        <div className="pr-tbl" tabIndex={0} role="region" aria-label="The three problems to fix first"><table>
          <thead><tr><th scope="col">#</th><th scope="col">Problem</th><th scope="col">Where</th><th scope="col">People</th><th scope="col">Impact</th><th scope="col">Moment</th></tr></thead>
          <tbody>{top.map((problem, index) => <tr key={problem.title}>
            <td className="num">{index + 1}</td><td>{problem.title}</td><td><code>{problem.page}</code> · <code>{problem.locator}</code></td><td className="num">{problem.people} of {exampleCheck.people}</td>
            <td><span className="pr-impact" data-impact={problem.impact}>{problem.impact[0].toUpperCase() + problem.impact.slice(1)}</span></td>
            <td>{problem.moment && <span className="pr-link">Person {problem.moment.person} · {clock(problem.moment.seconds)}</span>}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="pr-legend">{legendLine}</p>
        <p className="pr-links"><span className="pr-link">Open the report</span>{rest > 0 && <span className="pr-link">+{rest} more problem{rest === 1 ? '' : 's'}</span>}<span className="pr-link">What worked</span></p>
        <p className="pr-foot">{[exampleCheck.footer.people, exampleCheck.footer.preview, exampleCheck.footer.commit, exampleCheck.footer.date].join(' · ')}</p>
      </div>
    </div>
  </div>
}

type Piece = { n: number; id: string; name: string; intro: string }
/** A numbered piece's intro: the mono number in the moment colour, the name, at most 64ch of text. */
function Intro({ piece }: { piece: Piece }) { return <div className="piece-intro"><h3 id={`${piece.id}-h`} data-n={piece.n}>{piece.name}</h3><p><Prose text={piece.intro} /></p></div> }
/** A numbered piece: its intro over its artefact, all twelve columns. */
function Piece({ piece, children }: { piece: Piece; children: ReactNode }) {
  return <section className="piece" id={piece.id} aria-labelledby={`${piece.id}-h`}><Intro piece={piece} />{children}</section>
}

/** Where a second falls on the rail, as a share of the attempt, to one decimal (the artefact's positions). */
const along = (second: number, total: number) => `${Math.round(second / total * 1000) / 10}%`

/**
 * The replay (issue #62; design/artefacts/what-comes-back.html, "The replay"): an illustration, nothing to press. The intro and one
 * compact moment card on the 5/7 split: the clip's still at the moment, what the person did, what they said and the smallest change.
 * Under them, across twelve columns, the attempt as a rail: a hollow dot at each recorded event at its second, and the moments that
 * got in the way as larger dots filled in their impact's colour, with their time and word. The events and moments are the attempt's.
 */
function Replay() {
  const { replay } = whatComesBack, person = attempt(`p${replay.person}`), total = person.time
  const stops = new Map((person.blockers ?? []).map(blocker => [blocker.from, problems[blocker.problem - 1].impact]))
  const still = person.blockers!.find(blocker => blocker.from === replay.at)!.poster
  // The last moment's label aligns to its right edge, so it stays inside the rail at the end of the minute.
  const last = Math.max(...stops.keys())
  return <section className="piece replay" id={replay.id} aria-labelledby={`${replay.id}-h`}>
    <div className="replay-row">
      <Intro piece={replay} />
      <figure className="replay-moment" data-figure aria-label={`The first problem's moment: Person ${replay.person} at ${clock(replay.at)}`}>
        <div className="replay-clip"><img src={still} alt="" /><span className="replay-clock">{clock(replay.at)} → {clock(replay.to)}</span><span className="replay-play" aria-hidden="true"><svg viewBox="0 0 20 20"><path d="M5 3v14l12-7z" fill="currentColor" /></svg></span></div>
        <figcaption>
          <p className="replay-who"><b>Person {replay.person}</b> · {clock(replay.at)} · <span className="replay-impact">{replay.impact}</span></p>
          <h4>{replay.did}</h4>
          <blockquote>{replay.said}</blockquote>
          <p className="replay-fix"><span>Smallest change</span>{replay.change}</p>
        </figcaption>
      </figure>
    </div>
    <div className="replay-rail" data-figure role="group" aria-label={`Person ${replay.person}'s attempt, 1 minute ${total - 60} seconds, with three moments`}>
      <div className="replay-line" />
      <ol className="replay-dots">{person.moments.map(moment => {
        const impact = stops.get(moment.seconds)
        return <li key={moment.seconds} className={impact && (moment.seconds === last ? `${impact} end` : impact)} data-at={moment.seconds} style={{ left: along(moment.seconds, total) }} aria-hidden={impact ? undefined : true}>
          <i />{impact && <span><b>{clock(moment.seconds)}</b>{impact[0].toUpperCase() + impact.slice(1)}</span>}
        </li>
      })}</ol>
      <p className="replay-ends"><span><b>{clock(0)}</b> {replay.started}</span><span><b>{clock(total)}</b> {replay.ended} · <em>{replay.reached}</em></span></p>
    </div>
  </section>
}

/**
 * WhatComesBack (docs/design/site-schema.md; design/artefacts/what-comes-back.html): the landing section "How it works." (issue #49;
 * "What comes back." in issue #46; the replay round, issue #62). On the page grid: the heading in five columns and no lead, then three
 * numbered pieces with no rule between them, in the order a developer meets them: the check in the merge box with a neutral mark and
 * its page on GitHub, each across all twelve columns, and the replay. The report as the list stays at /r/<run>, which the check page
 * links to. GitHub's chrome is drawn in the site's neutrals; colour stays on the data.
 */
export function WhatComesBack() {
  const { check, checkPage } = whatComesBack
  return <section className="block comes-back" aria-labelledby="comes-back" data-artefact="what-comes-back" data-section="what-comes-back">
    <SectionHead id="comes-back" heading={whatComesBack.heading} />
    <Piece piece={check}><MergeBox /></Piece>
    <Piece piece={checkPage}><CheckPage /></Piece>
    <Replay />
  </section>
}
