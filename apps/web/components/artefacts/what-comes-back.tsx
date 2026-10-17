import type { ReactNode } from 'react'
import { checkTitle, ranked, legendLine } from 'ui-tests/check'
import { run, clock } from '../../lib/attempts'
import { landing, runFacts, whatComesBack } from '../../lib/copy'
import { exampleCheck, checkLead, reportPath, findings, attemptPath } from '../../lib/pull-request'
import { SectionHead } from '../site/section-head'
import { Caption } from '../site/caption'
import { RunReport } from './run-report'

/** GitHub's marks, drawn in the current colour: the check's neutral dot in a ring, and the tick of a successful check. */
function Neutral() { return <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="8" cy="8" r="2.2" /></svg> }
function Passed() { return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.5" /><path d="M5 8.2l2 2 4-4.2" /></svg> }
/** A link the check carries to the report, as a path on this site. */
const local = (url: string) => url.replace(runFacts.host, '')

/** The check in the merge box: GitHub's own heading, our line with its neutral mark, the team's other checks. */
function MergeBox() {
  return <div className="window pr-gh pr-merge" data-artefact="merge-box" data-figure role="group" aria-label="The merge box on the pull request">
    <div className="pr-gh-hd"><span className="pr-ic ok"><Passed /></span><span>{whatComesBack.check.heading}</span><span className="pr-sub">· {whatComesBack.check.counts}</span><span className="example-label">{run.label}</span></div>
    <div className="pr-chk ours"><span className="pr-ic neutral" role="img" aria-label="Neutral"><Neutral /></span><span className="pr-t"><b>ui-tests</b> · {checkTitle(exampleCheck)}</span><a href="#check-page" aria-label="ui-tests details">Details</a></div>
    {whatComesBack.check.others.map(check => <div className="pr-chk" key={check.name}><span className="pr-ic ok" role="img" aria-label="Successful"><Passed /></span><span className="pr-t"><b>{check.name}</b> · {check.summary}</span><a href="#check-page" aria-label={`${check.name} details`}>Details</a></div>)}
  </div>
}

/** The check's own page on GitHub: its title, the sentence, the three problems to fix first, the legend, the links and the footer. */
function CheckPage() {
  const top = ranked(exampleCheck.problems).slice(0, 3), rest = exampleCheck.problems.length - top.length
  return <div className="window pr-gh pr-cp" data-artefact="check-page" data-figure role="group" aria-label="The check's page on GitHub">
    <div className="pr-side"><b>Checks</b><span className="on">ui-tests</span>{whatComesBack.check.others.map(check => <span key={check.name}>{check.name}</span>)}<span className="example-label">{run.label}</span></div>
    <div className="pr-main">
      <h4><span className="pr-ic neutral"><Neutral /></span>{checkTitle(exampleCheck)}</h4>
      <div className="pr-md">
        <p>{checkLead.split('*').map((part, index) => index % 2 ? <em key={index}>{part}</em> : part)}</p>
        <div className="pr-tbl"><table>
          <thead><tr><th scope="col">#</th><th scope="col">Problem</th><th scope="col">Where</th><th scope="col">People</th><th scope="col">Impact</th><th scope="col">Moment</th></tr></thead>
          <tbody>{top.map((problem, index) => <tr key={problem.title}>
            <td className="num">{index + 1}</td><td>{problem.title}</td><td><code>{problem.page}</code> · <code>{problem.locator}</code></td><td className="num">{problem.people} of {exampleCheck.people}</td>
            <td><span className="pr-impact" data-impact={problem.impact}>{problem.impact[0].toUpperCase() + problem.impact.slice(1)}</span></td>
            <td>{problem.moment && <a href={local(problem.moment.url)}>Person {problem.moment.person} · {clock(problem.moment.seconds)}</a>}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="pr-legend">{legendLine}</p>
        <p className="pr-links"><a href={reportPath}>Open the report</a>{rest > 0 && <a href={`${reportPath}#${findings[top.length].id}`}>+{rest} more problem{rest === 1 ? '' : 's'}</a>}<a href={`${reportPath}#worked`}>What worked</a></p>
        <p className="pr-foot">{[exampleCheck.footer.people, exampleCheck.footer.preview, exampleCheck.footer.commit, exampleCheck.footer.date].join(' · ')}</p>
      </div>
    </div>
  </div>
}

type Piece = { n: number; id: string; name: string; intro: string }
/** A numbered piece: its intro (the mono number in the moment colour, the name, at most 64ch of text) over its artefact, all twelve columns. */
function Piece({ piece, children }: { piece: Piece; children: ReactNode }) {
  return <section className="piece" id={piece.id} aria-labelledby={`${piece.id}-h`}><div className="piece-intro"><h3 id={`${piece.id}-h`} data-n={piece.n}>{piece.name}</h3><p>{piece.intro}</p></div>{children}</section>
}

/**
 * WhatComesBack (docs/design/site-schema.md; design/artefacts/what-comes-back.html): the landing section "What comes back.", in place
 * of the one-person attempt view and "In the pull request" (issue #46). On the page grid: the heading in five columns and the lead in
 * seven, then three numbered pieces in the order a developer meets them, each artefact across all twelve columns: the check in the
 * merge box with a neutral mark, its page on GitHub, and the report the check links to, whose people open their attempts at
 * /r/<run>/p<n>. GitHub's chrome is drawn in the site's neutrals; colour stays on the data.
 */
export function WhatComesBack() {
  const { check, checkPage, report } = whatComesBack
  return <section className="block comes-back" aria-labelledby="comes-back" data-artefact="what-comes-back" data-section="what-comes-back">
    <SectionHead id="comes-back" heading={whatComesBack.heading} lead={whatComesBack.lead} />
    <Piece piece={check}><MergeBox /></Piece>
    <Piece piece={checkPage}><CheckPage /></Piece>
    <Piece piece={report}>
      <RunReport level={4} address={`ui-tests.com${reportPath}`} example links={Object.fromEntries(run.attempts.map(entry => [entry.number, attemptPath(entry.number)]))} />
      <Caption text={landing.closing} />
    </Piece>
  </section>
}
