import { SiteShell } from '../../../components/site-shell'
import { TerminalWindow } from '../../../components/artefacts/terminal-quiet-window'
import { CodeWindow } from '../../../components/artefacts/code-window'
import { PlayerSurface } from '../../../components/artefacts/player-surfaces'
import { TraceViewer } from '../../../components/artefacts/trace-viewer'
import { ReportRows } from '../../../components/artefacts/report-rows'
import { PullRequestCheck } from '../../../components/artefacts/pull-request-check'
import { guide, landing, inviteExample } from '../../../lib/copy'
import { InlineCopy } from '../../page'
const anchors = ['install', 'set-up', 'try-it', 'write-your-own', 'real-people']
export default function GettingStarted() {
  return <SiteShell><div className="docs-layout site-width"><nav className="docs-sidebar" aria-label="Getting started"><ol>{guide.titles.map((title, i) => <li key={title}><a href={`#${anchors[i]}`}><span>0{i + 1}</span>{title}</a></li>)}</ol></nav><main id="content" className="docs-content"><header><h1>{guide.title}</h1><p>{landing.requirement}</p></header>
    <section id={anchors[0]}><h2>1. {guide.titles[0]}</h2><p>You type:</p><TerminalWindow name="install" title="npm install -D ui-tests" /><p><InlineCopy text={guide.install} /></p></section>
    <section id={anchors[1]}><h2>2. {guide.titles[1]}</h2><p>You type:</p><TerminalWindow name="initCommand" title="npx ui-tests init" /><p>You see:</p><TerminalWindow name="init" title="npx ui-tests init" /></section>
    <section id={anchors[2]}><h2>3. {guide.titles[2]}</h2><p>You type:</p><TerminalWindow name="devCommand" title="npx ui-tests" /><p>{guide.try}</p><PlayerSurface surface="scenario-card" /><PlayerSurface surface="taskbar" /><PlayerSurface surface="ease-question" /><TerminalWindow name="dev" title="npx ui-tests" /><TraceViewer /></section>
    <section id={anchors[3]}><h2>4. {guide.titles[3]}</h2><p><InlineCopy text={guide.write} /></p><CodeWindow code={inviteExample} title="ui-tests/first.ui.test.ts" /><p><InlineCopy text={guide.next} /></p><PlayerSurface surface="scenario-card" /></section>
    <section id={anchors[4]}><h2>5. {guide.titles[4]}</h2><p>You type:</p><TerminalWindow name="runCommand" title="npx ui-tests run" /><p>You see:</p><TerminalWindow name="run" title="npx ui-tests run" /><h3>{guide.read}</h3><p>{guide.once}</p><TerminalWindow name="reportCommand" /><p>You see:</p><TerminalWindow /><ReportRows /><p><InlineCopy text={guide.pr} /></p><PullRequestCheck reportId="guide-report" /><div id="guide-report"><ReportRows /></div></section>
  </main></div></SiteShell>
}
