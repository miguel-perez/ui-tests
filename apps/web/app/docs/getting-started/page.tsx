import { CodeBlock } from '../../../components/code-block'
import { SiteShell } from '../../../components/site-shell'
import { commands, example, guide, snippets, rehearsal, progress, ui } from '../../../lib/copy'

const anchors = ['install', 'init-and-mount', 'write-the-test', 'run-dev-mode', 'read-the-result']
function StepLinks() {
  return <ol>{guide.titles.map((title, index) => <li key={title}><a href={`#${anchors[index]}`}><span className="step-number">0{index + 1}</span>{title}</a></li>)}</ol>
}

export default function GettingStarted() {
  return <SiteShell><div className="docs-layout site-width">
    <div className="docs-sidebar"><nav aria-label={ui.steps}><p className="eyebrow">{ui.steps}</p><StepLinks /></nav></div>
    <main id="content" className="docs-content">
      <header className="docs-intro"><p className="eyebrow">{ui.guide}</p><h1>{guide.title}</h1><p>{guide.intro}</p></header>
      <aside className="tip" aria-label={ui.tip}><strong>{ui.tip}</strong><p>{guide.requirement}</p></aside>
      <section id={anchors[0]}><h2><span>01</span>{guide.titles[0]}</h2><p>{guide.install}</p><CodeBlock code={commands.install} label={ui.shell} language={ui.shell} /></section>
      <section id={anchors[1]}><h2><span>02</span>{guide.titles[1]}</h2><CodeBlock code={commands.init} label={ui.shell} language={ui.shell} /><p>{guide.init}</p><CodeBlock code={snippets.layout} label="app/layout.tsx" /><p>{guide.player}</p><CodeBlock code={snippets.player} label="app/ui-tests/[run]/page.tsx" /><p>{guide.collector}</p><CodeBlock code={snippets.collector} label="app/api/ui-tests/route.ts" /></section>
      <section id={anchors[2]}><h2><span>03</span>{guide.titles[2]}</h2><p>{guide.write}</p><CodeBlock code={example} label="landing.ui.test.ts" /><p>{guide.scenario}</p><p>{guide.config}</p><CodeBlock code={snippets.config} label="ui-tests.config.ts" /></section>
      <section id={anchors[3]}><h2><span>04</span>{guide.titles[3]}</h2><p>{guide.run}</p><CodeBlock code={snippets.run} label={ui.shell} language={ui.shell} /><p>{guide.participate}</p><p>{guide.clone}</p><CodeBlock code={snippets.clone} label={ui.shell} language={ui.shell} /></section>
      <section id={anchors[4]}><h2><span>05</span>{guide.titles[4]}</h2><p>{guide.result}</p><p>{guide.isolation}</p><CodeBlock code={rehearsal} label={ui.output} language={ui.output} /><p>{guide.sentence}</p><p>{guide.finish}</p><CodeBlock code={snippets.inspect} label={ui.shell} language={ui.shell} /></section>
      <aside className="progress-note" aria-label={ui.progress}><p>{progress}</p></aside>
    </main>
    <div className="docs-rail"><nav aria-label={ui.onPage}><p className="eyebrow">{ui.onPage}</p><StepLinks /></nav></div>
  </div></SiteShell>
}
