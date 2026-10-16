import { Code, Prose } from './code'

/**
 * A Caption sits beside an artefact of 8 columns or fewer, in the remaining columns (`side`), or under a wider one,
 * left-aligned to its edge in one or two lines. Its text never takes a column wider than it needs.
 */
export function Caption({ title, text, code, side = false, id }: { title?: string; text?: string; code?: string; side?: boolean; id?: string }) {
  return <div className={`caption ${side ? 'caption-side' : 'caption-under'}`} id={id}>
    {title && <p className="caption-title">{title}</p>}
    {code && <p className="caption-code"><Code>{code}</Code></p>}
    {text && <p><Prose text={text} /></p>}
  </div>
}
