import type { Users } from '../types.ts'

type Fields = Exclude<Users, string>

const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12 }
const timePhrase = /\s*\b(?:in|within|over|during|for)\s+the\s+(?:last|past)\s+(?:(\d+|a|an|one|two|three|four|five|six|twelve)\s+)?(day|week|month|year)s?\b|\s*\b(?:this)\s+(week|month|year)\b/i
const clause = /\b(?:who|that|which)\s+(.+)$/i

/**
 * Reads a `users` sentence the way the screener would: a relative clause ("who shipped a UI") is what they did, and a time phrase
 * ("in the last month") is how recently. `inferred` names the fields that were read from the sentence; empty when it holds no behaviour.
 * `are` stays the whole sentence so the study's id and wording do not change when the draft is pasted in.
 */
export function inferUsers(sentence: string): { users: Fields & { are: string }; inferred: string[] } {
  const are = sentence.trim()
  let rest = are.replace(/[.!?]+$/, '')
  let within: string | undefined
  const time = timePhrase.exec(rest)
  if (time) {
    const unit = (time[2] ?? time[3])!.toLowerCase()
    const count = time[1] ? (NUMBERS[time[1].toLowerCase()] ?? Number(time[1])) : 1
    within = `${count} ${unit}${count === 1 ? '' : 's'}`
    rest = (rest.slice(0, time.index) + rest.slice(time.index + time[0].length)).trim()
  }
  const did = clause.exec(rest)?.[1]?.trim().replace(/[,;]+$/, '')
  if (!did) return { users: { are }, inferred: [] }
  return { users: { are, did, ...(within && { within }) }, inferred: within ? ['did', 'within'] : ['did'] }
}

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const list = (items: string[]) => `[${items.map(quote).join(', ')}]`

/** The object form of `users` as TypeScript to paste into the study file. */
export function printUsersDraft(users: Fields): string {
  const parts: string[] = users.are !== undefined ? [`are: ${quote(users.are)}`] : []
  if (users.did !== undefined) parts.push(`did: ${quote(users.did)}`)
  if (users.within !== undefined) parts.push(`within: ${quote(users.within)}`)
  if (users.often !== undefined) parts.push(`often: ${quote(users.often)}`)
  if (users.role !== undefined) parts.push(`role: ${Array.isArray(users.role) ? list(users.role) : `{ ${Object.entries(users.role).map(([r, n]) => `${quote(r)}: ${n}`).join(', ')} }`}`)
  if (users.uses) parts.push(`uses: ${list(users.uses)}`)
  if (users.not) parts.push(`not: ${list(users.not)}`)
  return `users: { ${parts.join(', ')} }`
}
