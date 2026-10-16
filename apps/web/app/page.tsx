import Link from 'next/link'
import { SiteShell, repository } from '../components/site-shell'
import { TerminalWindow } from '../components/artefacts/terminal-quiet-window'
import { CodeWindow } from '../components/artefacts/code-window'
import { SessionVideo } from '../components/artefacts/session-video'
import { TraceViewer } from '../components/artefacts/trace-viewer'
import { ReportRows } from '../components/artefacts/report-rows'
import { PlayerSurface } from '../components/artefacts/player-surfaces'
import { InviteLink } from '../components/artefacts/invite-link'
import { CapControl } from '../components/artefacts/cap-control'
import { VisitorInvitation } from '../components/artefacts/visitor-invitation'
import { PullRequestCheck } from '../components/artefacts/pull-request-check'
import { promise, intro, landing, sources, inviteExample, example } from '../lib/copy'

function Actions() { return <div className="actions"><Link className="button primary" href="/docs/getting-started">Get started</Link><a className="button quiet" href={repository}>GitHub</a></div> }
export function InlineCopy({ text }: { text: string }) { return <>{text.split('`').map((part, i) => i % 2 ? <code key={i}>{part}</code> : part)}</> }

export default function Home() {
  return <SiteShell><main id="content">
    <section className="hero" aria-labelledby="promise"><SessionVideo hero /><div className="hero-shade" aria-hidden="true" /><div className="site-width"><div className="hero-grid"><div className="hero-copy"><h1 id="promise">{promise}</h1><p className="standfirst">{intro}</p><Actions /><p className="fineprint">{landing.access}</p></div><div className="hero-terminal"><TerminalWindow typing /><p className="caption">{landing.caption}</p></div></div><div className="moment-label"><span>{landing.moment}</span><p>{landing.words}</p></div></div></section>
    <div className="site-width">
      <section className="landing-section" aria-labelledby="comes-back"><div className="section-heading"><h2 id="comes-back">{landing.comesBack}</h2><p>{landing.comesBackLead}</p></div><CodeWindow code={inviteExample} title="invite-colleague.ui.test.ts" /><p className="caption">{landing.fileCaption}</p><TraceViewer /><ReportRows /><p>{landing.priority}</p><p className="closing">{landing.closing}</p></section>
      <section className="landing-section" aria-labelledby="person"><div className="section-heading"><h2 id="person">{landing.person}</h2><p>{landing.personLead}</p></div><div className="player-example"><PlayerSurface surface="scenario-card" /><code>{landing.scenarioLine}</code></div><div className="player-example"><PlayerSurface surface="taskbar" /><div><code>{landing.barLine}</code><p>{landing.barCaption}</p></div></div><div className="player-example"><PlayerSurface surface="ease-question" /><p>{landing.easeCaption}</p></div><p className="closing">{landing.personClosing}</p></section>
      <section className="landing-section" aria-labelledby="people"><div className="section-heading"><h2 id="people">{landing.people}</h2><p>{landing.peopleLead}</p></div><table className="people-table"><thead><tr><th scope="col"><span className="sr-only">Source</span></th><th scope="col">Who</th><th scope="col">Cost</th><th scope="col">Results</th></tr></thead><tbody>{sources.map(([name, who, cost, results], i) => <tr key={name}><th scope="row">{name}</th><td><InlineCopy text={who} />{i === 0 ? <InviteLink /> : i === 1 ? <CapControl /> : <VisitorInvitation />}</td><td>{cost}</td><td>{results}</td></tr>)}</tbody></table></section>
      <section className="landing-section" aria-labelledby="pull-request"><div className="section-heading"><h2 id="pull-request">{landing.pr}</h2><p><InlineCopy text={landing.prLead} /></p></div><PullRequestCheck /><div className="report-page-frame" id="pr-report"><ReportRows /><TraceViewer /></div><p className="caption">{landing.prCaption}</p></section>
      <section className="landing-section" aria-labelledby="commands"><div className="section-heading"><h2 id="commands">{landing.commands}</h2><p>{landing.requirement}</p></div><TerminalWindow name="commands" title="ui-tests" /><TerminalWindow name="init" title="npx ui-tests init" /><p>{landing.commandsClosing}</p><p>{landing.ownTest}</p><CodeWindow code={example} title="landing.ui.test.ts" /><p className="caption">{landing.ownCaption}</p><Actions /></section>
    </div>
  </main></SiteShell>
}
