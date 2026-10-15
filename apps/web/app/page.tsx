import Link from 'next/link'
import { buttonVariants } from '../components/ui/button'
import { CodeBlock } from '../components/code-block'
import { Mark } from '../components/mark'
import { SiteShell, repository } from '../components/site-shell'
import { headline, intro, landing, ladder, sections, example, progress, rehearsal, terminal, ui } from '../lib/copy'

const rungMarks = ['functional', 'usable', 'desirable', 'pleasurable']
const sectionMarks = ['write', 'derive', 'inspect']

export default function Home() {
  return <SiteShell><main id="content" className="site-width landing">
    <section className="hero" aria-labelledby="promise">
      <div className="hero-copy">
        <p className="eyebrow">{landing.eyebrow}</p>
        <h1 id="promise">{headline[0]}<br />{headline[1]}</h1>
        <p className="hero-intro">{intro}</p>
        <div className="hero-actions"><Link className={buttonVariants()} href="/docs/getting-started">{ui.getStarted}<span aria-hidden="true"> ↗</span></Link><a className={buttonVariants({ variant: 'outline' })} href={repository}>{ui.viewGithub}</a></div>
      </div>
      <div className="hero-output">
        <Mark name="glow" className="hero-glow" />
        <div className="terminal"><div className="terminal-header"><span className="terminal-dot" /><span>{ui.terminalLabel}</span></div><pre><code>{terminal}</code></pre></div>
      </div>
      <p className="hero-premise">{landing.premise}</p>
    </section>

    <section className="landing-section" aria-labelledby="ladder-title">
      <div className="section-heading"><h2 id="ladder-title">{landing.ladderTitle}</h2><p>{landing.ladderIntro}</p></div>
      <div className="ladder-grid">{ladder.map(([title, description], index) => <section key={title} className={`grid-cell rung-${index}`}>
        <div className="cell-heading"><Mark name={rungMarks[index]} /><span className="cell-number">0{index + 1}</span></div>
        <h3>{title}</h3><p>{description}</p>
        {index === 1 && <div className="example-result"><p className="eyebrow">{landing.exampleLabel}</p><ul>{landing.issues.map(issue => <li key={issue}>{issue}</li>)}</ul><p className="result-sentence">{rehearsal}</p><p className="interpretation">{landing.interpretation}</p><p className="snapshot-outcome">{landing.outcome}</p></div>}
        {index > 1 && <p className="planned-note">{landing.planned}</p>}
      </section>)}</div>
    </section>

    <section className="landing-section context-section" aria-labelledby="context-title"><div className="section-heading"><h2 id="context-title">{landing.contextTitle}</h2><p>{landing.contextIntro}</p></div><CodeBlock code={example} label="landing.ui.test.ts" /></section>

    <section className="landing-section" aria-labelledby="pipeline-title"><div className="section-heading"><h2 id="pipeline-title">{landing.pipelineTitle}</h2><p>{landing.pipelineIntro}</p></div><div className="process-grid">{sections.map(([title, body], index) => <section className="grid-cell" key={title}><Mark name={sectionMarks[index]} /><h3>{title}</h3><p>{body}</p></section>)}</div></section>
    <aside className="progress-note" aria-label={ui.progress}><p>{progress}</p><p>{landing.access}</p></aside>
  </main></SiteShell>
}
