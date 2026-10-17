import Link from 'next/link'
import { SiteShell, repository } from '../components/site-shell'
import { Hero } from '../components/hero'
import { SectionHead } from '../components/site/section-head'
import { Caption } from '../components/site/caption'
import { TerminalWindow } from '../components/artefacts/terminal-window'
import { CodeWindow } from '../components/artefacts/code-window'
import { AttemptView } from '../components/artefacts/attempt-view'
import { Compilation } from '../components/artefacts/compilation'
import { Sources } from '../components/artefacts/sources'
import { PullRequest } from '../components/artefacts/pull-request'
import { Dashboard } from '../components/artefacts/dashboard'
import { Icon } from '../components/icon'
import { promise, intro, landing, agent, hosted } from '../lib/copy'

function Actions() { return <div className="actions"><Link className="button primary" href="/docs/getting-started">Get started<Icon name="arrow" /></Link><a className="button quiet" href={repository}><Icon name="github" />GitHub</a></div> }

/** The landing page: a sequence of typed content per docs/design/site-schema.md, laid out per docs/design/grid-plan.md. */
export default function Home() {
  return <SiteShell><main id="content">
    <Hero headline={promise} standfirst={intro} actions={<Actions />} fineprint={landing.access} caption={landing.caption} />
    <div className="site-width">
      <section className="block" aria-labelledby="comes-back">
        <SectionHead id="comes-back" heading={landing.comesBack} lead={landing.comesBackLead} />
        <AttemptView />
        <Caption text={landing.closing} />
      </section>
      <Compilation />
      <Sources />
      <PullRequest />
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
    </div>
  </main></SiteShell>
}
