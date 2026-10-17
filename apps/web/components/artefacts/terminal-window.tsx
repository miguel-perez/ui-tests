import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * TerminalOutput: the only component with terminal chrome. The fragment is the Ink renderer's own frame, captured at build
 * time with its colours; Ink and its dependencies never enter the client bundle.
 */
export function TerminalWindow({ name = 'report', title = 'npx ui-tests report k2m9', typing = false, example = true }: { name?: string; title?: string; typing?: boolean; example?: boolean }) {
  const html = readFileSync(path.join(process.cwd(), 'generated', `terminal-${name}.html`), 'utf8')
  return <figure className={`window terminal-window ${typing ? 'types-once' : ''}`} data-artefact="terminal-window" data-figure>
    <figcaption className="window-chrome"><span className="window-dots" aria-hidden="true"><i /><i /><i /></span><span className="window-title">{title}</span>{example && <span className="example-label">Example run</span>}</figcaption>
    <div className="terminal-body" tabIndex={0} role="region" aria-label={`${title} ${name.endsWith('Command') || name === 'install' ? 'command' : 'output'}`}><pre dangerouslySetInnerHTML={{ __html: html }} /></div>
  </figure>
}
