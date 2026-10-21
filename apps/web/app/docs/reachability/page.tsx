import type { Metadata } from 'next'
import { SiteShell } from '../../../components/site-shell'
import { CopyControl } from '../../../components/artefacts/copy-control'
import { Prose } from '../../../components/site/code'

export const metadata: Metadata = { title: 'Inside your network, or on one machine · ui-tests' }

const perimeter = 'npx ui-tests recruit --host 10.0.0.5'
const local = 'npx ui-tests recruit --local'

function Command({ text }: { text: string }) {
  return <figure className="docs-code"><pre tabIndex={0}><code>{text}</code></pre><CopyControl text={text} label={text} /></figure>
}

/**
 * Reachability for builds nobody outside can open (PRD 05): inside a network perimeter, and on one machine. The ui-tests server
 * builds every address from the request it answers, so it never assumes it is public.
 */
export default function Reachability() {
  return <SiteShell><main id="content" className="site-width docs">
    <h1>Inside your network, or on one machine</h1>
    <p className="docs-lead">A build that only your network can reach, or that only this machine can, can still be tested with people who can sit in front of it.</p>
    <section aria-labelledby="perimeter">
      <h2 id="perimeter">Inside the perimeter</h2>
      <p><Prose text="Run your build on a machine your network can reach, and `recruit --host` there. It opens a front door on that machine: one address that serves your app and a ui-tests server of its own, and points your app's tag at itself. The invite links go on the name or address people use to reach the machine, on the front door's port, which the command prints; give `--host` a port or a URL and only its host name is used." /></p>
      <Command text={perimeter} />
      <p>The ui-tests server, the store and the runner all stay inside. The server answers on whatever address the request came to, so a link to <code>10.0.0.5</code> on the front door&apos;s port works without a public name, a tunnel or a certificate. Keep the command running while people take part. Nothing crosses the perimeter unless you export the record yourself, with a report you share or the webhook you set.</p>
      <p>The trace says the run was reached by <code>perimeter</code>. Paid participants and hosted runs do not apply here: the people are colleagues or customers you invite yourself, and they are not paid through the product.</p>
    </section>
    <section aria-labelledby="local">
      <h2 id="local">Local only</h2>
      <p>For hallway testing, put the build on one machine and give the laptop to the person. The ui-tests server runs on the same machine, and the command starts it if none is running.</p>
      <Command text={local} />
      <p>Local only makes no outbound network call from the commands. It opens no tunnel, asks no model, tells no GitHub and sends no webhook, and it says so when it starts. That holds for every later command on the run too: <code>status</code>, <code>verify</code>, <code>check</code> and the trace tell no one about a local run.</p>
      <p>To keep that true it refuses what would go out: a target that is not on this machine over http, a ui-tests server that is not on this machine, and a store that is not on this machine (a <code>postgres://</code> database; SQLite and <code>pglite:</code> are fine). The picture of the first look is taken with every address but this machine&apos;s blocked.</p>
      <p>It does not control the browser of the person you hand the laptop to, or what your own build asks for once it is open. The run and its records are in the local store, and the trace says the run was reached by <code>local</code>.</p>
    </section>
    <section aria-labelledby="how-reached">
      <h2 id="how-reached">How a run is reached</h2>
      <p>Each run records one of five: <code>preview</code> for a Vercel preview, <code>tunnel</code> for a build on your machine opened to the internet, <code>deploy</code> for any other public address, <code>perimeter</code> for a private address or a name that only resolves inside a network, and <code>local</code> for this machine.</p>
      <p><a href="/docs/getting-started/">Back to getting started</a></p>
    </section>
  </main></SiteShell>
}
