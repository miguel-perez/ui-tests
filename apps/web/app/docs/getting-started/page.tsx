import Link from 'next/link'
import { SiteShell } from '../../../components/site-shell'
import { StepPair } from '../../../components/site/step-pair'
import { Caption } from '../../../components/site/caption'
import { Code, Prose } from '../../../components/site/code'
import { TerminalWindow } from '../../../components/artefacts/terminal-window'
import { CodeWindow } from '../../../components/artefacts/code-window'
import { HostedForm } from '../../../components/artefacts/hosted-form'
import { Dashboard } from '../../../components/artefacts/dashboard'
import { Icon } from '../../../components/icon'
import { guide, landing, inviteExample, agent, hosted, runs } from '../../../lib/copy'

const anchors = ['install', 'set-up', 'try-it', 'write-your-own', 'real-people', 'agent']
const started = [{ ...runs[0], date: 'today', participants: '0 of 5', status: 'running' as const, progress: 0.02, name: hosted.goal }]

/** The guide: Step × 6, then the "Without a repository" track as Step × 2 (docs/design/site-schema.md). */
export default function GettingStarted() {
  return <SiteShell><main id="content" className="site-width guide">
    <header className="guide-head"><h1>{guide.title}</h1><p>{landing.requirement}</p></header>
    <nav className="step-index" aria-label="Getting started"><ol>{guide.titles.map((title, i) => <li key={title}><a href={`#${anchors[i]}`}><span>0{i + 1}</span>{title}</a></li>)}<li><a href="#without-repository"><Icon name="link" size={16} />Without a repository</a></li></ol></nav>
    <StepPair id="install" number="01" title={guide.titles[0]} intro={<p>{guide.installIntro.slice(0, guide.installIntro.indexOf('Without a repository'))}<a className="text-link" href="#without-repository">Without a repository</a>.</p>} type={<TerminalWindow name="install" title="npm install -D ui-tests" example={false} />} see={<Caption text={guide.install} />} />
    <StepPair id="set-up" number="02" title={guide.titles[1]} type={<TerminalWindow name="initCommand" title="npx ui-tests init" example={false} />} see={<><TerminalWindow name="init" title="npx ui-tests init" example={false} /><ol className="mount-steps"><li>Import <Code>{'{ UiTests }'}</Code> from <Code>ui-tests/next</Code> and mount <Code>{'<UiTests />'}</Code> in your root layout body.</li><li>In <Code>app/ui-tests/[run]/page.tsx</Code>, render <Code>{'<Player runId={run} token={token} />'}</Code> from <Code>ui-tests/next</Code>.</li><li>In <Code>app/api/ui-tests/route.ts</Code>, export <Code>GET</Code> and <Code>{'POST = createCollector()'}</Code> from <Code>ui-tests/server</Code>; export <Code>{"runtime = 'nodejs'"}</Code>.</li></ol><Caption text="Then start your app with `npm run dev` and go on to step 3." /></>} />
    <StepPair id="try-it" number="03" title={guide.titles[2]} intro={<p>{guide.try}</p>} type={<TerminalWindow name="devCommand" title="npx ui-tests" example={false} />} see={<><TerminalWindow name="dev" title="npx ui-tests" example={false} /><Caption text="Your rehearsal is never counted with people." /><p><Link className="text-link" href="/#person">See the card, the bar and the questions.</Link></p></>} />
    <StepPair id="write-your-own" number="04" title={guide.titles[3]} intro={<p><Prose text={guide.write} /></p>} type={<CodeWindow code={inviteExample} title="ui-tests/first.ui.test.ts" />} see={<><Caption text={guide.next} /><Caption text={landing.fileCaption} /></>} />
    <StepPair id="real-people" number="05" title={guide.titles[4]} type={<><TerminalWindow name="runCommand" title="npx ui-tests run" example={false} /><Caption text={guide.once} /><TerminalWindow name="reportCommand" title={'npx ui-tests report k2m9'} example={false} /></>} see={<><TerminalWindow name="run" title="npx ui-tests run" /><TerminalWindow name="report" /><Caption text={guide.pr} /><p><Link className="text-link" href="/#pull-request">Open the example report and the pull-request check.</Link></p></>} />
    <StepPair id="agent" number="06" title={guide.titles[5]} intro={<p><Prose text={guide.agent} /></p>} type={<><TerminalWindow name="agentCommand" title={agent.command} example={false} /><Caption code={agent.fileLine} /></>} see={<><TerminalWindow name="agent" title={agent.command} /><Caption text={agent.closing} /></>} />
    <section className="track" id="without-repository" aria-labelledby="without-repository-title">
      <h2 id="without-repository-title">Without a repository</h2>
      <StepPair id="paste" number="1" title={hosted.paste} type={<CodeWindow code={hosted.snippet} title="index.html" language="html" />} see={<Caption text={hosted.pasteSee} />} />
      <StepPair id="fill" number="2" title={hosted.fill} type={<HostedForm />} see={<><Dashboard rows={started} /><Caption text={hosted.fillSee} /><p className="caption">{hosted.closing}</p></>} />
    </section>
  </main></SiteShell>
}
