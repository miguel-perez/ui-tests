import type { AuthoredStudy, AuthoredTask } from './authoring.ts'
import { CARD_FOOTER } from './copy.ts'
import { inferUsers, printUsersDraft } from './derive/infer-users.ts'
import { exclusionsOf, MAX_SCREENS, readUsers, resolveGroups, roleConflicts, rolesOf, excludedAreas } from './derive/screener.ts'
import type { SnapshotState } from './derive/snapshot.ts'
import { validateUsers } from './derive/users.ts'
import type { CompiledStudy } from './schema/compiled.ts'
import type { Hook, UiTestsConfig } from './types.ts'

export type Severity = 'error' | 'warning'
export type Emit = (finding: { message: string; severity?: Severity; fix?: string; line?: number }) => void
export type RuleContext = { study: AuthoredStudy; compiled: CompiledStudy; sourceText: string; config: UiTestsConfig; actor?: 'human' | 'agent'; snapshot?: SnapshotState & { file: string } }
/** One lint rule: its id, default severity, why it exists, where the advice comes from, and the check. */
export type Rule = { id: string; severity: Severity; reason: string; source: string; run(context: RuleContext, emit: Emit): void }

const interfaceWords = ['click', 'tap', 'press', 'button', 'link', 'menu', 'tab', 'dropdown', 'icon', 'checkbox', 'field', 'scroll', 'navigate']
const outcomeVerbs = ['understand', 'start', 'sign', 'find', 'open', 'create', 'invite', 'buy', 'add', 'learn', 'see', 'get', 'make', 'try', 'choose', 'send', 'share', 'set']
const weakHookNames = /access|permission|role|share|invite|understand|learn/i

/** Replaces comments and string, template and quote contents with spaces, keeping newlines so line numbers hold. */
export function stripCommentsAndStrings(text: string): string {
  let out = ''
  for (let i = 0; i < text.length;) {
    const c = text[i], next = text[i + 1]
    if (c === '/' && next === '/') { while (i < text.length && text[i] !== '\n') { out += ' '; i++ } continue }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2), stop = end < 0 ? text.length : end + 2
      out += text.slice(i, stop).replace(/[^\n]/g, ' '); i = stop; continue
    }
    if (c === '"' || c === "'" || c === '`') {
      out += ' '; i++
      while (i < text.length && text[i] !== c) {
        if (text[i] === '\\') { out += ' '; i++ }
        out += text[i] === '\n' ? '\n' : ' '; i++
      }
      out += ' '; i++; continue
    }
    out += c; i++
  }
  return out
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length
const words = (list: string[]) => new RegExp(`\\b(?:${list.join('|')})(?:s|es)?\\b`, 'i')
const readable = (text: string) => text.replace(CARD_FOOTER, '')

/** Old names and the new name each is replaced by, detected on call and key positions in the source. */
const renames: { old: string; pattern: RegExp; fix: string }[] = [
  { old: 'context', pattern: /(?<![\w$.])context\s*\(/g, fix: 'study(' },
  { old: 'goal', pattern: /(?<![\w$.])goal\s*\(/g, fix: 'task(' },
  { old: 'beforeEach', pattern: /(?<![\w$.])beforeEach\s*\(/g, fix: 'setup(' },
  { old: 'happyPath', pattern: /(?<![\w$.])happyPath\b/g, fix: 'path' },
  { old: 'catch', pattern: /(?<![\w$.])catch\s*:/g, fix: 'sample' },
  { old: 'video: true', pattern: /(?<![\w$.])video\s*:\s*true\b/g, fix: "record: 'video'" },
  { old: 'impression', pattern: /(?<![\w$.])impression\s*:/g, fix: 'firstLook' },
  { old: 'screen', pattern: /(?<![\w$.])screen\s*:/g, fix: 'fields under users (did, within, often, role, uses, not, groups, are, insiders, professionals, where, language, age)' },
]
const legacyKey: Record<string, string> = { video: 'video: true' }

const tasks = (study: AuthoredStudy): [AuthoredTask, number][] => study.tasks.map((task, index) => [task, index])
const onlyUrl = (hook: Hook) => {
  const source = String(hook)
  return /\bpage\s*\.\s*url\s*\(/.test(source) && !/\b(?:request|setup|workspace)\s*[.[(]/.test(source) && !/\bpage\s*\.\s*(?:textContent|query|state)\b/.test(source)
}

function realEmails(text: string) {
  const found: string[] = []
  for (const [address, domain] of Array.from(text.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g), m => [m[0], m[1].toLowerCase()])) {
    if (!/(?:\.example|\.test)$/.test(domain) && domain !== 'example.com' && !domain.endsWith('.example.com')) found.push(address)
  }
  return found
}

export const rules: Rule[] = [
  {
    id: 'renamed', severity: 'error', source: 'issue #68',
    reason: 'Each contract name has an authoring API name (study, task, setup, path, sample, record, firstLook, the users fields); the contract name does nothing in a study.',
    run({ study, sourceText }, emit) {
      const stripped = stripCommentsAndStrings(sourceText)
      const seen = new Set<string>()
      // A name the study's own options place more precisely (a task-level impression moves to the study) is said once, from there.
      const moved = new Set(study.legacy.map(entry => /^.*?: "(.+?)" is now "(.+)"$/.exec(entry)).filter(m => m && renames.some(r => r.old === (legacyKey[m[1]] ?? m[1]) && r.fix !== m[2])).map(m => legacyKey[m![1]] ?? m![1]))
      for (const { old, pattern, fix } of renames) {
        const match = new RegExp(pattern.source, pattern.flags).exec(stripped)
        if (!match || moved.has(old)) continue
        seen.add(old)
        emit({ message: `"${old.replace(/\($/, '')}" is now "${fix.replace(/\($/, '')}"`, fix, line: lineOf(stripped, match.index) })
      }
      for (const entry of study.legacy) {
        const match = /^(.*?): "(.+?)" is now "(.+)"$/.exec(entry)
        if (!match || seen.has(legacyKey[match[2]] ?? match[2])) continue
        seen.add(legacyKey[match[2]] ?? match[2])
        emit({ message: `${match[1]}: "${match[2]}" is now "${match[3]}"`, fix: match[3] })
      }
    },
  },
  {
    id: 'interface-terms', severity: 'error', source: 'NN/g task writing',
    reason: 'A task name or scenario that names interface parts tells people where to look, so the study cannot show whether they find it. Steps may name them.',
    run({ study }, emit) {
      const pattern = words(interfaceWords)
      for (const [task] of tasks(study)) {
        for (const [where, text] of [['task name', task.name], ['scenario', task.options.scenario ?? '']] as const) {
          const hit = pattern.exec(readable(text))
          if (hit) emit({ message: `${where} "${text}" uses the interface term "${hit[0]}"`, fix: 'describe what the person wants to get done and move the interface wording into a step', line: task.line })
        }
      }
    },
  },
  {
    id: 'one-outcome', severity: 'error', source: 'MeasuringU task tips',
    reason: 'A task that asks for two outcomes cannot say which one failed.',
    run({ study, compiled }, emit) {
      const agentOnly = compiled.actors.length > 0 && !compiled.actors.includes('human')
      const joined = new RegExp(`(?: and | then )(?:${outcomeVerbs.join('|')})\\b`, 'i')
      for (const [task] of tasks(study)) {
        if (task.outcomes.length > 1) emit({ message: `task "${task.name}" has ${task.outcomes.length} outcomes`, fix: 'split the task, one outcome each', line: task.line })
        else if (!agentOnly && joined.test(task.name)) emit({ message: `task name "${task.name}" joins two outcomes`, fix: 'split, and let the derived impression stage carry "understand"', line: task.line })
      }
    },
  },
  {
    id: 'outcome-present', severity: 'error', source: 'this contract',
    reason: 'Without an outcome, an answer or a time box, nothing says whether the task was done.',
    run({ study }, emit) {
      for (const [task] of tasks(study)) {
        if (task.outcomes.length || task.answer) continue
        if (task.options.minutes !== undefined) emit({ severity: 'warning', message: `task "${task.name}" has minutes but no outcome, so it only explores`, fix: 'add outcome() if something should be true at the end', line: task.line })
        else emit({ message: `task "${task.name}" has no outcome, answer or minutes`, fix: 'add outcome(), participant.answer() or minutes', line: task.line })
      }
    },
  },
  {
    id: 'hook-strength', severity: 'error', source: 'MeasuringU validation methods',
    reason: 'A page address says where the person ended up, not that the thing happened; for access, sharing or understanding, check the stored state.',
    run({ study }, emit) {
      for (const [task] of tasks(study)) {
        if (weakHookNames.test(task.name) && task.outcomes.length && task.outcomes.every(onlyUrl)) emit({ message: `task "${task.name}" only checks page.url()`, fix: 'read the state the task should change, with request or page.textContent', line: task.line })
      }
    },
  },
  {
    id: 'goals-independent', severity: 'warning', source: 'NN/g',
    reason: 'When an earlier scenario contains a later answer, doing the first task gives the second away.',
    run({ study, compiled }, emit) {
      for (const [task, index] of tasks(study)) {
        const expected = task.answer?.expected
        if (!expected) continue
        for (let before = 0; before < index; before++) {
          const text = `${study.tasks[before].name} ${compiled.goals[before]?.scenario.text ?? ''}`
          if (text.toLowerCase().includes(expected.toLowerCase())) emit({ message: `the answer "${expected}" of task "${task.name}" appears in the scenario of task "${study.tasks[before].name}"`, fix: 'reword the earlier scenario or reorder the tasks', line: task.line })
        }
      }
    },
  },
  {
    id: 'one-primary', severity: 'error', source: 'this contract',
    reason: 'The result is read from one task; with several outcomes and no primary, it is not clear which.',
    run({ study }, emit) {
      if (study.tasks.filter(t => t.outcomes.length).length > 1 && !study.tasks.some(t => t.options.primary)) emit({ message: 'several tasks have outcomes and none is primary', fix: 'add primary: true to one task', line: study.line })
    },
  },
  {
    id: 'under-30-minutes', severity: 'error', source: 'MeasuringU online study time',
    reason: 'Online studies lose people past about thirty minutes; the limits and five minutes of questions must fit.',
    run({ compiled, study }, emit) {
      const minutes = (compiled.goals.reduce((sum, g) => sum + g.timeout.seconds, 0) + 300) / 60
      if (minutes > 30) emit({ message: `task limits plus five minutes of questions come to ${Math.round(minutes)} minutes`, fix: 'cut tasks or lower timeLimit', line: study.line })
    },
  },
  {
    id: 'users-purpose-named', severity: 'error', source: 'this contract; Young',
    reason: 'Users and purpose describe people and what they want, not your product; naming it leads them.',
    run({ study, config }, emit) {
      const users = study.options.users
      const are = (typeof users === 'string' ? users : users?.are ?? '').trim().replace(/[.!]$/, '')
      if (/^(anyone|everyone|users|people)$/i.test(are)) emit({ message: `users "${are}" does not say who these people are`, fix: 'describe them by what they do', line: study.line })
      const purpose = study.options.purpose ?? ''
      const product = config.product
      if (/^use\s/i.test(purpose.trim())) emit({ message: `purpose "${purpose}" starts with "use"`, fix: 'say what they want to get done, not that they use the product', line: study.line })
      else if (product && purpose.toLowerCase().includes(product.toLowerCase())) emit({ message: `purpose "${purpose}" names ${product}`, fix: 'say what they want to get done without the product name', line: study.line })
    },
  },
  {
    id: 'users-valid', severity: 'error', source: 'this contract',
    reason: 'The screening fields are checked before anyone is asked to match them.',
    run({ study }, emit) {
      for (const { field, message } of validateUsers(study.options.users).errors) emit({ message: `${field}: ${message}`, line: study.line })
      if ('screen' in study.options) emit({ message: 'a separate "screen" key is now fields under users', fix: 'move did, within, often, role, uses, not, where, language and age into users', line: study.line })
      if (typeof study.options.firstLook === 'object' && study.options.firstLook.page !== undefined && !study.options.firstLook.page.startsWith('/')) emit({ message: `firstLook.page "${study.options.firstLook.page}" is not a path on the target`, fix: 'name the page by its path, such as "/"', line: study.line })
    },
  },
  {
    id: 'users-inferred', severity: 'warning', source: 'this contract',
    reason: 'A users sentence is read for what people did and how recently, so the screener can ask it; guessed fields should be written down and checked.',
    run({ study }, emit) {
      const users = study.options.users
      if (typeof users !== 'string') return
      const { users: read, inferred } = inferUsers(users)
      if (!inferred.length) return
      emit({ message: `the screener reads "${users}" as ${[read.did && `did "${read.did}"`, read.within && `within "${read.within}"`].filter(Boolean).join(' and ')}: ${printUsersDraft(read)}`, fix: `paste ${printUsersDraft(read)} and correct it`, line: study.line })
    },
  },
  {
    id: 'users-did', severity: 'warning', source: 'this contract',
    reason: 'People are screened on what they did, not on what they say they are; without a behaviour the screener cannot ask when they last did it.',
    run({ study, compiled }, emit) {
      // Agents are not screened, so a study only they take has no use for a behaviour.
      if (compiled.actors.length > 0 && !compiled.actors.includes('human')) return
      const users = study.options.users
      const fields = typeof users === 'string' ? inferUsers(users).users : users
      if (!fields || typeof fields !== 'object' || fields.did) return
      emit({ message: `users "${fields.are}" says who they are but not what they did${fields.often || fields.within ? ' (often and within need did)' : ''}`, fix: 'add did: what they did, in the past tense, such as "booked a trip", and within: how recently', line: study.line })
    },
  },
  {
    id: 'fixture-synthetic', severity: 'warning', source: 'PRD 06 Privacy',
    reason: 'A real-looking address in a scenario may reach a real person; use a .example or .test address.',
    run({ study, compiled }, emit) {
      for (const [task, index] of tasks(study)) {
        const emails = realEmails(`${task.options.scenario ?? ''} ${compiled.goals[index]?.scenario.text ?? ''}`)
        for (const email of new Set(emails)) emit({ message: `the scenario of task "${task.name}" contains ${email}`, fix: `use an address ending in .example, such as ${email.replace(/@.*$/, '@acme.example')}`, line: task.line })
      }
    },
  },
  {
    id: 'actor-admitted', severity: 'error', source: 'this contract',
    reason: 'A run has one actor, and only the actors a study lists may take it; a terminal, an MCP server or an HTTP API is not something a human harness drives yet.',
    run({ study, compiled, actor }, emit) {
      if (actor === 'agent' && !compiled.actors.includes('agent')) emit({ message: `study "${study.name}" does not admit the agent actor (actors: ${compiled.actors.join(', ') || 'none'})`, fix: "add 'agent' to actors", line: study.line })
      if (!compiled.actors.includes('human')) return
      const kinds = new Set<string>()
      const studyTarget = study.options.target
      for (const kind of ['cli', 'mcp', 'http'] as const) if (studyTarget?.[kind]) kinds.add(kind)
      for (const task of study.tasks) for (const kind of ['cli', 'mcp', 'http'] as const) if (task.options.target?.[kind]) kinds.add(kind)
      if (kinds.size) emit({ message: `study "${study.name}" lists human and targets ${[...kinds].join(', ')}: a human terminal harness is a planned omission`, fix: "set actors: ['agent'], or point target at a url", line: study.line })
    },
  },
  {
    id: 'one-group', severity: 'warning', source: 'Sauro, Quantifying the User Experience; Krug, Rocket Surgery Made Easy',
    reason: 'People in different roles may meet different problems; sampled together, five of one role can stand for all of them, and the detection sentence assumes one group.',
    run({ study, compiled }, emit) {
      if (!compiled.actors.includes('human')) return
      const { fields } = readUsers(study.options.users)
      if (Array.isArray(fields.role) && fields.role.length > 1) emit({ message: `role ${JSON.stringify(fields.role)} is treated as one group; write role: { … } with counts to sample them separately`, fix: `role: { ${fields.role.map(r => `${JSON.stringify(r)}: 3`).join(', ')} }`, line: study.line })
    },
  },
  {
    id: 'not-covered', severity: 'warning', source: 'Krug, Rocket Surgery Made Easy; Nielsen, Prioritizing Web Usability',
    reason: 'People who work on or have tested the product, and people whose work is judging products, are excluded by default; the same exclusion twice reads as a trap.',
    run({ study, compiled }, emit) {
      if (!compiled.actors.includes('human')) return
      const { dropped } = exclusionsOf(study.options.users, resolveGroups(study.options.users, compiled.sample.n), compiled.product)
      for (const { item, by } of dropped) emit({ message: `not "${item}" is already covered by the ${by} exclusion, so it is dropped`, fix: `remove "${item}" from not`, line: study.line })
    },
  },
  {
    id: 'professionals-conflict', severity: 'error', source: 'Nielsen, Prioritizing Web Usability; Krug, Rocket Surgery Made Easy',
    reason: 'People who judge products for a living are left out because they rarely stand for mainstream users; when the study is for them, leaving them out rejects the people it accepts.',
    run({ study, compiled }, emit) {
      const { fields } = readUsers(study.options.users)
      if (fields.professionals !== 'exclude') return
      const roles = [...new Set(resolveGroups(study.options.users, compiled.sample.n).flatMap(g => rolesOf(g.criteria.role)))]
      for (const [role, area] of roleConflicts(excludedAreas('exclude', roles), roles)) {
        emit({ message: `professionals: 'exclude' rejects people who work in ${area}, and role accepts "${role}"`, fix: "remove professionals: 'exclude'; by default the areas a role accepts are not excluded", line: study.line })
      }
    },
  },
  {
    id: 'screens-before-consent', severity: 'error', source: 'Goal-Directed Design (the ideal screener is short)',
    reason: 'Every screen before consent is asked of people who have agreed to nothing yet; a short screener quickly finds who fits.',
    run({ study, compiled }, emit) {
      if (compiled.screener.length > MAX_SCREENS) emit({ message: `the screener has ${compiled.screener.length} screens before consent, more than ${MAX_SCREENS}`, fix: 'drop a field from users, or split the groups into separate studies', line: study.line })
    },
  },
  {
    id: 'purpose-leak', severity: 'error', source: "Krug, Don't Make Me Think (the first look starts cold); PRD 02",
    reason: 'The first look shows whether people can tell what the page is for from a standing start; a word of the purpose shown before it gives the answer away.',
    run({ study, compiled }, emit) {
      if (!compiled.purpose || !compiled.actors.includes('human')) return
      const groups = resolveGroups(study.options.users, compiled.sample.n)
      // The purpose itself is never shown before the first look.
      for (const text of beforeFirstLook(compiled)) {
        if (text.toLowerCase().includes(compiled.purpose.toLowerCase())) emit({ message: `"${text}" is shown before the first look and says the purpose`, fix: 'reword it so the purpose is not said', line: study.line })
      }
      // What was drafted (the decoys) may not say a word of the purpose that the start page does not say itself, nor the author's own criteria.
      const allowed = contentWords([compiled.impression.says ?? '', compiled.product, ...groups.flatMap(g => [g.criteria.did ?? '', ...rolesOf(g.criteria.role), ...(g.criteria.uses ?? []), ...(g.criteria.not ?? [])])].join(' '))
      const wanted = [...contentWords(compiled.purpose)].filter(w => !allowed.has(w))
      const written = new Set(groups.flatMap(g => [...rolesOf(g.criteria.role), ...(g.criteria.uses ?? []), ...(g.criteria.not ?? [])]).map(t => t.toLowerCase()))
      const drafted = compiled.screener.flatMap(q => q.options.filter(o => !o.exclusion && o.rule !== 'accept' && o.label !== 'None of these' && !written.has(o.label.toLowerCase()) && q.criterion !== 'recency' && q.criterion !== 'often').map(o => o.label))
      for (const text of drafted) {
        const said = contentWords(text)
        const leaked = wanted.filter(w => said.has(w))
        if (leaked.length) emit({ message: `the decoy "${text}" is shown before the first look and says "${leaked.join('", "')}" from the purpose`, fix: 'reword the decoy in the snapshot', line: study.line })
      }
    },
  },
  {
    id: 'screener-snapshot', severity: 'warning', source: 'Goal-Directed Design; Portigal, Interviewing Users (review the screener before recruiting)',
    reason: 'What ui-tests drafts (the decoys, who the users are, the purpose said to "you", what the page says) is reviewed before anyone is recruited; recruit and check refuse until the snapshot is current.',
    run({ study, compiled, snapshot }, emit) {
      if (!snapshot || snapshot.state === 'current' || !compiled.actors.includes('human')) return
      emit({ message: `${snapshot.file} is ${snapshot.state}: ${snapshot.reasons.join('; ')}`, fix: `run ui-tests lint -u, review ${snapshot.file} and commit it`, line: study.line })
    },
  },
]

const STOP = new Set((
  'a an and are as at be been but by can could do does for from had has have he her his how i if in into is it its me my of on or our she so some that the their them they this to up was we were what when where which who whom why will with would you your ' +
  'about just like really very also than then there these those want out whether without within more most any all each one other own same not no yes'
).split(' '))
/** Lower-case words without the little ones, with -ing, -ed, -er, -s and a final e taken off, so "builder" and "built" are told apart but "researcher" meets "research". */
export function contentWords(text: string): Set<string> {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (STOP.has(raw) || raw.length < 3) continue
    let w = raw
    if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
    else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
    else if (w.length > 5 && w.endsWith('er')) w = w.slice(0, -2)
    else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
    if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1)
    out.add(w)
  }
  return out
}

/** Every string a participant reads before the first look: the screener's questions and options, the consent, and the assistive question. */
export function beforeFirstLook(compiled: CompiledStudy): string[] {
  return [
    ...compiled.screener.flatMap(q => [q.text, ...q.options.map(o => o.label)]),
    ...compiled.consent.text,
    compiled.assistive.text, ...compiled.assistive.options,
  ]
}
