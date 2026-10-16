import Link from 'next/link'
import { SiteShell, repository } from '../components/site-shell'
import { Hero } from '../components/hero'
import { SectionHead } from '../components/site/section-head'
import { Caption } from '../components/site/caption'
import { Terms } from '../components/site/terms'
import { TerminalWindow } from '../components/artefacts/terminal-window'
import { CodeWindow } from '../components/artefacts/code-window'
import { SessionView } from '../components/artefacts/session-view'
import { PlayerFrame } from '../components/artefacts/player-frame'
import { OptionsRow } from '../components/artefacts/options-row'
import { ChecksBox } from '../components/artefacts/checks-box'
import { FindingsList } from '../components/artefacts/findings-list'
import { Dashboard } from '../components/artefacts/dashboard'
import { Icon } from '../components/icon'
import { promise, intro, landing, example, agent, hosted } from '../lib/copy'

function Actions() { return <div className="actions"><Link className="button primary" href="/docs/getting-started">Get started<Icon name="arrow" /></Link><a className="button quiet" href={repository}><Icon name="github" />GitHub</a></div> }

/** The landing page: a sequence of typed content per docs/design/site-schema.md, laid out per docs/design/grid-plan.md. */
export default function Home() {
  return <SiteShell><main id="content">
    <Hero headline={promise} standfirst={intro} actions={<Actions />} fineprint={landing.access} caption={landing.caption} />
    <div className="site-width">
      <section className="block" aria-labelledby="comes-back">
        <SectionHead id="comes-back" heading={landing.comesBack} lead={landing.comesBackLead} />
        <SessionView />
        <Caption text={landing.closing} />
      </section>
      <section className="block" aria-labelledby="person">
        <SectionHead id="person" heading={landing.person} lead={landing.personLead} />
        <div className="row-7-5"><PlayerFrame kind="card" /><Caption side code={landing.scenarioLine} text={landing.scenarioCaption} /></div>
        <div className="row-7-5"><PlayerFrame kind="bar" /><Caption side code={landing.barLine} text={landing.barCaption} /></div>
        <div className="row-7-5"><PlayerFrame kind="questions" /><Caption side text={landing.easeCaption} /></div>
        <Caption text={landing.personClosing} />
      </section>
      <section className="block" aria-labelledby="people">
        <SectionHead id="people" heading={landing.people} lead={landing.peopleLead} />
        <OptionsRow />
      </section>
      <section className="block" aria-labelledby="pull-request">
        <SectionHead id="pull-request" heading={landing.pr} lead={landing.prLead} />
        <ChecksBox />
        <div id="findings"><FindingsList /></div>
        <Caption text={landing.prCaption} />
      </section>
      <section className="block" aria-labelledby="agents">
        <SectionHead id="agents" heading={agent.heading} lead={agent.lead} />
        <div className="row-8-4"><TerminalWindow name="agent" title={agent.command} /><Caption side code={agent.fileLine} text={agent.closing} /></div>
      </section>
      <section className="block" aria-labelledby="hosted">
        <SectionHead id="hosted" heading={hosted.heading} lead={hosted.lead} />
        <CodeWindow code={hosted.snippet} title="index.html" language="html" />
        <Dashboard />
        <Caption text={hosted.closing} />
      </section>
      <section className="block" aria-labelledby="commands">
        <SectionHead id="commands" heading={landing.commands} lead={landing.requirement} />
        <TerminalWindow name="commands" title="~/my-app" />
        <div className="row-8-4"><CodeWindow code={example} title="landing.ui.test.ts" /><Caption side title={landing.ownTest} text={landing.ownCaption} /></div>
        <Terms lines={[landing.commandsClosing]} />
        <Actions />
      </section>
    </div>
  </main></SiteShell>
}
