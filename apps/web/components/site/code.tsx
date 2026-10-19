import { role, segments } from '../../lib/colours'
import { highlight } from '../../lib/highlight'

/**
 * Inline code, highlighted in the code windows' roles (issue #18, item 10): call expressions through the same Shiki theme
 * (function names blue, strings green, punctuation cyan), shell commands as the CLI colours them, file names green as the
 * terminal prints created files, and a bare field name in the object-key teal it has in the file.
 */
export async function Code({ children }: { children: string }) {
  if (/^(npx|npm) /.test(children)) return <code className="code-inline">{segments(`$ ${children}`).slice(2).map((part, i) => <span key={i} style={{ color: role(part.color) }}>{part.text}</span>)}</code>
  if (/[('{]/.test(children)) return <code className="code-inline" dangerouslySetInnerHTML={{ __html: await highlight(children, 'typescript', 'inline') }} />
  return <code className="code-inline" style={{ color: /[/.]/.test(children) ? 'var(--green)' : 'var(--teal)' }}>{children}</code>
}

/** Prose with `backticked` fragments rendered as highlighted inline code. */
export function Prose({ text }: { text: string }) {
  return <>{text.split('`').map((part, i) => i % 2 ? <Code key={i}>{part}</Code> : part)}</>
}
