/**
 * The open impression answer, read against the purpose (contract-to-study-research.md, the fourth contradiction; impression-research.md).
 * The person answers "What was that page for?" in their own words and never sees the purpose. A model proposes the code when one is
 * configured; without one, this word-overlap rule does. Either way the code is labelled with how it was made, kept beside the words,
 * and a reviewer can change it in the trace.
 */
export const codingRule = 'the purpose\'s words without its "without…" clause, against the answer\'s words; named when two match (one for a one-word purpose); proposed, labelled and changeable in the trace'
const stop = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'for', 'on', 'in', 'with', 'it', 'is', 'was', 'that', 'this', 'your', 'you', 'my', 'i', 'me', 'we', 'our', 'their', 'they', 'what', 'page', 'site', 'thing', 'something', 'some', 'can', 'be', 'by', 'at', 'as', 'about', 'like', 'seems', 'looks', 'think'])
const stem = (word: string) => word.replace(/(ings?|ed|es|s)$/, '').replace(/(.)\1$/, '$1')
const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z]+/).filter(word => word.length > 1 && !stop.has(word)).map(stem))
export type ImpressionCode = { code: 'named the purpose' | 'did not name it' | 'no answer'; matched: string[]; proposedBy: string; rule: string }
/** How an answer reads against the purpose: named it, did not, or no answer, with the words that matched. */
export function codeImpression(answer: string | undefined, purpose: string): ImpressionCode {
  const need = words(purpose.replace(/,?\s+without\b.*$/i, ''))
  const said = words(answer ?? '')
  const matched = [...need].filter(word => said.has(word))
  const code = !answer?.trim() ? 'no answer' : matched.length >= Math.min(2, need.size) ? 'named the purpose' : 'did not name it'
  return { code, matched, proposedBy: 'word overlap (no model configured)', rule: codingRule }
}

/** The first click as the player read it: the element, a link's destination, where the page went, and the point on the page (0 to 1). */
export type FirstClick = { target: string; href?: string; after?: string; x: number; y: number }
export const firstClickRule = 'on your path when the page went to, or the link points at, a happyPath page after the start; off your path when it went or points elsewhere; couldn\'t tell when nothing moved, the page was not the author\'s, or there is no happyPath; changeable in the trace'
export type FirstClickCode = { code: 'on your path' | 'off your path' | "couldn't tell" | 'no click'; rule: string }
/** Where the first click led against the happy path (PRD 02: "how many of n clicked on the happy path"). */
export function codeFirstClick(click: FirstClick | null | undefined, happyPath: string[] = [], start = '/'): FirstClickCode {
  if (!click) return { code: 'no click', rule: firstClickRule }
  const path = (url?: string) => { if (!url) return undefined; try { return new URL(url, 'http://localhost').pathname.replace(/\/$/, '') || '/' } catch { return undefined } }
  const ahead = happyPath.map(page => page.replace(/\/$/, '') || '/').filter(page => page !== (start.replace(/\/$/, '') || '/'))
  const landed = path(click.after), linked = path(click.href)
  const moved = landed && landed !== (start.replace(/\/$/, '') || '/') ? landed : undefined
  const where = moved ?? linked
  if (!ahead.length || !where) return { code: "couldn't tell", rule: firstClickRule }
  return { code: ahead.includes(where) ? 'on your path' : 'off your path', rule: firstClickRule }
}
