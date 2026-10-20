import type { Metadata } from 'next'
import { SiteShell } from '../../../components/site-shell'
import { CopyControl } from '../../../components/artefacts/copy-control'
import { Prose } from '../../../components/site/code'
import { agent } from '../../../lib/copy'
import { gettingStarted } from '../../../lib/getting-started'

export const metadata: Metadata = { title: `${gettingStarted.title} · ui-tests` }

/** One command or block of lines, set in mono, with its copy control; focusable, so a line wider than the column scrolls by keyboard. */
function Command({ text, label }: { text: string; label: string }) {
  return <figure className="docs-code"><pre tabIndex={0}><code>{text}</code></pre><CopyControl text={text} label={label} /></figure>
}

/**
 * Getting started: static in both build modes, so it ships in the export with the landing and is the page the landing study's
 * task ends on. Every word is lib/getting-started.ts.
 */
export default function GettingStarted() {
  const { title, lead, clone, ci, sharing, accessibility, steps } = gettingStarted
  return <SiteShell><main id="content" className="site-width docs">
    <h1>{title}</h1>
    <p className="docs-lead">{lead}</p>
    <aside className="docs-note" aria-labelledby="clone">
      <h2 id="clone">{clone.heading}</h2>
      <p><Prose text={clone.text} /></p>
      <Command text={clone.commands.join('\n')} label="the clone commands" />
      <p><Prose text={clone.then} /></p>
    </aside>
    <ol className="docs-steps">
      {steps.map(step => <li key={step.id} id={step.id}>
        <h2>{step.heading}</h2>
        <p><Prose text={step.text} /></p>
        {'command' in step && <Command text={step.command} label={step.command} />}
        {'lines' in step && <Command text={step.lines.join('\n')} label="the three mount lines" />}
        {'code' in step && <Command text={step.code} label={step.file} />}
        {'result' in step && <p className="docs-result">{step.result}</p>}
      </li>)}
    </ol>
    <section id="ci" aria-labelledby="ci-heading">
      <h2 id="ci-heading">{ci.heading}</h2>
      <p><Prose text={ci.text} /></p>
      <ol>{ci.steps.map(text => <li key={text}><Prose text={text} /></li>)}</ol>
      <p><Prose text={ci.then} /></p>
    </section>
    <section id="sharing" aria-labelledby="sharing-heading">
      <h2 id="sharing-heading">{sharing.heading}</h2>
      <p><Prose text={sharing.text} /></p>
    </section>
    <section id="accessibility" aria-labelledby="accessibility-heading">
      <h2 id="accessibility-heading">{accessibility.heading}</h2>
      <p><Prose text={accessibility.text} /></p>
      <ol>{accessibility.manual.map(text => <li key={text}><Prose text={text} /></li>)}</ol>
      <p><Prose text={accessibility.then} /></p>
    </section>
    <p><a href="/docs/agents/">{agent.heading}</a></p>
  </main></SiteShell>
}
