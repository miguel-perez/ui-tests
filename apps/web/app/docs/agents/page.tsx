import type { Metadata } from 'next'
import { SiteShell } from '../../../components/site-shell'
import { CopyControl } from '../../../components/artefacts/copy-control'
import { Prose } from '../../../components/site/code'
import { agent } from '../../../lib/copy'

export const metadata: Metadata = { title: `${agent.heading} · ui-tests` }

/**
 * Where agent runs are introduced in the docs (PRD 04): as a capability test, not a usability one. The heading, the command and the
 * lead are `agent` in lib/copy.ts, the same words the landing's section uses. Nothing here presents an agent as taking a person's place.
 */
export default function Agents() {
  return <SiteShell><main id="content" className="site-width docs">
    <h1>{agent.heading}</h1>
    <p className="docs-lead">{agent.lead}</p>
    <figure className="docs-code"><pre tabIndex={0}><code>{agent.command}</code></pre><CopyControl text={agent.command} label={agent.command} /></figure>
    <section aria-labelledby="what-it-shows">
      <h2 id="what-it-shows">What it shows</h2>
      <p>An agent run shows whether an agent can do the thing against a CLI, an MCP server, an API or a website. It is a capability test, not a usability one. It runs the same task five times, reads each end state with the check you wrote, and reports every trial as verified, stopped or unknown, with its time and what stopped it.</p>
      <p>The result is pass^k by default: it passes when all five trials verified. Set <code>reliability: &apos;any&apos;</code> on a task to read pass@k instead, which passes when one did.</p>
    </section>
    <section aria-labelledby="what-it-does-not">
      <h2 id="what-it-does-not">What it does not claim</h2>
      <p>An agent passing says nothing about people. An agent failing on a website is a reason to look at the trace, not a usability finding.</p>
      <p>Agent runs are kept apart. They post their own check, <code>ui-tests (agent)</code>, which never fails your build, and their report has its own address. They are never counted with a run that has people in it, and a record says which actor made it.</p>
    </section>
    <section aria-labelledby="run-it">
      <h2 id="run-it">Run it</h2>
      <p><Prose text="Set the agent under `agents` in `ui-tests.config.ts`, point a study at `target: { cli }`, `target: { mcp }` or `target: { http }`, and list `actors: ['agent']`. The `anthropic` provider needs `ANTHROPIC_API_KEY` in the environment; without it the command stops before it makes a run." /></p>
      <p><a href="/docs/getting-started/">Back to getting started</a></p>
    </section>
  </main></SiteShell>
}
