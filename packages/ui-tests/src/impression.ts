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
