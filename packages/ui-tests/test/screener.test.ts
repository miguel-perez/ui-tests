import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileWithSnapshot, inferUsers, printUsersDraft, type Compiled } from '../src/compile.ts'
import { loadConfig } from '../src/config.ts'
import { baseForm, deriveScreener, NONE_OF_THESE, optionOrder, recencyBands, resolveGroups, screenResult } from '../src/derive/screener.ts'
import { toSecondPerson } from '../src/derive/person.ts'
import { readSnapshotFile, snapshotFileOf, type StudySnapshot } from '../src/derive/snapshot.ts'
import { beforeFirstLook } from '../src/lint-rules.ts'
import { lint } from '../src/lint.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { main, type Io } from '../src/cli/main.ts'
import { buildRecord } from '../src/record/build.ts'
import { createCollector, GROUP_FULL } from '../src/server/collector.ts'
import { participantView } from '../src/server/view.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { messageFor } from '../src/player/flow.ts'
import { newRun } from './store-conformance.ts'

const { getStudies, resetStudies } = api
const root = join(import.meta.dirname, '..', '..', '..')
const examples = join(import.meta.dirname, 'fixtures', 'examples')

/** A study file as the CLI loads it, compiled with its committed snapshot and its own config. */
async function load(dir: string, file: string): Promise<Compiled & { entry: StudySnapshot; study: api.AuthoredStudy; sourceText: string; config: Record<string, unknown> }> {
  const path = join(dir, file)
  const config = (await loadConfig(dir)).config
  const [study] = await loadBundle((await bundleStudyFile(path)).code, path, dir)
  const entry = (await readSnapshotFile(snapshotFileOf(path)))!.studies[study!.name]!
  return { ...compileWithSnapshot(study!, config, entry), entry, study: study!, sourceText: await readFile(path, 'utf8'), config }
}
let landing: Awaited<ReturnType<typeof load>>
let weekboard: Awaited<ReturnType<typeof load>>
let accounting: Awaited<ReturnType<typeof load>>
beforeAll(async () => {
  landing = await load(join(root, 'apps', 'web'), 'ui-tests/landing.ui.test.ts')
  weekboard = await load(join(examples, 'weekboard'), 'ui-tests/invite.ui.test.ts')
  accounting = await load(join(examples, 'accounting'), 'ui-tests/access.ui.test.ts')
})
const all = () => [landing, weekboard, accounting]

function evaluate(source: string) {
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', source.replace(/^import .*$/m, ''))(api.study, api.setup, api.task, api.outcome, api.expect, api.participant)
}
function compileSource(source: string, config: Record<string, unknown> = { product: 'Weekboard' }, entry?: StudySnapshot) {
  resetStudies()
  evaluate(source)
  const study = getStudies()[0]!
  const made = compileWithSnapshot(study, config, entry)
  return { study, ...made, findings: lint({ study, compiled: made.compiled, sourceText: source, config }) }
}
const usersStudy = (users: string, extra = '') => `import { study, task, outcome } from 'ui-tests'
study('s', { users: ${users}, purpose: 'plan the week'${extra} }, () => {
  task('plan', { path: ['/'] }, () => { outcome(async () => {}) })
})`
beforeEach(() => resetStudies())

describe('the three examples', () => {
  it('are current against their committed snapshots, with every drafted item reviewed', () => {
    for (const example of all()) expect(example.snapshot, example.compiled.name).toEqual({ state: 'current', reasons: [] })
    expect(weekboard.sourceText.trimEnd()).toBe(exampleFile.trimEnd())
  })

  it('compile the landing study with no exclusion that rejects a role it accepts', () => {
    const { compiled } = landing
    const accepted = compiled.screener.find(q => q.criterion === 'role')!.options.filter(o => o.rule === 'accept').map(o => o.label)
    expect(accepted).toEqual(['Developer', 'Designer', 'Founder'])
    const exclusions = compiled.screener.find(q => q.criterion === 'not')!.options.filter(o => o.rule === 'reject').map(o => o.label)
    expect(exclusions).toEqual(['I work on ui-tests, or have taken part in a test of it', 'I work in UX, marketing or market research'])
    for (const role of accepted) for (const label of exclusions) expect(label.toLowerCase()).not.toContain(role.toLowerCase().replace(/er$/, ''))
    expect(landing.compiled.users.are).toBe('people who shipped a user interface they built themselves')
    // The language panels filter on comes from the site, recorded in the snapshot.
    expect(landing.compiled.users.language).toBe('en')
  })

  it('share no option across domains, and every decoy is in the study\'s own snapshot', () => {
    // An option of a study's domain: its roles, tools and exclusions and their decoys. The fixed method (bands, frequency, "None of these") is shared on purpose.
    const domain = (c: Compiled) => new Set(c.compiled.screener.filter(q => q.criterion !== 'recency' && q.criterion !== 'often').flatMap(q => q.options.map(o => o.label)).filter(l => l !== NONE_OF_THESE && !l.startsWith('I work on ') && !l.startsWith('I work in UX')))
    const studies = all()
    for (const [i, a] of studies.entries()) for (const b of studies.slice(i + 1)) expect([...domain(a)].filter(l => domain(b).has(l)), `${a.compiled.name} and ${b.compiled.name}`).toEqual([])
    for (const example of studies) {
      const decoys = new Set(Object.values(example.entry.decoys).flatMap(d => d?.value ?? []))
      const shown = example.compiled.screener.flatMap(q => q.options.filter(o => !o.exclusion && o.rule !== 'accept' && o.label !== NONE_OF_THESE && q.criterion !== 'recency' && q.criterion !== 'often').map(o => o.label))
      const written = new Set(resolveGroups(example.study.options.users, 5).flatMap(g => g.criteria.not ?? []).map(t => t.charAt(0).toUpperCase() + t.slice(1)))
      for (const label of shown.filter(l => !written.has(l))) expect(decoys.has(label), `${example.compiled.name}: ${label}`).toBe(true)
      expect(example.entry.screens).toEqual(example.compiled.screener)
    }
  })

  it('show at most five screens before consent, and every recency question has at least four mutually exclusive bands', () => {
    for (const { compiled } of all()) {
      expect(compiled.screener.length, compiled.name).toBeLessThanOrEqual(5)
      for (const q of compiled.screener.filter(q => q.criterion === 'recency')) expect(q.options.length).toBeGreaterThanOrEqual(4)
    }
    for (const within of ['3 days', '1 week', '6 weeks', '3 months', '1 year', '2 years', '10 years']) {
      const bands = recencyBands(within)
      expect(bands.length, within).toBeGreaterThanOrEqual(4)
      // Two bands beyond the window at least, then "Never", all rejecting.
      expect(bands.slice(-3).every(b => b.rule === 'reject'), within).toBe(true)
      expect(bands.filter(b => b.rule === 'accept').length, within).toBeGreaterThanOrEqual(1)
      expect(new Set(bands.map(b => b.label)).size).toBe(bands.length)
    }
    expect(recencyBands('3 months').map(b => `${b.label}:${b.rule}`)).toEqual([
      'In the past week:accept', 'Between a week and a month ago:accept', 'Between a month and 3 months ago:accept',
      'Between 3 months and a year ago:reject', 'More than a year ago:reject', 'Never:reject',
    ])
  })

  it('never show the purpose before the first look, nor a drafted word of it the start page does not say', () => {
    for (const { compiled, study, sourceText, config } of all()) {
      for (const text of beforeFirstLook(compiled)) expect(text.toLowerCase()).not.toContain(compiled.purpose.toLowerCase())
      expect(lint({ study, compiled, sourceText, config }).filter(f => f.rule === 'purpose-leak')).toEqual([])
    }
  })

  it('say the purpose to "you" in the snapshot: "what I built" and "my books"', () => {
    expect(landing.entry.purpose).toEqual({ from: 'find out whether people can use what I built, without a researcher', value: 'find out whether people can use what you built, without a researcher', source: 'purpose, person shifted' })
    expect(accounting.entry.purpose!.value).toBe('give someone else read-only access to your books')
    expect(landing.compiled.goals[0]!.scenario.text).toContain('what you built')
    expect(toSecondPerson("I'm checking my books and mine, by myself, for me")).toBe("you're checking your books and yours, by yourself, for you")
  })
})

describe('what the author writes', () => {
  it('fails lint naming professionals when it excludes a role the study accepts', () => {
    const { findings } = compileSource(usersStudy("{ did: 'shipped a user interface you built yourself', role: ['Designer'], professionals: 'exclude' }"))
    const error = findings.find(f => f.rule === 'professionals-conflict')!
    expect(error).toMatchObject({ severity: 'error' })
    expect(error.message).toContain("professionals: 'exclude'")
    expect(error.message).toContain('"Designer"')
    // By default the area a role accepts is not excluded.
    const plain = compileSource(usersStudy("{ did: 'shipped a user interface you built yourself', role: ['Designer'] }"))
    expect(plain.findings.some(f => f.rule === 'professionals-conflict')).toBe(false)
    expect(plain.compiled.screener.find(q => q.criterion === 'not')!.options.find(o => o.exclusion === 'professional')!.label).toBe('I work in UX, marketing or market research')
  })

  it('requires did in the object form, and never defaults it', () => {
    expect(() => compileSource(usersStudy("{ are: 'people who plan' }"))).toThrow(/did: users needs did/)
    expect(() => compileSource(usersStudy("{ did: 'planned a week', role: 'Planner' }"))).toThrow(/role should be/)
  })

  it('drops a not item a default already covers, with a lint note', () => {
    const { findings, compiled } = compileSource(usersStudy("{ did: 'planned a week', not: ['works in UX research', 'works on Weekboard', 'has a dog'] }"))
    expect(findings.filter(f => f.rule === 'not-covered').map(f => f.message)).toEqual([
      'not "works in UX research" is already covered by the professional exclusion, so it is dropped',
      'not "works on Weekboard" is already covered by the insider exclusion, so it is dropped',
    ])
    expect(compiled.screener.find(q => q.criterion === 'not')!.options.filter(o => o.exclusion === 'author').map(o => o.label)).toEqual(['Has a dog'])
  })

  it('treats a role list as one group, with the lint note, and a role object as one group per role with its quota', () => {
    const one = compileSource(usersStudy("{ did: 'planned a week', role: ['Planner', 'Manager'] }"))
    expect(one.compiled.groups).toEqual([{ name: 'everyone', quota: 5 }])
    expect(one.compiled.sample.n).toBe(5)
    expect(one.findings.find(f => f.rule === 'one-group')!.message).toBe('role ["Planner","Manager"] is treated as one group; write role: { … } with counts to sample them separately')
    const two = compileSource(usersStudy("{ did: 'planned a week', role: { Developer: 3, Designer: 2 } }"))
    expect(two.compiled.groups).toEqual([{ name: 'Developer', quota: 3 }, { name: 'Designer', quota: 2 }])
    expect(two.compiled.sample.n).toBe(5)
    expect(two.findings.some(f => f.rule === 'one-group')).toBe(false)
    expect(two.compiled.screener.find(q => q.criterion === 'role')!.options.filter(o => o.rule === 'accept')).toEqual([
      { label: 'Developer', rule: 'accept', groups: ['Developer'] }, { label: 'Designer', rule: 'accept', groups: ['Designer'] },
    ])
  })

  it('gives each group of the object form 3 people unless a quota is written, and asks each group its own questions', () => {
    const { compiled } = compileSource(usersStudy("{ groups: [{ name: 'owners', did: 'paid a supplier', role: ['Owner'] }, { name: 'bookkeepers', quota: 4, did: 'reconciled a bank account', within: '1 month', role: ['Bookkeeper'] }] }"))
    expect(compiled.groups).toEqual([{ name: 'owners', quota: 3 }, { name: 'bookkeepers', quota: 4 }])
    expect(compiled.screener.filter(q => q.criterion === 'recency').map(q => ({ text: q.text, groups: q.groups }))).toEqual([
      { text: 'When did you last pay a supplier?', groups: ['owners'] }, { text: 'When did you last reconcile a bank account?', groups: ['bookkeepers'] },
    ])
    expect(() => compileSource(usersStudy("{ did: 'paid', groups: [{ name: 'a', role: ['A'] }, { name: 'b', role: ['B'] }] }"))).toThrow(/differs in only role/)
  })

  it('fails lint above five screens before consent', () => {
    const many = "{ groups: [{ name: 'a', did: 'paid a supplier', uses: ['Xero'] }, { name: 'b', did: 'sent an invoice', uses: ['Wave'] }, { name: 'c', did: 'ran payroll', uses: ['Gusto'] }] }"
    const { findings, compiled } = compileSource(usersStudy(many))
    expect(compiled.screener.length).toBeGreaterThan(5)
    expect(findings.find(f => f.rule === 'screens-before-consent')).toMatchObject({ severity: 'error' })
  })

  it('moves the first look to the study: a task-level firstLook is a lint error', () => {
    const source = `import { study, task, outcome } from 'ui-tests'
study('s', { users: { did: 'planned a week' }, purpose: 'plan the week' }, () => {
  task('plan', { path: ['/'], firstLook: { page: '/' } }, () => { outcome(async () => {}) })
})`
    expect(compileSource(source).findings.find(f => f.rule === 'renamed')!.message).toContain('"firstLook" is now "firstLook on the study"')
  })
})

describe('order and answers', () => {
  const questions = () => weekboard.compiled.screener

  it('shuffles unordered options for each participant, keeps scales in order and "None of these" last, and stores the order with the attempt', async () => {
    const orders = Array.from({ length: 8 }, (_, i) => optionOrder(questions(), `attempt-${i}`))
    const uses = new Set(orders.map(o => o['screener.uses']!.join('|')))
    expect(uses.size).toBeGreaterThan(1)
    for (const order of orders) {
      expect(order['screener.recency']).toEqual(questions()[0]!.options.map(o => o.label))
      expect(order['screener.uses']!.at(-1)).toBe(NONE_OF_THESE)
      expect([...order['screener.uses']!].sort()).toEqual(questions()[1]!.options.map(o => o.label).sort())
    }
    // The same attempt always sees the same order; the participant view shows it; the collector stores it.
    expect(optionOrder(questions(), 'attempt-1')).toEqual(orders[1])
    const store = new SqliteStore(':memory:')
    const { run } = await store.createRun(newRun('order', { compiled: weekboard.compiled }))
    const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false })
    const shown = participantView(run, attempt)
    expect(shown.screener.map(q => q.options)).toEqual(questions().map(q => optionOrder(questions(), attempt.id)[q.id]))
    const collect = createCollector({ store: async () => store })
    await collect(new Request('http://app.test/api/ui-tests/', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(messageFor(shown, { kind: 'screener', index: 0 }, { 'screener.recency': 'In the past week' })) }))
    expect(((await store.getAttempt(attempt.id))!.answers.screenerResult as { order: unknown }).order).toEqual(optionOrder(questions(), attempt.id))
  })

  it('records each criterion\'s value and the group; nothing is filtered on a link', () => {
    const result = screenResult({ 'screener.recency': 'In the past week', 'screener.uses': ['Trello', 'Jira'], 'screener.not': ['I work on Weekboard, or have taken part in a test of it'] }, questions(), weekboard.compiled.groups, {})
    expect(result.group).toBeNull()
    expect(result.criteria).toEqual({
      recency: { value: 'In the past week', met: true },
      uses: { value: ['Trello', 'Jira'], met: false },
      insider: { value: true, met: false },
      professional: { value: false, met: true },
      not: { value: [], met: true },
    })
    const fits = screenResult({ 'screener.recency': 'Between a month and 3 months ago', 'screener.uses': ['Asana'], 'screener.not': [NONE_OF_THESE] }, questions(), weekboard.compiled.groups, {})
    expect(fits.group).toBe('everyone')
  })
})

describe('quotas per group', () => {
  const twoGroups = usersStudy("{ did: 'shipped a user interface you built yourself', role: { Developer: 2, Designer: 1 } }")
  async function setup() {
    const { compiled } = compileSource(twoGroups, { product: 'Acme' })
    const store = new SqliteStore(':memory:')
    const { run } = await store.createRun(newRun('q', { compiled }))
    const collect = createCollector({ store: async () => store, now: () => Date.parse('2026-10-19T10:00:00.000Z') })
    let n = 0
    const person = async (role: string) => {
      const { attempt, token } = await store.createAttempt({ runId: run.run, participant: `p${++n}`, goalIndex: 0, rehearsal: false })
      const send = (body: unknown) => collect(new Request('http://app.test/api/ui-tests/', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }, body: JSON.stringify(body) }))
      await send({ action: 'answers', screener: { 'screener.recency': 'In the past week', 'screener.role': role, 'screener.not': [NONE_OF_THESE] } })
      return { attempt, send }
    }
    return { store, run, person }
  }

  it('fills each group to its quota: the next person of a full group is thanked at consent', async () => {
    const { store, person } = await setup()
    const designer = await person('Designer')
    expect((await designer.send({ action: 'consent' })).status).toBe(200)
    const another = await person('Designer')
    const full = await another.send({ action: 'consent' })
    expect(full.status).toBe(409)
    expect(await full.text()).toBe(GROUP_FULL)
    const developer = await person('Developer')
    expect((await developer.send({ action: 'consent' })).status).toBe(200)
    const row = (await store.getAttempt(developer.attempt.id))!
    expect(row.answers.screenerResult).toMatchObject({ group: 'Developer', criteria: { role: { value: 'Developer', met: true } } })
    // Browser and device are read from the user agent, never asked.
    expect(row.environment).toEqual({ browser: 'Safari', device: 'Phone' })
  })

  it('reports n, the detection sentence and the issues per group, and says when a group did not fill', async () => {
    const { store, run, person } = await setup()
    for (const [role, verdict] of [['Developer', 'correct'], ['Developer', 'incorrect'], ['Designer', 'correct']] as const) {
      const { attempt, send } = await person(role)
      await send({ action: 'consent' })
      await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', startedAt: new Date(0).toISOString(), endedAt: new Date(9_000).toISOString(), verification: { status: verdict, steps: [] } })
      if (verdict === 'incorrect') await store.appendEvents(attempt.id, [{ type: 'url', at: 0, url: 'http://t.test/', seq: 1 }, { type: 'click', at: 1000, url: 'http://t.test/', target: 'button#go', changed: false, seq: 2 }])
    }
    const record = await buildRecord(store, run.run)
    expect(record.groups.map(({ issues, ...g }) => g)).toEqual([
      { name: 'Developer', quota: 2, n: 2, filled: true, sentence: 'Two people give a 56% chance of seeing any problem that hits at least one person in three.' },
      { name: 'Designer', quota: 1, n: 1, filled: true, sentence: 'One person gives a 33% chance of seeing any problem that hits at least one person in three.' },
    ])
    expect(record.groups[0]!.issues).toEqual(record.issues.map(i => i.id))
    expect(record.groups[1]!.issues).toEqual([])
    expect(record.attempts.map(a => a.group)).toEqual(['Developer', 'Developer', 'Designer'])
  })
})

describe('lint -u and the snapshot', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(import.meta.dirname, 'fixtures', '.tmp-snapshot-'))
    await writeFile(join(dir, 'ui-tests.config.ts'), "export default { product: 'Acme', target: { url: 'http://site.test' } }\n")
    await writeFile(join(dir, 'a.ui.test.ts'), usersStudy("{ did: 'planned a week with a team', role: ['Planner', 'Manager'], uses: ['Trello'] }"))
  })
  afterAll(async () => { const { readdir } = await import('node:fs/promises'); for (const name of await readdir(join(import.meta.dirname, 'fixtures'))) if (name.startsWith('.tmp-snapshot-')) await rm(join(import.meta.dirname, 'fixtures', name), { recursive: true, force: true }) })
  const run = async (argv: string[], deps: Io['deps'] = {}) => {
    let out = ''
    let err = ''
    const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: dir, env: {}, deps }
    return { code: await main(argv, io), out, err }
  }
  const page = (async () => new Response('<html lang="en-GB"><head><meta name="description" content="Plan your team week on one board."></head></html>')) as unknown as typeof fetch

  it('names each field it could not draft with no model, and substitutes nothing', async () => {
    const result = await run(['lint', '-u'], { fetch: page })
    expect(result.out).toContain('wrote a.ui.test.ts.screener.snap')
    for (const item of ['decoys.role', 'decoys.uses', 'decoys.not']) expect(result.out).toContain(`could not draft ${item}: no model is configured: set model: { provider: 'anthropic', name } in ui-tests.config.ts; write it into a.ui.test.ts.screener.snap`)
    const entry = (await readSnapshotFile(join(dir, 'a.ui.test.ts.screener.snap')))!.studies.s!
    expect(entry.decoys.role).toEqual({ from: ['Planner', 'Manager'], value: null, source: 'not drafted' })
    expect(entry.says).toEqual({ from: '/', value: 'Plan your team week on one board.', source: 'meta description' })
    // The screens hold no decoy at all: nothing generic stands in.
    expect(entry.screens.find(q => q.criterion === 'role')!.options.map(o => o.label)).toEqual(['Planner', 'Manager', NONE_OF_THESE])
  })

  it('drafts the decoys with the model, keeps what still holds, and writes the screens, are, purpose, says and groups', async () => {
    const asked: string[] = []
    const model = { complete: async (prompt: string) => { asked.push(prompt); return prompt.includes('closest to your role') ? '["Scheduler", "Analyst"]' : prompt.includes('do you use') ? '["Asana"]' : '["I work from home"]' } }
    expect((await run(['lint', '-u'], { model, fetch: page })).code).toBe(0)
    const entry = (await readSnapshotFile(join(dir, 'a.ui.test.ts.screener.snap')))!.studies.s!
    expect(Object.keys(entry)).toEqual(['are', 'purpose', 'says', 'language', 'decoys', 'groups', 'screens'])
    expect(entry.language).toEqual({ from: '/', value: 'en-GB', source: 'html lang' })
    expect(entry.decoys.role).toEqual({ from: ['Planner', 'Manager'], value: ['Scheduler', 'Analyst'], source: 'model' })
    expect(entry.are!.value).toBe('people who planned a week with a team')
    expect(entry.groups).toEqual([{ name: 'everyone', quota: 5, source: 'sample' }])
    expect(entry.screens.map(q => q.id)).toEqual(['screener.recency', 'screener.role', 'screener.uses', 'screener.not'])
    expect(asked).toHaveLength(3)
    // The author edits a decoy; updating again keeps it, asks nothing, and the snapshot is current.
    const file = join(dir, 'a.ui.test.ts.screener.snap')
    await writeFile(file, (await readFile(file, 'utf8')).replace('"Analyst"', '"Data analyst"'))
    expect((await run(['lint'])).out).toContain('screener-snapshot')
    await run(['lint', '-u'], { model, fetch: page })
    expect(asked).toHaveLength(3)
    expect((await readSnapshotFile(file))!.studies.s!.decoys.role!.value).toEqual(['Scheduler', 'Data analyst'])
    expect((await run(['lint'])).out).not.toContain('screener-snapshot')
  })

  it('makes recruit and check exit non-zero naming the snapshot while it is missing or out of date, and rehearsal labels the screens as drafts', async () => {
    const missing = await run(['recruit', '--local'])
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('a.ui.test.ts.screener.snap: the screener snapshot of "s" is missing')
    await run(['lint', '-u'], { fetch: page })
    const incomplete = await run(['recruit', '--local'])
    expect(incomplete.code).toBe(1)
    expect(incomplete.err).toContain('is out of date (decoys.role is not drafted yet')
    const lintOut = (await run(['lint'])).out
    expect(lintOut).toContain('Screener: 4 screens before consent (draft: the snapshot is missing or out of date; ui-tests lint -u drafts it)')
  })

  it('lets a rehearsal run on a draft, and labels its screens as drafts', async () => {
    const { compiled } = compileSource(usersStudy("{ did: 'planned a week with a team' }"))
    expect(compiled.draft).toBe(true)
    const store = new SqliteStore(':memory:')
    const rehearsal = (await store.createRun(newRun('draft', { compiled, rehearsal: true }))).run
    const own = await store.createAttempt({ runId: rehearsal.run, participant: 'author', goalIndex: 0, rehearsal: true })
    const view = participantView(rehearsal, own.attempt)
    expect(view.draft).toBe(true)
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { createElement } = await import('react')
    const { PlayerScreen } = await import('../src/player/screens.tsx')
    expect(renderToStaticMarkup(createElement(PlayerScreen, { view, screen: { kind: 'consent' }, answers: {}, onAnswer: () => {}, onNext: () => {}, onStart: () => {} }))).toContain('Draft: these screens come from a screener snapshot that is missing or out of date.')
    // People are never shown a draft: a link run is made only once the snapshot is current.
    const link = (await store.createRun(newRun('link', { compiled }))).run
    expect(participantView(link, (await store.createAttempt({ runId: link.run, participant: 'p', goalIndex: 0, rehearsal: false })).attempt).draft).toBe(false)
  })
})

describe('inferring users from a sentence', () => {
  it('reads a relative clause as did and a time phrase as within, and prints a pasteable draft', () => {
    expect(inferUsers('developers who shipped a UI in the last month')).toEqual({
      users: { are: 'developers who shipped a UI in the last month', did: 'shipped a UI', within: '1 month' }, inferred: ['did', 'within'],
    })
    expect(printUsersDraft(inferUsers('developers who shipped a UI in the last month').users)).toBe("users: { are: 'developers who shipped a UI in the last month', did: 'shipped a UI', within: '1 month' }")
    expect(printUsersDraft({ did: 'shipped a UI', role: { Developer: 3 } })).toBe("users: { did: 'shipped a UI', role: { 'Developer': 3 } }")
  })

  it('compiles the inferred fields, marks the question, and warns users-did when there is no behaviour', () => {
    const { compiled, findings } = compileSource(usersStudy(JSON.stringify('developers who shipped a UI in the last month')))
    expect(compiled.screener[0]).toMatchObject({ id: 'screener.recency', text: 'When did you last ship a UI?', inferred: true })
    expect(findings.filter(f => f.rule === 'users-inferred')).toHaveLength(1)
    const bare = compileSource(usersStudy(JSON.stringify('busy parents')))
    expect(bare.findings.filter(f => f.rule === 'users-did')).toHaveLength(1)
    expect(bare.compiled.screener.map(q => q.criterion)).toEqual(['not'])
  })
})

describe('deriveScreener', () => {
  it('asks how often only when the snapshot says did is repeated', () => {
    const users = { did: 'planned a week', often: 'weekly' as const }
    const groups = resolveGroups(users, 5)
    expect(deriveScreener({ users, groups, product: 'Acme', drafts: { repeats: null } }).map(q => q.id)).toEqual(['screener.recency', 'screener.not'])
    const asked = deriveScreener({ users, groups, product: 'Acme', drafts: { repeats: true } })
    expect(asked.map(q => q.id)).toEqual(['screener.recency', 'screener.often', 'screener.not'])
    expect(asked[1]!.options.map(o => o.rule)).toEqual(['accept', 'accept', 'reject', 'reject', 'reject'])
    expect(asked[1]!.ordered).toBe(true)
  })
})

describe('baseForm', () => {
  it('gives the base form of regular and irregular past tense', () => {
    const cases: [string, string][] = [
      ['added a card', 'add a card'], ['updated a plan', 'update a plan'], ['received an invoice', 'receive an invoice'], ['scheduled a meeting', 'schedule a meeting'],
      ['approved a request', 'approve a request'], ['shipped a UI', 'ship a UI'], ['planned the week', 'plan the week'], ['used a shared tool', 'use a shared tool'],
      ['tried a new tool', 'try a new tool'], ['moved a card', 'move a card'], ['deleted a board', 'delete a board'], ['edited a page', 'edit a page'],
      ['opened a file', 'open a file'], ['stopped a job', 'stop a job'], ['called support', 'call support'], ['managed a team', 'manage a team'],
      ['created a board', 'create a board'], ['waited for a reply', 'wait for a reply'], ['wrote a spec', 'write a spec'], ['ran a test', 'run a test'], ['built a page', 'build a page'],
      ['need a plan', 'need a plan'], ['ship a UI', 'ship a UI'],
    ]
    for (const [past, base] of cases) expect(baseForm(past), past).toBe(base)
  })
})
