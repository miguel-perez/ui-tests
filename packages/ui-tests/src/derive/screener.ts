import { createHash } from 'node:crypto'
import type { Users } from '../types.ts'
import { FIT_IDS, MATTERS, NEED_BANDS } from './fit.ts'
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
const BAND_DAYS = [7, 30, 365]
const FREQUENCY = ['Every day', 'Every week', 'Every month', 'Less often', 'Never']
const BROAD_AREAS = ['Software or engineering', 'Product or project management', 'Design or research', 'Sales or marketing', 'Operations or administration', 'Education or health']
const NARROW_ROLES = ['Account executive', 'Office manager', 'Data analyst', 'Teacher', 'Nurse', 'Accountant', 'Recruiter']
const OTHER_TOOLS = ['Jira', 'Monday.com', 'ClickUp', 'Basecamp', 'Smartsheet']
const NEUTRAL = ['Cook most days', 'Own a bicycle', 'Speak more than one language', 'Grow plants at home', 'Play a musical instrument']
const BROWSERS = ['Chrome', 'Safari', 'Firefox', 'Edge', 'Another browser']
const DEVICES = ['Laptop or desktop', 'Phone', 'Tablet']
const ASSISTIVE = ['Screen reader', 'Screen magnifier', 'Voice control', 'Switch or alternative keyboard', 'Another kind']

const IRREGULAR: Record<string, string> = { shipped: 'ship', ran: 'run', built: 'build', wrote: 'write', made: 'make', sent: 'send', bought: 'buy', paid: 'pay', led: 'lead', found: 'find', got: 'get', took: 'take', set: 'set', put: 'put', booked: 'book', had: 'have', did: 'do', went: 'go', used: 'use', managed: 'manage', created: 'create', hired: 'hire', filed: 'file', saved: 'save', shared: 'share', invited: 'invite', tried: 'try', planned: 'plan', stopped: 'stop', submitted: 'submit' }
const NOT_PAST = new Set(['need', 'feed', 'speed', 'embed', 'bleed', 'proceed', 'succeed', 'exceed', 'seed', 'breed', 'shed', 'bed', 'red'])

/** "used a shared tool" to "use a shared tool": the question asks "When did you last …", so the first word takes its base form. */
function baseForm(did: string): string {
  const [first = '', ...rest] = did.trim().split(/\s+/)
  const lower = first.toLowerCase()
  let base = first
  if (IRREGULAR[lower]) base = IRREGULAR[lower]
  else if (lower.endsWith('ed') && lower.length > 4 && !NOT_PAST.has(lower)) {
    const stem = lower.slice(0, -2)
    base = stem.endsWith('i') ? `${stem.slice(0, -1)}y` : /(.)\1$/.test(stem) && !/(ll|ss|ff|zz)$/.test(stem) ? stem.slice(0, -1) : stem
  }
  return [base, ...rest].join(' ')
}

function pick<T>(items: readonly T[], count: number, seed: string): T[] {
  const hash = createHash('sha256').update(seed).digest()
  return items.map((item, i) => ({ item, key: hash[i % hash.length]! * 31 + i * 7 })).sort((a, b) => a.key - b.key).slice(0, count).map(x => x.item)
}
function shuffled<T>(items: T[], seed: string): T[] {
  const hash = createHash('sha256').update(seed).digest()
  return items.map((item, i) => ({ item, key: hash[i % hash.length]! * 257 + i })).sort((a, b) => a.key - b.key).map(x => x.item)
}

/** The number of days a `within` such as "3 months" covers, or undefined when it is absent or does not parse. */
function withinDays(within?: string): number | undefined {
  const match = /^(\d+)\s*(day|week|month|year)s?$/i.exec(within?.trim() ?? '')
  return match ? Number(match[1]) * DAYS[match[2]!.toLowerCase() as keyof typeof DAYS] : undefined
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
    const days = withinDays(fields.within)
    const options = NEED_BANDS.map((label, i): ScreenerOption => {
      if (i === NEED_BANDS.length - 1) return option(label, 'reject')
      return option(label, days === undefined || BAND_DAYS[i]! <= Math.max(days, BAND_DAYS[0]!) ? 'accept' : 'reject')
    })
    questions.push({
      id: 'screener.recency', text: `When did you last ${baseForm(fields.did)}?`, options, multi: false, field: 'did',
      rule: days === undefined ? 'accept anything but "I haven\'t"' : `accept the bands inside ${fields.within}`, ...(read.inferred.includes('did') && { inferred: true }),
    })
  }
  if (fields.often && fields.did) {
    const text = fields.often.toLowerCase()
    const limit = /day|daily/.test(text) ? 0 : /week/.test(text) ? 1 : /month/.test(text) ? 2 : /year|quarter|rare/.test(text) ? 3 : 3
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

/**
 * Reads the answers given so far against the questions. A person is rejected when they picked a rejecting option, or when a question that
 * needs one of its accepting options was answered without any. Questions not answered yet, and answers to unknown ids, are ignored.
 */
export function screen(answers: Record<string, unknown>, questions: ScreenerQuestion[]): 'accept' | 'reject' {
  for (const question of questions) {
    if (question.open) continue
    const given = answers[question.id]
    const chosen = Array.isArray(given) ? given : typeof given === 'string' ? [given] : []
    if (!chosen.length) continue
    const rules = chosen.map(label => question.options.find(o => o.label === label)?.rule)
    if (rules.includes('reject')) return 'reject'
    if (question.options.some(o => o.rule === 'accept') && !rules.includes('accept')) return 'reject'
  }
  return 'accept'
}
