import Link from 'next/link'
import { SiteShell, repository } from '../components/site-shell'
import { Hero } from '../components/hero'
import { SectionHead } from '../components/site/section-head'
import { Caption } from '../components/site/caption'
import { CodeWindow } from '../components/artefacts/code-window'
import { WhatComesBack } from '../components/artefacts/what-comes-back'
import { Compilation } from '../components/artefacts/compilation'
import { Sources } from '../components/artefacts/sources'
import { Agents } from '../components/artefacts/agents'
import { Dashboard } from '../components/artefacts/dashboard'
import { Icon } from '../components/icon'
import { promise, intro, landing, hosted } from '../lib/copy'

function Actions() { return <div className="actions"><Link className="button primary" href="/docs/getting-started">Get started<Icon name="arrow" /></Link><a className="button quiet" href={repository}><Icon name="github" />GitHub</a></div> }

/**
 * The landing page: a sequence of typed content per docs/design/site-schema.md, every section on one grid per docs/design/grid-plan.md
 * (design/artefacts/README.md, "The page grid, in one place"): hero, how it works, what you write, where the people come from, the
 * agent section, the hosted section.
 */
export default function Home() {
  return <SiteShell><main id="content">
    <Hero headline={promise} standfirst={intro} actions={<Actions />} fineprint={landing.access} caption={landing.caption} />
    <div className="site-width">
      <WhatComesBack />
      <Compilation />
      <Sources />
      <Agents />
      <section className="block" aria-labelledby="hosted" data-section="hosted">
        <SectionHead id="hosted" heading={hosted.heading} lead={hosted.lead} />
        <CodeWindow code={hosted.snippet} title="index.html" language="html" />
        <Dashboard />
        <Caption text={hosted.closing} />
      </section>
    </div>
  </main></SiteShell>
}
