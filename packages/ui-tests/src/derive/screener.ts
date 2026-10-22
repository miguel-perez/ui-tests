import { createHash } from 'node:crypto'
import type { Criteria, Users } from '../types.ts'
import { inferUsers } from './infer-users.ts'

export type OptionRule = 'accept' | 'reject' | 'may-select'
/** An exclusion's kind: a person who works on or has tested the product, one whose work is judging products, or one the author named. */
export type Exclusion = 'insider' | 'professional' | 'author'
/** One option: how it is read, the groups it accepts for (all of them when absent), and, on the exclusions question, which exclusion it is. */
export type ScreenerOption = { label: string; rule: OptionRule; groups?: string[]; exclusion?: Exclusion }
export type Criterion = 'recency' | 'often' | 'role' | 'uses' | 'not'
/**
 * One screener question. `rule` says in words how it is read; `field` is the part of `users` it comes from. Neither, nor any option's
 * rule, ever reaches the participant. `ordered` options keep their order (a scale); the rest are shuffled for each participant. `groups`
 * names the groups the question screens for, when it is not all of them.
 */
export type ScreenerQuestion = {
  id: string; text: string; options: ScreenerOption[]; multi: boolean; ordered: boolean; criterion: Criterion; field: string; rule: string
  groups?: string[]; inferred?: boolean
}
/** A group of people sampled on its own: its name, how many it needs, where that number comes from, and what screens it. */
export type ResolvedGroup = { name: string; quota: number; source: string; criteria: Criteria }

export const NONE_OF_THESE = 'None of these'
/** The one group of a study that does not split its people. */
export const ONE_GROUP = 'everyone'
/** People in each group of the object form when no quota is written. */
export const DEFAULT_QUOTA = 3
export const DEFAULT_WITHIN = '3 months'
/** Screens a person may meet before consent. */
export const MAX_SCREENS = 5

const DAYS = { day: 1, week: 7, month: 30, year: 365 } as const
const FREQUENCY = ['Every day', 'Every week', 'Every month', 'A few times a year', 'Less often']
const FLOOR: Record<string, number> = { daily: 0, weekly: 1, monthly: 2, yearly: 3 }
export const ASSISTIVE = ['Screen reader', 'Screen magnifier', 'Voice control', 'Switch or alternative keyboard', 'Another kind']
export const ASSISTIVE_QUESTION = 'Do you use any assistive technology? You can skip this.'

/** The professions whose work is judging products, each with what names it in a role. A role a group accepts takes its area out. */
const PROFESSIONS: { area: string; names: RegExp }[] = [
  { area: 'UX', names: /\b(ux|user experience|usability)\b/i },
  { area: 'design', names: /\bdesign/i },
  { area: 'marketing', names: /\bmarket(ing|er)s?\b/i },
  { area: 'market research', names: /\bmarket research/i },
]
const INSIDER_WORDS = /\b(work(s|ed|ing)?\s+(on|at|for)|tested|tests?|testing|supports?|supported|sells?|sold|builds?|built)\b/i

const IRREGULAR: Record<string, string> = { ran: 'run', built: 'build', wrote: 'write', made: 'make', sent: 'send', bought: 'buy', paid: 'pay', led: 'lead', found: 'find', got: 'get', took: 'take', set: 'set', put: 'put', had: 'have', did: 'do', went: 'go', chose: 'choose', gave: 'give', began: 'begin', saw: 'see', met: 'meet', kept: 'keep', left: 'leave', lost: 'lose', sold: 'sell', spent: 'spend', told: 'tell', thought: 'think', wore: 'wear', won: 'win', drew: 'draw', held: 'hold', read: 'read', knew: 'know', came: 'come', ate: 'eat', taught: 'teach' }
/** Verbs whose base ends in "e", for the ones where taking off "ed" leaves a stem that could be either. */
const E_VERBS = new Set('update create delete schedule approve receive move use manage share save invite hire file make close compare complete configure decide describe determine enable explore generate handle improve include increase involve like love measure name notice organize organise participate place prepare produce provide purchase raise rate reduce remove rename replace require resolve review revise store type upgrade upload value vote merge archive issue pause practice promote release select serve settle browse cause compose define derive finalize ignore observe operate quote refine reserve rotate scale score subscribe unsubscribe wake waste change arrange engage exchange manage encourage translate navigate integrate communicate coordinate calculate evaluate investigate locate relate separate state reconcile '.trim().split(' '))
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

/** The count and unit of a `within` such as "3 months", or undefined when it does not parse. */
export function windowOf(within: string): { count: number; unit: keyof typeof DAYS; days: number } | undefined {
  const match = /^(\d+)\s*(day|week|month|year)s?$/i.exec(within.trim())
  if (!match) return undefined
  const unit = match[2]!.toLowerCase() as keyof typeof DAYS
  return { count: Number(match[1]), unit, days: Number(match[1]) * DAYS[unit] }
}

type Point = { days: number; label: string; past: string }
const POINTS: Point[] = [
  { days: 7, label: 'a week', past: 'week' }, { days: 30, label: 'a month', past: 'month' }, { days: 90, label: '3 months', past: '3 months' },
  { days: 365, label: 'a year', past: 'year' }, { days: 730, label: '2 years', past: '2 years' }, { days: 1825, label: '5 years', past: '5 years' },
]
const option = (label: string, rule: OptionRule, extra: Partial<ScreenerOption> = {}): ScreenerOption => ({ label, rule, ...extra })
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/**
 * The recency bands for a window, mutually exclusive and in order: the bands up to the window accept; one band beyond it, "More than …
 * ago" and "Never" reject. Always at least four.
 */
export function recencyBands(within: string): ScreenerOption[] {
  const window = windowOf(within) ?? windowOf(DEFAULT_WITHIN)!
  const own: Point = POINTS.find(p => p.days === window.days) ?? (window.count === 1
    ? { days: window.days, label: `a ${window.unit}`, past: window.unit }
    : { days: window.days, label: `${window.count} ${window.unit}s`, past: `${window.count} ${window.unit}s` })
  const beyond = POINTS.find(p => p.days > window.days) ?? { days: window.days * 2, label: `${window.count * 2} ${window.unit}s`, past: '' }
  const points = [...POINTS.filter(p => p.days < window.days), own, beyond]
  const bands = points.map((p, i) => option(i === 0 ? `In the past ${p.past}` : `Between ${points[i - 1]!.label} and ${p.label} ago`, p.days <= window.days ? 'accept' : 'reject'))
  return [...bands, option(`More than ${beyond.label} ago`, 'reject'), option('Never', 'reject')]
}

/** The roles of a `role` field, in the order written. */
export const rolesOf = (role: Criteria['role']): string[] => (Array.isArray(role) ? role : role ? Object.keys(role) : [])

/** The users object as the screener reads it: a sentence is read for `did` and `within`, and those fields are marked inferred. */
export function readUsers(users: Users): { fields: Exclude<Users, string>; inferred: string[] } {
  if (typeof users === 'string') { const read = inferUsers(users); return { fields: read.users, inferred: read.inferred } }
  return { fields: users, inferred: [] }
}

/**
 * The groups a study samples: one per role of `role: { name: quota }`, one per entry of `groups` (3 each unless a quota is written), or
 * one group of `n` people. Each carries the criteria that screen it: the shared fields with its own on top.
 */
export function resolveGroups(users: Users, n: number): ResolvedGroup[] {
  const { fields } = readUsers(users)
  const { groups, are: _are, insiders: _i, professionals: _p, where: _w, language: _l, age: _a, ...shared } = fields
  const base: Criteria = { ...shared, within: shared.within ?? DEFAULT_WITHIN }
  if (groups?.length) {
    return groups.map(({ name, quota, ...own }) => ({ name, quota: quota ?? DEFAULT_QUOTA, source: quota !== undefined ? 'groups' : `default ${DEFAULT_QUOTA}`, criteria: { ...base, ...own, within: own.within ?? base.within } }))
  }
  if (base.role && !Array.isArray(base.role)) {
    return Object.entries(base.role).map(([name, quota]) => ({ name, quota, source: 'role', criteria: { ...base, role: [name] } }))
  }
  return [{ name: ONE_GROUP, quota: n, source: 'sample', criteria: base }]
}

/** The professional areas excluded: all four with `professionals: 'exclude'`, none with `'include'`, else those no accepted role is in. */
export function excludedAreas(professionals: 'exclude' | 'include' | undefined, roles: string[]): string[] {
  if (professionals === 'include') return []
  if (professionals === 'exclude') return PROFESSIONS.map(p => p.area)
  return PROFESSIONS.filter(p => !roles.some(role => p.names.test(role))).map(p => p.area)
}
/** The accepted roles that an excluded professional area also names, as `[role, area]`. */
export function roleConflicts(areas: string[], roles: string[]): [string, string][] {
  return roles.flatMap(role => PROFESSIONS.filter(p => areas.includes(p.area) && p.names.test(role)).map((p): [string, string] => [role, p.area]))
}
const listed = (items: string[]) => items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`
export const insiderLabel = (product: string) => `I work on ${product}, or have taken part in a test of it`
export const professionalLabel = (areas: string[]) => `I work in ${listed(areas)}`

/** Whether a default exclusion already covers one of the author's `not` items: it names an excluded area, or working on or testing the product. */
export function coveredBy(item: string, input: { product: string; areas: string[]; insiders: boolean }): 'insider' | 'professional' | undefined {
  if (input.insiders && (item.toLowerCase().includes(input.product.toLowerCase()) || /\bthis product\b/i.test(item)) && INSIDER_WORDS.test(item)) return 'insider'
  if (PROFESSIONS.some(p => input.areas.includes(p.area) && p.names.test(item))) return 'professional'
  return undefined
}

/** What a model drafts for the screener and the author reviews in the snapshot: same-category decoys, and whether `did` is repeated. */
export type ScreenerDrafts = { role?: string[] | null; uses?: string[] | null; not?: string[] | null; repeats?: boolean | null }
/** The inputs each draft is made from: the accepted roles, the listed tools, the exclusions, and `did`. A draft is current while its input is. */
export type DraftInputs = { role?: string[]; uses?: string[]; not?: string[]; repeats?: string }

export type ScreenerInput = {
  users: Users
  groups: ResolvedGroup[]
  product: string
  drafts: ScreenerDrafts
}

/** The exclusions the study asks about, in order: the insider, the professional areas, then the author's own (minus the covered ones). */
export function exclusionsOf(users: Users, groups: ResolvedGroup[], product: string): { options: ScreenerOption[]; dropped: { item: string; by: 'insider' | 'professional' }[]; areas: string[] } {
  const { fields } = readUsers(users)
  const roles = [...new Set(groups.flatMap(g => rolesOf(g.criteria.role)))]
  const areas = excludedAreas(fields.professionals, roles)
  const insiders = fields.insiders !== 'include'
  const options: ScreenerOption[] = []
  if (insiders) options.push(option(insiderLabel(product), 'reject', { exclusion: 'insider' }))
  if (areas.length) options.push(option(professionalLabel(areas), 'reject', { exclusion: 'professional' }))
  const dropped: { item: string; by: 'insider' | 'professional' }[] = []
  for (const item of [...new Set(groups.flatMap(g => g.criteria.not ?? []))]) {
    const by = coveredBy(item, { product, areas, insiders })
    if (by) dropped.push({ item, by })
    else options.push(option(capital(item.trim()), 'reject', { exclusion: 'author' }))
  }
  return { options, dropped, areas }
}

/** What each draft is made from, for the snapshot to compare against. Absent when the screener has nothing of that kind to draft. */
export function draftInputs(users: Users, groups: ResolvedGroup[], product: string): DraftInputs {
  const roles = [...new Set(groups.flatMap(g => rolesOf(g.criteria.role)))]
  const uses = [...new Set(groups.flatMap(g => g.criteria.uses ?? []))]
  const often = groups.find(g => g.criteria.often && g.criteria.did)
  const exclusions = exclusionsOf(users, groups, product).options.map(o => o.label)
  return {
    ...(roles.length && { role: roles }),
    ...(uses.length && { uses }),
    ...(exclusions.length && { not: exclusions }),
    ...(often && { repeats: often.criteria.did! }),
  }
}

/** Questions that differ by group: one question per distinct value, scoped to the groups that have it when they do not all share it. */
function perValue<T>(groups: ResolvedGroup[], valueOf: (g: ResolvedGroup) => T | undefined, key: (v: T) => string): { value: T; groups?: string[]; suffix: string }[] {
  const seen = new Map<string, { value: T; names: string[] }>()
  for (const group of groups) {
    const value = valueOf(group)
    if (value === undefined) continue
    const k = key(value)
    seen.set(k, { value, names: [...(seen.get(k)?.names ?? []), group.name] })
  }
  const all = groups.length
  return [...seen.values()].map((entry, i, list) => ({ value: entry.value, ...(entry.names.length < all && { groups: entry.names }), suffix: list.length > 1 ? `.${i + 1}` : '' }))
}

/**
 * The screens a person meets before consent, in order: when they last did the thing (`did`, `within`), how often (when `often` is
 * written and the snapshot says it is something people repeat), their role, the tools they use, and the exclusions. Decoys come from
 * `drafts` (the snapshot); a question whose decoys are not drafted yet is shown without them, and the study is a draft until they are.
 */
export function deriveScreener(input: ScreenerInput): ScreenerQuestion[] {
  const { groups, product, drafts } = input
  const { inferred } = readUsers(input.users)
  const questions: ScreenerQuestion[] = []

  for (const { value, groups: scope, suffix } of perValue(groups, g => (g.criteria.did ? { did: g.criteria.did, within: g.criteria.within ?? DEFAULT_WITHIN } : undefined), v => `${v.did}|${v.within}`)) {
    questions.push({
      id: `screener.recency${suffix}`, text: `When did you last ${baseForm(value.did)}?`, options: recencyBands(value.within), multi: false, ordered: true,
      criterion: 'recency', field: 'did', rule: `accept the bands inside ${value.within}`, ...(scope && { groups: scope }), ...(inferred.includes('did') && { inferred: true }),
    })
  }
  if (drafts.repeats) {
    for (const { value, groups: scope, suffix } of perValue(groups, g => (g.criteria.often && g.criteria.did ? { did: g.criteria.did, often: g.criteria.often } : undefined), v => `${v.did}|${v.often}`)) {
      const limit = FLOOR[value.often] ?? 3
      questions.push({
        id: `screener.often${suffix}`, text: `How often do you ${baseForm(value.did)}?`, options: FREQUENCY.map((label, i) => option(label, i <= limit ? 'accept' : 'reject')), multi: false, ordered: true,
        criterion: 'often', field: 'often', rule: `accept ${FREQUENCY[limit]!.toLowerCase()} or more often`, ...(scope && { groups: scope }),
      })
    }
  }
  const withRoles = groups.filter(g => rolesOf(g.criteria.role).length)
  if (withRoles.length) {
    const several = groups.length > 1
    const accepted = [...new Set(withRoles.flatMap(g => rolesOf(g.criteria.role)))]
    const options = accepted.map(role => option(role, 'accept', several ? { groups: withRoles.filter(g => rolesOf(g.criteria.role).includes(role)).map(g => g.name) } : {}))
    const decoys = (drafts.role ?? []).filter(d => !accepted.some(a => a.toLowerCase() === d.toLowerCase())).map(d => option(d, 'reject'))
    questions.push({
      id: 'screener.role', text: 'Which of these is closest to your role?', options: [...options, ...decoys, option(NONE_OF_THESE, 'reject')], multi: false, ordered: false,
      criterion: 'role', field: 'role', rule: `accept ${accepted.map(r => `"${r}"`).join(' or ')}`, ...(withRoles.length < groups.length && { groups: withRoles.map(g => g.name) }),
    })
  }
  for (const { value, groups: scope, suffix } of perValue(groups, g => (g.criteria.uses?.length ? g.criteria.uses : undefined), v => v.join('|'))) {
    const decoys = (drafts.uses ?? []).filter(d => !value.some(u => u.toLowerCase() === d.toLowerCase())).map(d => option(d, 'reject'))
    questions.push({
      id: `screener.uses${suffix}`, text: 'Which of these do you use?', options: [...value.map(tool => option(tool, 'accept')), ...decoys, option(NONE_OF_THESE, 'reject')], multi: true, ordered: false,
      criterion: 'uses', field: 'uses', rule: 'accept at least one of the listed; the decoys and "None of these" reject', ...(scope && { groups: scope }),
    })
  }
  const { options: exclusions } = exclusionsOf(input.users, groups, product)
  if (exclusions.length) {
    const decoys = (drafts.not ?? []).filter(d => !exclusions.some(e => e.label.toLowerCase() === d.toLowerCase())).map(d => option(d, 'may-select'))
    questions.push({
      id: 'screener.not', text: 'Do any of these apply to you?', options: [...exclusions, ...decoys, option(NONE_OF_THESE, 'may-select')], multi: true, ordered: false,
      criterion: 'not', field: 'not', rule: 'reject any of the exclusions; the rest are free to pick',
    })
  }
  return questions
}

/** A seeded random number source, so one attempt always sees the same order and two attempts usually do not. */
function random(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The order one participant sees each question's options in: a scale keeps its order; other lists are shuffled, "None of these" last. */
export function optionOrder(questions: Pick<ScreenerQuestion, 'id' | 'options' | 'ordered'>[], seed: string): Record<string, string[]> {
  const order: Record<string, string[]> = {}
  for (const question of questions) {
    const labels = question.options.map(o => o.label)
    if (question.ordered) { order[question.id] = labels; continue }
    const last = labels.filter(l => l === NONE_OF_THESE)
    const rest = labels.filter(l => l !== NONE_OF_THESE)
    const next = random(`${seed}:${question.id}`)
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!]
    }
    order[question.id] = [...rest, ...last]
  }
  return order
}

export type CriterionValue = { value: string | string[] | boolean; met: boolean }
/**
 * What the screener made of a person: the group they fall in (none when they meet no group's criteria), each criterion's value and
 * whether it was met, and the option order they saw. On a link nothing is filtered by it; it labels the attempt and counts per group.
 */
export type ScreenerResult = { group: string | null; criteria: Record<string, CriterionValue>; order: Record<string, string[]> }

const chosenOf = (given: unknown): string[] => (Array.isArray(given) ? given.filter((v): v is string => typeof v === 'string') : typeof given === 'string' ? [given] : [])
const keyOf = (question: ScreenerQuestion) => question.id.replace(/^screener\./, '')

/** Whether the answer to a question passes for a group: nothing rejecting is picked, and an accepting option for that group is, where the question has any. */
function passes(question: ScreenerQuestion, chosen: string[], group: string | undefined): boolean {
  const picked = chosen.map(label => question.options.find(o => o.label === label)).filter((o): o is ScreenerOption => Boolean(o))
  if (picked.some(o => o.rule === 'reject')) return false
  const accepting = question.options.filter(o => o.rule === 'accept')
  if (!accepting.length) return true
  return picked.some(o => o.rule === 'accept' && (!group || !o.groups || o.groups.includes(group)))
}

/**
 * Reads the answers given so far: each criterion's value and whether it was met, and the first group whose criteria the person meets.
 * A question not answered yet counts as not met for the group; answers to unknown ids are ignored.
 */
export function screenResult(answers: Record<string, unknown>, questions: ScreenerQuestion[], groups: { name: string }[], order: Record<string, string[]>): ScreenerResult {
  const criteria: Record<string, CriterionValue> = {}
  for (const question of questions) {
    const given = answers[question.id]
    if (given === undefined) continue
    const chosen = chosenOf(given)
    if (question.criterion === 'not') {
      const picked = chosen.map(label => question.options.find(o => o.label === label)).filter((o): o is ScreenerOption => Boolean(o))
      for (const kind of ['insider', 'professional'] as const) {
        if (question.options.some(o => o.exclusion === kind)) criteria[kind] = { value: picked.some(o => o.exclusion === kind), met: !picked.some(o => o.exclusion === kind) }
      }
      const own = picked.filter(o => o.exclusion === 'author').map(o => o.label)
      if (question.options.some(o => o.exclusion === 'author')) criteria.not = { value: own, met: own.length === 0 }
      continue
    }
    criteria[keyOf(question)] = { value: question.multi ? chosen : chosen[0] ?? '', met: passes(question, chosen, undefined) }
  }
  const group = groups.find(g => questions.filter(q => !q.groups || q.groups.includes(g.name)).every(q => answers[q.id] !== undefined && passes(q, chosenOf(answers[q.id]), g.name)))
  return { group: group?.name ?? null, criteria, order }
}
