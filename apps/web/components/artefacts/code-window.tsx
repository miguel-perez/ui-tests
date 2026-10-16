import { codeToHtml } from 'shiki'
import { CopyControl } from './copy-control'

export async function CodeWindow({ code, title, language = 'typescript' }: { code: string; title: string; language?: 'typescript' | 'html' }) {
  const html = await codeToHtml(code, { lang: language, theme: {
    name: 'ui-tests-tokyo-night', type: 'dark', colors: { 'editor.background': '#1a1b26', 'editor.foreground': '#c0caf5' },
    tokenColors: [
      { scope: ['keyword'], settings: { foreground: '#f7768e' } },
      { scope: ['keyword.control', 'storage'], settings: { foreground: '#bb9af7' } },
      { scope: ['string'], settings: { foreground: '#9ece6a' } },
      { scope: ['entity.name.function', 'support.function'], settings: { foreground: '#7aa2f7' } },
      { scope: ['meta.object-literal.key', 'entity.other.attribute-name'], settings: { foreground: '#73daca' } },
      { scope: ['variable.parameter'], settings: { foreground: '#e0af68' } },
      { scope: ['constant.numeric'], settings: { foreground: '#ff9e64' } },
      { scope: ['punctuation'], settings: { foreground: '#a9b1d6' } },
      // Tokyo Night's comment colour is decorative-only: readable comments use muted.
      { scope: ['comment'], settings: { foreground: '#a9b1d6' } },
    ],
  } })
  return <figure className="window code-window" data-artefact="code-window"><figcaption className="window-chrome"><span className="code-tab">{title}</span><span className="example-label">Example run</span><CopyControl text={code} label={title} /></figcaption><div className="code-body" tabIndex={0} role="region" aria-label={title}><div className="line-numbers" aria-hidden="true">{code.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div><div dangerouslySetInnerHTML={{ __html: html }} /></div></figure>
}
