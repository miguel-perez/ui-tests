import { SiteShell, repository } from '../components/site-shell'
import { Hero } from '../components/hero'
import { WhatComesBack } from '../components/artefacts/what-comes-back'
import { Compilation } from '../components/artefacts/compilation'
import { Sources } from '../components/artefacts/sources'
import { Agents } from '../components/artefacts/agents'
import { Worth } from '../components/artefacts/worth'
import { Host } from '../components/artefacts/host'
import { Icon } from '../components/icon'
import { CursorFollies } from '../components/cursor-follies'
import { promise, intro, landing } from '../lib/copy'

function Actions() { return <div className="actions"><a className="button primary" href={repository}><Icon name="github" />GitHub</a></div> }

/**
 * The landing page: a sequence of typed content per docs/design/site-schema.md, every section on one grid per docs/design/grid-plan.md
 * (design/artefacts/README.md, "The page grid, in one place"): hero, how it works, what you write, where the people come from, what a
 * run is worth, the agent section, the host section (no repo, one command). Over it, on the landing only, the cursor follies (issue #75).
 */
export default function Home() {
  return <SiteShell><main id="content">
    <Hero headline={promise} standfirst={intro} actions={<Actions />} fineprint={landing.access} caption={landing.caption} />
    <div className="site-width">
      <WhatComesBack />
      <Compilation />
      <Sources />
      <Worth />
      <Agents />
      <Host />
    </div>
  </main><CursorFollies /></SiteShell>
}
