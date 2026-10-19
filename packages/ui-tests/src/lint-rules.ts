import type { AuthoredStudy, AuthoredTask } from './authoring.ts'
import { CARD_FOOTER } from './copy.ts'
import { validateUsers } from './derive/users.ts'
import type { CompiledStudy } from './schema/compiled.ts'
import type { Hook, UiTestsConfig } from './types.ts'

export type Severity = 'error' | 'warning'
export type Emit = (finding: { message: string; severity?: Severity; fix?: string; line?: number }) => void
export type RuleContext = { study: AuthoredStudy; compiled: CompiledStudy; sourceText: string; config: UiTestsConfig; actor?: 'human' | 'agent' }
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
  { old: 'screen', pattern: /(?<![\w$.])screen\s*:/g, fix: 'fields under users (are, did, within, often, role, uses, not, where, language, age)' },
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
    reason: 'The authoring API took new names in issue #68; the old ones no longer do anything.',
    run({ study, sourceText }, emit) {
      const stripped = stripCommentsAndStrings(sourceText)
      const seen = new Set<string>()
      for (const { old, pattern, fix } of renames) {
        const match = new RegExp(pattern.source, pattern.flags).exec(stripped)
        if (!match) continue
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
    },
  },
  { id: 'users-inferred', severity: 'warning', source: 'this contract', reason: 'Filled in with the screener (Task 19).', run() {} },
  { id: 'users-did', severity: 'warning', source: 'this contract', reason: 'Filled in with the screener (Task 19).', run() {} },
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
  { id: 'actor-admitted', severity: 'error', source: 'this contract', reason: 'Filled in with the agent runner (Task 28).', run() {} },
]
