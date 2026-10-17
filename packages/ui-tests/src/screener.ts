import { z } from 'zod'

/**
 * Who the people are, and how to check it (docs/discovery/screener-research.md, Part 3; contract-to-study-research.md, item 3).
 * `users` is the sentence alone, from which the screener is drafted, or the same sentence under `are` with facts about the author's
 * customers. The developer fills facts; the tool fills method: bands, decoys, order and labels.
 */
export type UserFacts = {
  /** The people, in one plain sentence: what the string form of `users` says. */
  are: string
  /** The gate: one past-tense verb phrase about the category, never the product. */
  did?: string
  /** The recency window for `did`, such as '7 days' or '3 months'. Default '3 months'. */
  within?: string
  /** An optional frequency floor for `did`. */
  often?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  /** Roles to accept, asked as a broad category first and then the role. */
  role?: string[]
  /** Tools the person may use; a neutral tool and "None of these" are added. */
  uses?: string[]
  /** Exclusions; the standing exclusion of people who work in UX, design, marketing or market research is always added. */
  not?: string[]
  /** ISO country codes, a language and an age range: paid panel filters, never asked. */
  where?: string[]
  language?: string
  age?: { min?: number; max?: number }
}
/** `users`: the sentence alone, or the sentence under `are` with how to check it. */
export type Users = string | UserFacts
/** The facts the screener is derived from: everything in the `users` object but the sentence. */
export type Facts = Omit<UserFacts, 'are'>
export type Field = keyof Facts
export type Label = 'accept' | 'reject' | 'may-select'
/** One screener question with its labels, the field it came from (`purpose` for the three fit questions) and its rule. */
export type ScreenerQuestion = { field: Field | 'purpose'; question: string; kind: 'single' | 'multi'; options: { text: string; label: Label }[]; rule: string }
export type PanelFilter = { field: Field | 'previous'; filter: 'country' | 'language' | 'age' | 'previous-studies'; value: string; rule: string }
export type Screener = { source: 'authored' | 'inferred'; facts: Facts; inferred: Field[]; questions: ScreenerQuestion[]; filters: PanelFilter[] }
/** What a participant sees of one screener question: the words and the choices, never the labels, the field or the rule. */
export type ScreenerScreen = { question: string; kind: 'single' | 'multi'; options: string[] }

const windowPattern = /^(\d+) (day|week|month|year)s?$/
const facts = {
  did: z.string().trim().min(3).max(200).optional(),
  within: z.string().regex(windowPattern, "Use a window such as '7 days', '2 weeks', '3 months' or '1 year'.").optional(),
  often: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  role: z.array(z.string().trim().min(1)).min(1).max(8).optional(),
  uses: z.array(z.string().trim().min(1)).min(1).max(12).optional(),
  not: z.array(z.string().trim().min(1)).max(8).optional(),
  where: z.array(z.string().regex(/^[A-Z]{2}$/, 'Use ISO 3166 country codes such as US or GB.')).min(1).optional(),
  language: z.string().regex(/^[a-z]{2}$/, "Use an ISO 639-1 code such as 'en'.").optional(),
  age: z.object({ min: z.number().int().min(18).optional(), max: z.number().int().max(120).optional() }).refine(age => age.min === undefined || age.max === undefined || age.min <= age.max, 'age.min must not exceed age.max').optional(),
}
/** `users` as written: a sentence, or an object with the sentence under `are` and every fact optional. */
export const usersSchema = z.union([z.string().trim().min(1), z.object({ are: z.string().trim().min(1), ...facts }).strict()])

/** The sentence `users` names, whichever form it was written in. */
export function usersSentence(users: Users | undefined) { return typeof users === 'string' ? users : users?.are ?? '' }
/** The facts `users` carries; the string form carries none. */
export function usersFacts(users: Users): Facts { if (typeof users === 'string') return {}; const { are: _, ...rest } = users; return rest }

/** The source rule printed beside each derived question in the trace; never shown to a participant. */
export const screenRule = {
  did: 'recency gate: "When did you last…", bands from the window outward, accept inside `within` (NN/g; User Interviews; MeasuringU)',
  often: 'frequency floor: concrete bands, accept at or above `often` (Great Question; NN/g)',
  roleBroad: 'role asked broad first so the purpose cannot be read off the screener (NN/g funnel; UserTesting)',
  role: 'role narrowed second: listed roles accept among neutral roles, "None of these" rejects (UserTesting; User Interviews)',
  uses: 'tools as a multi-select among a neutral tool and "None of these"; any listed tool accepts (NN/g; Lyssna; Great Question)',
  not: 'exclusions mixed among neutral options, plus the standing exclusion of people who work in UX, design, marketing or market research (NN/g; EphMRA)',
  fitWhen: 'fit from the purpose: recency of the need (Lean Analytics problem-interview weights)',
  fitHow: 'fit from the purpose: how they do it today; their words name the incumbents (Lean Customer Development)',
  fitMatters: 'fit from the purpose: how much it matters (Lean Analytics problem-interview weights)',
  filter: 'paid panel filter, never asked (UserTesting; Prolific and Connect hold it)',
  previous: 'prior participation excluded by the paid panel, never asked (Lyssna; Prolific)',
}

const days = { day: 1, week: 7, month: 30, year: 365 } as const
function toDays(text: string) { const [, n, unit] = windowPattern.exec(text)!; return Number(n) * days[unit as keyof typeof days] }
const plain: Record<number, string> = { 1: 'Today', 7: 'In the past week', 14: 'In the past two weeks', 30: 'In the past month', 90: 'In the past three months', 180: 'In the past six months', 365: 'In the past year' }
const capital = (text: string) => text[0].toUpperCase() + text.slice(1)

/** Recency bands in plain words: the window, one broader band, then the rest of the year or longer, then "I haven't". The person picks the first that applies. */
export function recencyBands(within = '3 months') {
  const limit = toDays(within)
  const options: { text: string; label: Label }[] = [{ text: plain[limit] ?? `In the past ${within}`, label: 'accept' }]
  const next = [30, 90, 365].find(value => value > limit)
  if (next && next < 365) options.push({ text: plain[next], label: 'reject' }, { text: 'Earlier this year', label: 'reject' })
  else if (next) options.push({ text: plain[next], label: 'reject' }, { text: 'Longer ago', label: 'reject' })
  else options.push({ text: 'Longer ago', label: 'reject' })
  options.push({ text: "I haven't", label: 'reject' })
  return options
}
const frequencies = [['daily', 'Every day or almost every day'], ['weekly', 'At least once a week'], ['monthly', 'At least once a month'], ['yearly', 'A few times a year']] as const
const neutralRoles = ['Teacher', 'Nurse', 'Sales representative', 'Accountant', 'Electrician']
const neutralTools = ['Basecamp', 'ClickUp', 'Jira', 'Airtable']
const neutralDone = ['Managed a team of more than five', 'Taken a course on planning or project management']
const standingExclusion = 'Worked in UX, design, marketing or market research'

/** Derives the screener from the `users` facts and the `purpose`: questions in funnel order with their labels, field and rule, the three fit questions, then the paid panel filters. */
export function deriveScreener(found: Facts, purpose = '', source: Screener['source'] = 'authored', inferred: Field[] = []): Screener {
  const questions: ScreenerQuestion[] = []
  if (found.did) questions.push({ field: 'did', kind: 'single', question: `When did you last ${present(found.did)}?`, options: recencyBands(found.within), rule: screenRule.did })
  if (found.often && found.did) {
    const floor = frequencies.findIndex(([key]) => key === found.often)
    questions.push({ field: 'often', kind: 'single', question: `Over the past year, how often have you done this: ${found.did}?`, options: [...frequencies.map(([, text], index) => ({ text, label: (index <= floor ? 'accept' : 'reject') as Label })), { text: 'Less often, or never', label: 'reject' }], rule: screenRule.often })
  }
  if (found.role) {
    questions.push({ field: 'role', kind: 'single', question: 'Which of these best describes your work at the moment?', options: [{ text: 'I work for a company or organisation', label: 'accept' }, { text: 'I run my own business or work freelance', label: 'accept' }, { text: 'I am a student', label: 'may-select' }, { text: 'I am not working at the moment', label: 'reject' }], rule: screenRule.roleBroad })
    const roles = found.role.map(capital), others = neutralRoles.filter(role => !roles.some(own => own.toLowerCase() === role.toLowerCase())).slice(0, 3)
    questions.push({ field: 'role', kind: 'single', question: 'Which of these is closest to your role?', options: [...interleave(roles.map(text => ({ text, label: 'accept' as Label })), others.map(text => ({ text, label: 'reject' as Label }))), { text: 'None of these', label: 'reject' }], rule: screenRule.role })
  }
  if (found.uses) {
    // "to plan work" from "signed up for a tool to plan work with a team": what the tools are for, in the author's words.
    const purposeOfTools = /\bto ([a-z]+ [a-z]+)/i.exec(found.did ?? '')?.[1]
    const neutral = neutralTools.find(tool => !found.uses!.some(own => own.toLowerCase() === tool.toLowerCase()))!
    questions.push({ field: 'uses', kind: 'multi', question: `Which of these do you use${purposeOfTools ? ` to ${purposeOfTools}` : ''}? Pick all that apply.`, options: [...found.uses.map(text => ({ text, label: 'accept' as Label })), { text: neutral, label: 'may-select' }, { text: 'None of these', label: 'reject' }], rule: screenRule.uses })
  }
  const exclusions = [...(found.not ?? []).map(text => ({ text: capital(done(text)), label: 'reject' as Label })), { text: standingExclusion, label: 'reject' as Label }]
  questions.push({ field: 'not', kind: 'multi', question: 'Which of these have you done? Pick all that apply.', options: [...interleave(exclusions, neutralDone.map(text => ({ text, label: 'may-select' as Label }))), { text: 'None of these', label: 'accept' }], rule: screenRule.not })
  const need = purpose.replace(/,?\s+without\b.*$/i, '').trim()
  if (need) {
    const fit = (text: string) => ({ text, label: 'may-select' as Label })
    questions.push(
      { field: 'purpose', kind: 'single', question: `When did you last need to ${need}?`, options: ['This week', 'This month', 'Earlier this year', "I don't"].map(fit), rule: screenRule.fitWhen },
      { field: 'purpose', kind: 'single', question: 'How do you do it today?', options: ['A shared document or spreadsheet', 'A tool made for it', 'Chat and email', 'In my head'].map(fit), rule: screenRule.fitHow },
      { field: 'purpose', kind: 'single', question: 'How much does it matter to you to get this right?', options: ['A lot: it costs me time every week', 'Some', 'Not much'].map(fit), rule: screenRule.fitMatters },
    )
  }
  const filters: PanelFilter[] = []
  for (const country of found.where ?? []) filters.push({ field: 'where', filter: 'country', value: country, rule: screenRule.filter })
  if (found.language) filters.push({ field: 'language', filter: 'language', value: found.language, rule: screenRule.filter })
  if (found.age) filters.push({ field: 'age', filter: 'age', value: `${found.age.min ?? 18} to ${found.age.max ?? 'any'}`, rule: screenRule.filter })
  filters.push({ field: 'previous', filter: 'previous-studies', value: 'exclude people who took part in an earlier run of this context', rule: screenRule.previous })
  return { source, facts: found, inferred, questions, filters }
}
/** The screener as the participant sees it: one question per screen, the words and the choices only. */
export function screenerScreens(screener: Screener): ScreenerScreen[] { return screener.questions.map(({ question, kind, options }) => ({ question, kind, options: options.map(option => option.text) })) }
function interleave<T>(a: T[], b: T[]) { const out: T[] = []; for (let i = 0; i < Math.max(a.length, b.length); i++) { if (b[i]) out.push(b[i]); if (a[i]) out.push(a[i]) } return out }
/** "has used Weekboard" becomes "Used Weekboard"; "works in UX research" becomes "Worked in UX research". */
function done(text: string) {
  return text.replace(/^(has|have)\s+/i, '').replace(/^(is|works|uses|owns|lives|manages|runs)\b/i, verb => ({ is: 'been', works: 'worked', uses: 'used', owns: 'owned', lives: 'lived', manages: 'managed', runs: 'run' })[verb.toLowerCase() as 'is'] ?? verb)
}

const irregular: Record<string, string> = { ship: 'shipped', run: 'ran', buy: 'bought', pay: 'paid', build: 'built', write: 'wrote', make: 'made', have: 'had', do: 'did', go: 'went', get: 'got', set: 'set', send: 'sent', find: 'found', plan: 'planned', sell: 'sold', teach: 'taught', lead: 'led', drive: 'drove', take: 'took', give: 'gave', read: 'read', put: 'put', manage: 'managed' }
const pasts = new Set(Object.values(irregular))
const bases = Object.fromEntries(Object.entries(irregular).map(([base, past]) => [past, base]))
function pastTense(verb: string) {
  const word = verb.toLowerCase()
  if (word.endsWith('ed') || pasts.has(word)) return verb
  if (irregular[word]) return irregular[word]
  if (word.endsWith('e')) return `${verb}d`
  if (/[^aeiou]y$/.test(word)) return `${verb.slice(0, -1)}ied`
  if (word.endsWith('s')) return verb.slice(0, -1) + 'ed'
  return `${verb}ed`
}
/** "signed up for a tool" becomes "sign up for a tool", for "When did you last…?". A first word that is not a past tense is kept as written. */
export function present(did: string) {
  const [verb, ...rest] = did.trim().split(/\s+/), word = verb.toLowerCase()
  let base = bases[word]
  if (!base && word.endsWith('ied')) base = word.slice(0, -3) + 'y'
  else if (!base && /([bdgklmnprt])\1ed$/.test(word)) base = word.slice(0, -3)
  else if (!base && /(at|iz|us|os|ov|uc|ag|ur)ed$/.test(word)) base = word.slice(0, -1)
  else if (!base && word.endsWith('ed')) base = word.slice(0, -2)
  return [base ?? verb, ...rest].join(' ')
}
const periods: [RegExp, string][] = [[/\b(today)\b/i, '1 day'], [/\b(this|last|past) week\b/i, '7 days'], [/\b(this|last|past) month\b/i, '30 days'], [/\b(this|last|past) year\b/i, '1 year']]

/** Drafts the facts from the `users` sentence when only the sentence is written: the gate from the relative clause, the window from a time phrase. Every field it fills is marked inferred. */
export function inferFacts(users: string): { facts: Facts; inferred: Field[] } {
  const clause = /\bwho\s+(.+?)(?:\s+and\s+(?:want|wants|need|needs|have|has|are|would)\b.*)?$/i.exec(users)?.[1]
  const drafted: Facts = {}, inferred: Field[] = []
  let within = '3 months'
  if (clause) {
    let did = clause
    for (const [pattern, value] of periods) if (pattern.test(did)) { within = value; did = did.replace(pattern, '').replace(/\s+/g, ' ').trim(); break }
    const [verb, ...rest] = did.split(' ')
    drafted.did = [pastTense(verb), ...rest].join(' ')
    inferred.push('did')
  }
  drafted.within = within
  inferred.push('within')
  return { facts: drafted, inferred }
}

/** `users` as the TypeScript object to paste into `context()`: the sentence under `are`, then the facts; inferred fields are marked. */
export function usersSource(are: string, found: Facts, inferred: Field[] = []) {
  const value = (v: unknown): string => Array.isArray(v) ? `[${v.map(value).join(', ')}]` : typeof v === 'object' && v ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${value(x)}`).join(', ')} }` : typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : String(v)
  const lines = [`  are: ${value(are)},`, ...Object.entries(found).filter(([, v]) => v !== undefined).map(([key, v]) => `  ${key}: ${value(v)},${inferred.includes(key as Field) ? ' // inferred' : ''}`)]
  return `users: {\n${lines.join('\n')}\n},`
}
