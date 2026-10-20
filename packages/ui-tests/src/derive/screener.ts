import { createHash } from 'node:crypto'
import type { Users } from '../types.ts'
import { FIT_IDS, MATTERS, NEED_BANDS, type Fit } from './fit.ts'
import { inferUsers } from './infer-users.ts'

export type OptionRule = 'accept' | 'reject' | 'may-select'
export type ScreenerOption = { label: string; rule: OptionRule }
/**
 * One screener question. `rule` says in words how it is read; `field` is the part of `users`, the purpose or the environment it comes
 * from. Neither, nor any option's rule, ever reaches the participant. `open` marks a free-text question (no options).
 */
export type ScreenerQuestion = { id: string; text: string; options: ScreenerOption[]; multi: boolean; field: string; rule: string; inferred?: boolean; open?: boolean }

export const NONE_OF_THESE = 'None of these'
/** The standing exclusion: people who make a living from testing and judging products do not stand in for the people the study is about. */
export const STANDING_EXCLUSION = 'Work in UX, design, marketing or market research'

const DAYS = { day: 1, week: 7, month: 30, year: 365 } as const
const FREQUENCY = ['Every day', 'Every week', 'Every month', 'Less often', 'Never']
const BROAD_AREAS = ['Software or engineering', 'Product or project management', 'Design or research', 'Sales or marketing', 'Operations or administration', 'Education or health']
const NARROW_ROLES = ['Account executive', 'Office manager', 'Data analyst', 'Teacher', 'Nurse', 'Accountant', 'Recruiter']
const OTHER_TOOLS = ['Jira', 'Monday.com', 'ClickUp', 'Basecamp', 'Smartsheet']
const NEUTRAL = ['Cook most days', 'Own a bicycle', 'Speak more than one language', 'Grow plants at home', 'Play a musical instrument']
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Another browser']
const DEVICES = ['Laptop or desktop', 'Phone', 'Tablet']
const ASSISTIVE = ['Screen reader', 'Screen magnifier', 'Voice control', 'Switch or alternative keyboard', 'Another kind']

const IRREGULAR: Record<string, string> = { ran: 'run', built: 'build', wrote: 'write', made: 'make', sent: 'send', bought: 'buy', paid: 'pay', led: 'lead', found: 'find', got: 'get', took: 'take', set: 'set', put: 'put', had: 'have', did: 'do', went: 'go', chose: 'choose', gave: 'give', began: 'begin', saw: 'see', met: 'meet', kept: 'keep', left: 'leave', lost: 'lose', sold: 'sell', spent: 'spend', told: 'tell', thought: 'think', wore: 'wear', won: 'win', drew: 'draw', held: 'hold', read: 'read', knew: 'know', came: 'come', ate: 'eat', taught: 'teach' }
/** Verbs whose base ends in "e", for the ones where taking off "ed" leaves a stem that could be either. */
const E_VERBS = new Set('update create delete schedule approve receive move use manage share save invite hire file make close compare complete configure decide describe determine enable explore generate handle improve include increase involve like love measure name notice organize organise participate place prepare produce provide purchase raise rate reduce remove rename replace require resolve review revise store type upgrade upload value vote merge archive issue pause practice promote release select serve settle browse cause compose define derive finalize ignore observe operate quote refine reserve rotate scale score subscribe unsubscribe wake waste change arrange engage exchange manage encourage translate navigate integrate communicate coordinate calculate evaluate investigate locate relate separate state '.trim().split(' '))
const NOT_PAST = new Set(['need', 'feed', 'speed', 'embed', 'bleed', 'proceed', 'succeed', 'exceed', 'seed', 'breed', 'shed', 'bed', 'red'])

/**
 * "used a shared tool" to "use a shared tool": the question asks "When did you last …", so the first word takes its base form. Regular
 * past tenses lose "ed", "ied" becomes "y", a doubled final consonant from the past tense ("shipped") is undone, and a base that ends in
 * "e" ("updated", "received", "scheduled") gets it back. Text that is not past tense is left as written.
 */
export function baseForm(did: string): string {
  const [first = '', ...rest] = did.trim().split(/\s+/)
  const lower = first.toLowerCase()
  const join = (base: string) => [base, ...rest].join(' ')
  if (IRREGULAR[lower]) return join(IRREGULAR[lower]!)
  if (!lower.endsWith('ed') || lower.length < 4 || NOT_PAST.has(lower)) return first ? did.trim() : did
  const stem = lower.slice(0, -2)
  if (lower.endsWith('ied') && stem.length > 1) return join(`${stem.slice(0, -1)}y`)
  if (E_VERBS.has(`${stem}e`)) return join(`${stem}e`)
  if (/([^aeiou])\1$/.test(stem) && !/(dd|ll|ss|ff|zz|ee|oo)$/.test(stem)) return join(stem.slice(0, -1))
  // Unlisted verbs: a stem ending in v or z, in a consonant then "at", or in "u" has lost an "e".
  if (/(v|z|u|[^aeiou]at)$/.test(stem)) return join(`${stem}e`)
  return join(stem)
}

function pick<T>(items: readonly T[], count: number, seed: string): T[] {
  const hash = createHash('sha256').update(seed).digest()
  return items.map((item, i) => ({ item, key: hash[i % hash.length]! * 31 + i * 7 })).sort((a, b) => a.key - b.key).slice(0, count).map(x => x.item)
}
function shuffled<T>(items: T[], seed: string): T[] {
  const hash = createHash('sha256').update(seed).digest()
  return items.map((item, i) => ({ item, key: hash[i % hash.length]! * 257 + i })).sort((a, b) => a.key - b.key).map(x => x.item)
}

/** The count and unit of a `within` such as "3 months", or undefined when it is absent or does not parse. */
function windowOf(within?: string): { count: number; unit: keyof typeof DAYS; days: number } | undefined {
  const match = /^(\d+)\s*(day|week|month|year)s?$/i.exec(within?.trim() ?? '')
  if (!match) return undefined
  const unit = match[2]!.toLowerCase() as keyof typeof DAYS
  return { count: Number(match[1]), unit, days: Number(match[1]) * DAYS[unit] }
}

/** The recency bands for a window: the fixed bands narrower than it, the window itself, then "Longer ago" and "I haven't", all rejecting. */
function recencyBands(within?: string): ScreenerOption[] {
  const window = windowOf(within)
  if (!window) return [option('In the past week', 'accept'), option('In the past month', 'accept'), option('Earlier this year', 'accept'), option("I haven't", 'reject')]
  const fixed = [{ days: 7, label: 'In the past week' }, { days: 30, label: 'In the past month' }, { days: 365, label: 'In the past year' }]
  const label = window.count === 1 ? `In the past ${window.unit}` : `In the past ${window.count} ${window.unit}s`
  const bands = [...fixed.filter(f => f.days < window.days), fixed.find(f => f.days === window.days) ?? { days: window.days, label }]
  return [...bands.map(b => option(b.label, 'accept')), option('Longer ago', 'reject'), option("I haven't", 'reject')]
}

const option = (label: string, rule: OptionRule): ScreenerOption => ({ label, rule })
const withNone = (options: ScreenerOption[], rule: OptionRule): ScreenerOption[] => [...options, option(NONE_OF_THESE, rule)]

/**
 * The screener a study asks, in order: what `users` says (recency from `did` and `within`, `often`, `role` broad then narrow, `uses`,
 * `not` with the standing exclusion), then the fit questions from the purpose, then the environment. Each question's options carry the
 * rule the collector applies; `users` as a plain sentence is read with `inferUsers` and its questions are marked `inferred`.
 */
export function deriveScreener(users: Users, purpose: string): ScreenerQuestion[] {
  const read = typeof users === 'string' ? inferUsers(users) : { users, inferred: [] as string[] }
  const fields = read.users
  const seed = `${fields.are}:${purpose}`
  const questions: ScreenerQuestion[] = []

  if (fields.did) {
    const window = windowOf(fields.within)
    const options = recencyBands(fields.within)
    questions.push({
      id: 'screener.recency', text: `When did you last ${baseForm(fields.did)}?`, options, multi: false, field: 'did',
      rule: window === undefined ? 'accept anything but "I haven\'t"' : `accept the bands inside ${fields.within}`, ...(read.inferred.includes('did') && { inferred: true }),
    })
  }
  if (fields.often && fields.did) {
    const text = fields.often.toLowerCase()
    const limit = /day|daily/.test(text) ? 0 : /week/.test(text) ? 1 : /month/.test(text) ? 2 : 3
    questions.push({
      id: 'screener.often', text: `How often do you ${baseForm(fields.did)}?`, field: 'often', multi: false,
      options: FREQUENCY.map((label, i) => option(label, i <= limit ? 'accept' : 'reject')), rule: `accept ${FREQUENCY[limit]!.toLowerCase()} or more often`,
    })
  }
  const roles = typeof fields.role === 'string' ? [fields.role] : fields.role ?? []
  if (roles.length) {
    questions.push({
      id: 'screener.area', text: 'Which area do you mostly work in?', field: 'role', multi: false,
      options: withNone(shuffled(BROAD_AREAS, `${seed}:area`).map(label => option(label, 'may-select')), 'reject'), rule: 'any area; the narrow question decides',
    })
    const narrow = pick(NARROW_ROLES.filter(r => !roles.some(own => own.toLowerCase() === r.toLowerCase())), 3, `${seed}:role`).map(label => option(label, 'reject'))
    questions.push({
      id: 'screener.role', text: 'Which of these is closest to your role?', field: 'role', multi: false,
      options: withNone(shuffled([...roles.map(label => option(label, 'accept')), ...narrow], `${seed}:narrow`), 'reject'), rule: `accept ${roles.map(r => `"${r}"`).join(' or ')}`,
    })
  }
  if (fields.uses?.length) {
    const decoy = pick(OTHER_TOOLS.filter(t => !fields.uses!.some(u => u.toLowerCase() === t.toLowerCase())), 1, `${seed}:uses`)[0]
    questions.push({
      id: 'screener.uses', text: 'Which of these do you use?', field: 'uses', multi: true,
      options: withNone(shuffled([...fields.uses.map(label => option(label, 'accept')), ...(decoy ? [option(decoy, 'may-select')] : [])], `${seed}:uses`), 'reject'),
      rule: 'accept at least one of the listed; the decoy and the rest are free to pick',
    })
  }
  // Always asked: the standing exclusion applies to every study, and the author's own exclusions sit among neutral options.
  const excluded = [...(fields.not ?? []), STANDING_EXCLUSION]
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
  questions.push({
    id: 'screener.not', text: 'Which of these apply to you?', field: 'not', multi: true,
    options: withNone(shuffled([...excluded.map(label => option(capital(label), 'reject')), ...pick(NEUTRAL, 2, `${seed}:not`).map(label => option(label, 'may-select'))], `${seed}:not`), 'may-select'),
    rule: 'reject any of the exclusions; the rest are free to pick',
  })

  const purposeText = purpose.trim().replace(/[.!?]+$/, '')
  if (purposeText) {
    questions.push(
      { id: FIT_IDS.need, text: `When did you last need to ${purposeText}?`, field: 'purpose', multi: false, options: NEED_BANDS.map(label => option(label, 'may-select')), rule: 'scored 3 to 0 by recency; filters nobody' },
      { id: FIT_IDS.today, text: 'How do you do it today?', field: 'purpose', multi: false, open: true, options: [], rule: 'scored 1 when they already do something; filters nobody' },
      { id: FIT_IDS.matters, text: 'How much does it matter to you to get this right?', field: 'purpose', multi: false, options: MATTERS.map(label => option(label, 'may-select')), rule: 'scored 0 to 3; filters nobody' },
    )
  }

  questions.push(
    { id: 'screener.browser', text: 'Which browser do you usually use?', field: 'environment', multi: false, options: BROWSERS.map(label => option(label, 'may-select')), rule: 'recorded with the attempt; filters nobody' },
    { id: 'screener.device', text: 'Which device do you usually use?', field: 'environment', multi: false, options: DEVICES.map(label => option(label, 'may-select')), rule: 'recorded with the attempt; filters nobody' },
    { id: 'screener.assistive', text: 'Do you use any assistive technology?', field: 'environment', multi: true, options: withNone(ASSISTIVE.map(label => option(label, 'may-select')), 'may-select'), rule: 'recorded with the attempt; filters nobody' },
  )
  return questions
}

/** What the screener made of a person: whether they match the users, the rules (in words) they fell outside, and how well they fit the purpose. */
export type ScreenerResult = { matches: boolean; outside: string[]; fit: Fit }

/**
 * Reads the answers given so far against the questions. A question is failed when a rejecting option was picked, or when it needs one of
 * its accepting options and was answered without any. Questions not answered yet, and answers to unknown ids, are ignored. `outside`
 * names the rule of each failed question.
 */
export function screenReport(answers: Record<string, unknown>, questions: ScreenerQuestion[]): { result: 'accept' | 'reject'; outside: string[] } {
  const outside: string[] = []
  for (const question of questions) {
    if (question.open) continue
    const given = answers[question.id]
    const chosen = Array.isArray(given) ? given : typeof given === 'string' ? [given] : []
    if (!chosen.length) continue
    const rules = chosen.map(label => question.options.find(o => o.label === label)?.rule)
    if (rules.includes('reject') || (question.options.some(o => o.rule === 'accept') && !rules.includes('accept'))) outside.push(question.rule)
  }
  return { result: outside.length ? 'reject' : 'accept', outside }
}

/** Whether the answers match the users. Used for sources that filter (R3); on a link it only labels the attempt. */
export function screen(answers: Record<string, unknown>, questions: ScreenerQuestion[]): 'accept' | 'reject' {
  return screenReport(answers, questions).result
}
