import { codeToHtml } from 'shiki'
import { CopyControl } from './copy-control'

export async function CodeWindow({ code, title }: { code: string; title: string }) {
  const html = await codeToHtml(code, { lang: 'typescript', theme: {
    name: 'ui-tests', type: 'dark', colors: { 'editor.background': '#141920', 'editor.foreground': '#a1abb8' },
    tokenColors: [{ scope: ['keyword', 'storage'], settings: { foreground: '#eef1f5', fontStyle: 'bold' } }, { scope: ['string', 'constant'], settings: { foreground: '#eef1f5' } }],
  } })
  return <figure className="window code-window" data-artefact="code-window"><figcaption className="window-chrome"><span className="code-tab">{title}</span><span className="example-label">Example run</span><CopyControl text={code} label={title} /></figcaption><div className="code-body" tabIndex={0} role="region" aria-label={title}><div className="line-numbers" aria-hidden="true">{code.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div><div dangerouslySetInnerHTML={{ __html: html }} /></div></figure>
}
