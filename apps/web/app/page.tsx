import Link from 'next/link'
import { SiteShell, repository } from '../components/site-shell'
import { InlineCopy } from '../components/inline-copy'
import { TerminalWindow } from '../components/artefacts/terminal-quiet-window'
import { CodeWindow } from '../components/artefacts/code-window'
import { HeroMotion } from '../components/hero-motion'
import { TraceViewer } from '../components/artefacts/trace-viewer'
import { ReportRows } from '../components/artefacts/report-rows'
import { PlayerSurface } from '../components/artefacts/player-surfaces'
import { InviteLink } from '../components/artefacts/invite-link'
import { CapControl } from '../components/artefacts/cap-control'
import { VisitorInvitation } from '../components/artefacts/visitor-invitation'
import { PullRequestCheck } from '../components/artefacts/pull-request-check'
import { HostedForm } from '../components/artefacts/hosted-form'
import { Icon } from '../components/icon'
import { promise, intro, landing, sources, example, agent, hosted } from '../lib/copy'

function Actions() { return <div className="actions"><Link className="button primary" href="/docs/getting-started">Get started<Icon name="arrow" /></Link><a className="button quiet" href={repository}><Icon name="github" />GitHub</a></div> }

export default function Home() {
  return <SiteShell><main id="content">
    <section className="hero" aria-labelledby="promise"><div className="site-width"><div className="hero-grid">
      <div className="hero-copy"><h1 id="promise">{promise}</h1><p className="standfirst">{intro}</p><Actions /><p className="fineprint">{landing.access}</p></div>
      <div className="hero-terminal"><TerminalWindow typing /><p className="caption">{landing.caption}</p></div>
    </div></div><HeroMotion /></section>
    <div className="site-width">
      <section className="landing-section" aria-labelledby="comes-back"><div className="section-heading"><h2 id="comes-back">{landing.comesBack}</h2><p>{landing.comesBackLead}</p></div><TraceViewer /><ReportRows /><p>{landing.priority}</p><p className="closing">{landing.closing}</p></section>
      <section className="landing-section" aria-labelledby="person"><div className="section-heading"><h2 id="person">{landing.person}</h2><p>{landing.personLead}</p></div><div className="player-example"><PlayerSurface surface="scenario-card" /><code>{landing.scenarioLine}</code></div><div className="player-example"><PlayerSurface surface="taskbar" /><div><code>{landing.barLine}</code><p>{landing.barCaption}</p></div></div><div className="player-example"><PlayerSurface surface="ease-question" /><p>{landing.easeCaption}</p></div><p className="closing">{landing.personClosing}</p></section>
      <section className="landing-section" aria-labelledby="people"><div className="section-heading"><h2 id="people">{landing.people}</h2><p>{landing.peopleLead}</p></div><table className="people-table"><thead><tr><th scope="col"><span className="sr-only">Source</span></th><th scope="col">Who</th><th scope="col">Cost</th><th scope="col">Results</th></tr></thead><tbody>{sources.map(([name, who, cost, results], i) => <tr key={name}><th scope="row"><Icon name={i === 0 ? 'link' : i === 1 ? 'users' : 'cursor'} />{name}</th><td><InlineCopy text={who} />{i === 0 ? <InviteLink /> : i === 1 ? <CapControl /> : <VisitorInvitation />}</td><td>{cost}</td><td>{results}</td></tr>)}</tbody></table></section>
      <section className="landing-section" aria-labelledby="pull-request"><div className="section-heading"><h2 id="pull-request">{landing.pr}</h2><p><InlineCopy text={landing.prLead} /></p></div><PullRequestCheck reportId="comes-back" /><p className="caption">{landing.prCaption}</p></section>
      <section className="landing-section" aria-labelledby="agents"><div className="section-heading"><h2 id="agents">{agent.heading}</h2><p>{agent.lead}</p></div><TerminalWindow name="agent" title={agent.command} /><div className="window pull-request-check agent-check"><div className="check-row"><span className="issue-symbol"><Icon name="issue" /></span><span><strong>ui-tests (agent)</strong> <span className="check-summary">· 3 of 5 trials ·</span></span> <a href="https://ui-tests.com/r/k2m9-agent" aria-label="ui-tests (agent) report">Report</a></div></div><p className="closing">{agent.closing}</p></section>
      <section className="landing-section" aria-labelledby="hosted"><div className="section-heading"><h2 id="hosted">{hosted.heading}</h2><p>{hosted.lead}</p></div><CodeWindow code={hosted.snippet} title="index.html" language="html" /><div className="hosted-grid"><HostedForm /><ReportRows compact share /></div><p className="closing">{hosted.closing}</p></section>
      <section className="landing-section" aria-labelledby="commands"><div className="section-heading"><h2 id="commands">{landing.commands}</h2><p>{landing.requirement}</p></div><div className="command-grid"><TerminalWindow name="commands" title="ui-tests" /><TerminalWindow name="init" title="npx ui-tests init" /></div><p>{landing.commandsClosing}</p><p>{landing.ownTest}</p><CodeWindow code={example} title="landing.ui.test.ts" /><p className="caption">{landing.ownCaption}</p><Actions /></section>
    </div>
  </main></SiteShell>
}
