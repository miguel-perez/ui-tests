import { z } from 'zod'

/**
 * Facts about the author's customers, from which the tool derives the screener (docs/discovery/screener-research.md, Part 3).
 * The developer fills facts; the tool fills method: bands, decoys, order and labels.
 */
export type Screen = {
  /** The gate: one past-tense verb phrase about the category, never the product. */
  did?: string
  /** The recency window for `did`, such as '7 days' or '3 months'. Default '3 months'. */
  within?: string
  /** An optional frequency floor for `did`. */
  often?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Roles to accept, asked as a broad category first and then the role. */
  role?: string[]
  /** Tools the person may use; one decoy and "None of the above" are added. */
  uses?: string[]
  /** Exclusions; the standing exclusion of people who work in UX, marketing or research is always added. */
  not?: string[]
  /** ISO country codes, a language and an age range: panel filters, never asked. */
  where?: string[]
  language?: string
  age?: { min?: number; max?: number }
}
export type Field = keyof Screen
export type Label = 'accept' | 'reject' | 'may-select'
export type ScreenerQuestion = { field: Field; question: string; kind: 'single' | 'multi'; options: { text: string; label: Label }[]; rule: string }
export type PanelFilter = { field: Field | 'previous'; filter: 'country' | 'language' | 'age' | 'previous-studies'; value: string; rule: string }
export type Screener = { source: 'authored' | 'inferred'; screen: Screen; inferred: Field[]; questions: ScreenerQuestion[]; filters: PanelFilter[] }

const windowPattern = /^(\d+) (day|week|month|year)s?$/
export const screenSchema = z.object({
  did: z.string().trim().min(3).max(200).optional(),
  within: z.string().regex(windowPattern, "Use a window such as '7 days', '2 weeks', '3 months' or '1 year'.").optional(),
  often: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  role: z.array(z.string().trim().min(1)).min(1).max(8).optional(),
  uses: z.array(z.string().trim().min(1)).min(1).max(12).optional(),
  not: z.array(z.string().trim().min(1)).max(8).optional(),
  where: z.array(z.string().regex(/^[A-Z]{2}$/, 'Use ISO 3166 country codes such as US or GB.')).min(1).optional(),
  language: z.string().regex(/^[a-z]{2}$/, "Use an ISO 639-1 code such as 'en'.").optional(),
  age: z.object({ min: z.number().int().min(18).optional(), max: z.number().int().max(120).optional() }).refine(age => age.min === undefined || age.max === undefined || age.min <= age.max, 'age.min must not exceed age.max').optional(),
}).strict()

/** The source rule printed beside each derived question. */
export const screenRule = {
  did: 'recency gate: "When was the last time you…", non-overlapping bands, accept inside `within` (NN/g; User Interviews; MeasuringU)',
  often: 'frequency floor: concrete bands, accept at or above `often` (Great Question; NN/g)',
  roleBroad: 'role asked broad first so the purpose cannot be read off the screener (NN/g funnel; UserTesting)',
  role: 'role narrowed second: listed roles accept among neutral roles, "None of these" rejects (UserTesting; User Interviews)',
  uses: 'tools as a multi-select with one decoy and "None of the above" (NN/g; Lyssna; Great Question)',
  not: 'exclusions mixed among neutral options, plus the standing exclusion of people who work in UX, marketing or research (NN/g; EphMRA)',
  filter: 'panel filter, never asked (UserTesting; Prolific and Connect hold it)',
  previous: 'prior participation excluded by the panel, never asked (Lyssna; Prolific)',
}

const days = { day: 1, week: 7, month: 30, year: 365 } as const
function toDays(text: string) { const [, n, unit] = windowPattern.exec(text)!; return Number(n) * days[unit as keyof typeof days] }
function span(value: number) {
  if (value % 365 === 0) return `${value / 365} year${value === 365 ? '' : 's'}`
  if (value % 30 === 0) return `${value / 30} month${value === 30 ? '' : 's'}`
  if (value % 7 === 0) return `${value / 7} week${value === 7 ? '' : 's'}`
  return `${value} day${value === 1 ? '' : 's'}`
}
const capital = (text: string) => text[0].toUpperCase() + text.slice(1)

/** Recency bands that never overlap: inside the window, then the next steps of a fixed ladder, then "never". */
export function recencyBands(within = '3 months') {
  const limit = toDays(within)
  const ladder = [7, 30, 90, 180, 365].filter(value => value > limit).slice(0, 2)
  // The first band keeps the author's own wording of the window.
  const options: { text: string; label: Label }[] = [{ text: `Within the last ${within}`, label: 'accept' }]
  let label = within
  for (const to of ladder) { options.push({ text: `More than ${label} ago, up to ${span(to)} ago`, label: 'reject' }); label = span(to) }
  options.push({ text: `More than ${label} ago`, label: 'reject' }, { text: 'Never', label: 'reject' })
  return options
}
const frequencies = [['daily', 'Every day or almost every day'], ['weekly', 'At least once a week'], ['monthly', 'At least once a month'], ['yearly', 'A few times a year']] as const
const neutralRoles = ['Teacher', 'Nurse', 'Sales representative', 'Accountant', 'Electrician']
const neutralFacts = ['I share a calendar with someone', 'I have taken part in an online survey this year', 'I use a laptop for work']
const standingExclusion = 'I work in UX, design, marketing or market research'
const decoy = 'Plandrift'

/** Derives the screener from a `screen`: questions in funnel order with their labels, field and rule, then the panel filters. */
export function deriveScreener(screen: Screen, source: Screener['source'] = 'authored', inferred: Field[] = []): Screener {
  const questions: ScreenerQuestion[] = []
  if (screen.did) questions.push({ field: 'did', kind: 'single', question: `When was the last time you ${screen.did}?`, options: recencyBands(screen.within), rule: screenRule.did })
  if (screen.often && screen.did) {
    const floor = frequencies.findIndex(([key]) => key === screen.often)
    questions.push({ field: 'often', kind: 'single', question: `Over the past year, how often have you done this: ${screen.did}?`, options: [...frequencies.map(([, text], index) => ({ text, label: (index <= floor ? 'accept' : 'reject') as Label })), { text: 'Less often, or never', label: 'reject' }], rule: screenRule.often })
  }
  if (screen.role) {
    questions.push({ field: 'role', kind: 'single', question: 'Which of these best describes your work at the moment?', options: [{ text: 'I work for a company or organisation', label: 'accept' }, { text: 'I run my own business or work freelance', label: 'accept' }, { text: 'I am a student', label: 'may-select' }, { text: 'I am not working at the moment', label: 'reject' }], rule: screenRule.roleBroad })
    const roles = screen.role.map(capital), others = neutralRoles.filter(role => !roles.some(own => own.toLowerCase() === role.toLowerCase())).slice(0, 3)
    questions.push({ field: 'role', kind: 'single', question: 'Which of these is closest to your role?', options: [...interleave(roles.map(text => ({ text, label: 'accept' as Label })), others.map(text => ({ text, label: 'reject' as Label }))), { text: 'None of these', label: 'reject' }], rule: screenRule.role })
  }
  if (screen.uses) questions.push({ field: 'uses', kind: 'multi', question: `Which of these tools have you used in the last ${screen.within ?? '3 months'}?`, options: [...screen.uses.map(text => ({ text, label: 'may-select' as Label })), { text: decoy, label: 'reject' }, { text: 'None of the above', label: 'reject' }], rule: screenRule.uses })
  const exclusions = [...(screen.not ?? []).map(text => ({ text: capital(firstPerson(text)), label: 'reject' as Label })), { text: standingExclusion, label: 'reject' as Label }]
  questions.push({ field: 'not', kind: 'multi', question: 'Do any of these apply to you?', options: [...interleave(exclusions, neutralFacts.map(text => ({ text, label: 'may-select' as Label }))), { text: 'None of these', label: 'accept' }], rule: screenRule.not })
  const filters: PanelFilter[] = []
  for (const country of screen.where ?? []) filters.push({ field: 'where', filter: 'country', value: country, rule: screenRule.filter })
  if (screen.language) filters.push({ field: 'language', filter: 'language', value: screen.language, rule: screenRule.filter })
  if (screen.age) filters.push({ field: 'age', filter: 'age', value: `${screen.age.min ?? 18} to ${screen.age.max ?? 'any'}`, rule: screenRule.filter })
  filters.push({ field: 'previous', filter: 'previous-studies', value: 'exclude people who took part in an earlier run of this context', rule: screenRule.previous })
  return { source, screen, inferred, questions, filters }
}
function interleave<T>(a: T[], b: T[]) { const out: T[] = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (b[i]) out.push(b[i]); if (a[i]) out.push(a[i]) } return out }
/** "has used Weekboard" becomes "I have used Weekboard"; "works in UX research" becomes "I work in UX research". */
function firstPerson(text: string) {
  return text.replace(/^(has|is|works|uses|owns|lives)\b/i, verb => ({ has: 'I have', is: 'I am', works: 'I work', uses: 'I use', owns: 'I own', lives: 'I live' })[verb.toLowerCase() as 'has'] ?? verb)
}

const irregular: Record<string, string> = { ship: 'shipped', run: 'ran', buy: 'bought', pay: 'paid', build: 'built', write: 'wrote', make: 'made', have: 'had', do: 'did', go: 'went', get: 'got', set: 'set', send: 'sent', find: 'found', plan: 'planned', sell: 'sold', teach: 'taught', lead: 'led', drive: 'drove', take: 'took', give: 'gave', read: 'read', put: 'put', manage: 'managed' }
const pasts = new Set(Object.values(irregular))
function pastTense(verb: string) {
  const word = verb.toLowerCase()
  if (word.endsWith('ed') || pasts.has(word)) return verb
  if (irregular[word]) return irregular[word]
  if (word.endsWith('e')) return `${verb}d`
  if (/[^aeiou]y$/.test(word)) return `${verb.slice(0, -1)}ied`
  if (word.endsWith('s')) return verb.slice(0, -1) + 'ed'
  return `${verb}ed`
}
const periods: [RegExp, string][] = [[/\b(today)\b/i, '1 day'], [/\b(this|last|past) week\b/i, '7 days'], [/\b(this|last|past) month\b/i, '30 days'], [/\b(this|last|past) year\b/i, '1 year']]

/** Drafts a `screen` from the `users` sentence when none is written: the gate from the relative clause, the window from a time phrase. Every field it fills is marked inferred. */
export function inferScreen(users: string): { screen: Screen; inferred: Field[] } {
  const clause = /\bwho\s+(.+?)(?:\s+and\s+(?:want|wants|need|needs|have|has|are|would)\b.*)?$/i.exec(users)?.[1]
  const screen: Screen = {}, inferred: Field[] = []
  let within = '3 months'
  if (clause) {
    let did = clause
    for (const [pattern, value] of periods) if (pattern.test(did)) { within = value; did = did.replace(pattern, '').replace(/\s+/g, ' ').trim(); break }
    const [verb, ...rest] = did.split(' ')
    screen.did = [pastTense(verb), ...rest].join(' ')
    inferred.push('did')
  }
  screen.within = within
  inferred.push('within')
  return { screen, inferred }
}

/** The `screen` block as TypeScript, ready to paste into `context()`; inferred fields are marked. */
export function screenSource(screen: Screen, inferred: Field[] = []) {
  const value = (v: unknown): string => Array.isArray(v) ? `[${v.map(value).join(', ')}]` : typeof v === 'object' && v ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${value(x)}`).join(', ')} }` : typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v)
  const lines = Object.entries(screen).filter(([, v]) => v !== undefined).map(([key, v]) => `  ${key}: ${value(v)},${inferred.includes(key as Field) ? ' // inferred' : ''}`)
  return `screen: {\n${lines.join('\n')}\n},`
}
