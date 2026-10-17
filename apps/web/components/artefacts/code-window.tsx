import { CopyControl } from './copy-control'
import { highlight } from '../../lib/highlight'

/** CodeFile and Snippet: a filename tab, a copy control and highlighted lines. A white window with black type, like the terminal; no terminal chrome. */
export async function CodeWindow({ code, title, language = 'typescript', example = false }: { code: string; title: string; language?: 'typescript' | 'html'; example?: boolean }) {
  const html = await highlight(code, language)
  return <figure className="window code-window" data-artefact="code-window" data-figure><figcaption className="window-chrome"><span className="code-tab">{title}</span>{example && <span className="example-label">Example run</span>}<CopyControl text={code} label={title} /></figcaption><div className="code-body" tabIndex={0} role="region" aria-label={title}><div className="line-numbers" aria-hidden="true">{code.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div><div dangerouslySetInnerHTML={{ __html: html }} /></div></figure>
}
