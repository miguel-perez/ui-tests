import { beforeEach, describe, expect, it } from 'vitest'
import { example } from '../../../apps/web/lib/copy.ts'
import { exampleFile } from '../../../apps/web/lib/example.ts'
import * as api from '../src/index.ts'
import { compileStudy } from '../src/compile.ts'
import { CARD_FOOTER } from '../src/copy.ts'
import { formatFindings, lint, planLines } from '../src/lint.ts'

const { getStudies, resetStudies } = api
beforeEach(() => resetStudies())

function evaluate(source: string) {
  const old = () => undefined
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', 'context', 'goal', 'beforeEach', source.replace(/^import .*$/m, ''))(api.study, api.setup, api.task, api.outcome, api.expect, api.participant, old, old, old)
}
function run(source: string, config: Record<string, unknown> = { product: 'Weekboard' }) {
  resetStudies()
  evaluate(source)
  const study = getStudies()[0]
  const compiled = compileStudy(study, config)
  return { compiled, findings: lint({ study, compiled, sourceText: source, config }) }
}
const wrap = (taskLine: string, options = "users: 'people who plan work with a team'", body = "outcome(async ({ request }) => { await request.get('/x') })") =>
  `study('s', { ${options} }, () => {\n  ${taskLine}, () => { ${body} })\n})`
const ruleIds = (findings: { rule: string }[]) => findings.map(f => f.rule)

describe('lint', () => {
  it('passes the Weekboard and landing examples with no errors', () => {
    for (const source of [exampleFile, example]) {
      const { findings } = run(source, { product: source === example ? 'ui-tests' : 'Weekboard' })
      expect(findings.filter(f => f.severity === 'error')).toEqual([])
    }
  })

  it('flags interface terms in a task name with rule, reason and source', () => {
    const { findings } = run(wrap("task('click the Docs link and open getting started'"))
    const found = findings.find(f => f.rule === 'interface-terms')!
    expect(found).toMatchObject({ severity: 'error', source: 'NN/g task writing' })
    expect(found.reason).toBeTruthy()
    expect(found.line).toBeGreaterThan(0)
  })
  it('flags interface terms in an authored scenario but not in steps or the card footer', () => {
    expect(ruleIds(run(wrap("task('find the pricing', { scenario: 'Open the menu and look' }")).findings)).toContain('interface-terms')
    const steps = "study('s', { users: 'people who plan work' }, () => {\n  task('find pricing', () => {\n    task('click the Docs link')\n    task('open the menu')\n  })\n})"
    expect(ruleIds(run(steps).findings)).not.toContain('interface-terms')
    expect(ruleIds(run(wrap(`task('find pricing', { scenario: ${JSON.stringify(`You want pricing. ${CARD_FOOTER}`)} }`)).findings)).not.toContain('interface-terms')
  })

  it('flags two clauses and two outcomes, except for agent-only studies', () => {
    const joined = wrap("task('understand what ui-tests does and start'")
    expect(ruleIds(run(joined).findings)).toContain('one-outcome')
    expect(ruleIds(run(joined.replace("users: 'people who plan work with a team'", "users: 'people who plan work with a team', actors: ['agent']")).findings)).not.toContain('one-outcome')
    const two = wrap("task('invite Sam'", undefined, 'outcome(async () => {}); outcome(async () => {})')
    expect(run(two).findings.find(f => f.rule === 'one-outcome')!.source).toBe('MeasuringU task tips')
  })

  it('requires an outcome, answer or minutes, and warns for minutes alone', () => {
    expect(run(wrap("task('invite Sam'", undefined, '')).findings.find(f => f.rule === 'outcome-present')).toMatchObject({ severity: 'error' })
    expect(run(wrap("task('look around', { minutes: 5 }", undefined, '')).findings.find(f => f.rule === 'outcome-present')).toMatchObject({ severity: 'warning' })
    expect(ruleIds(run(wrap("task('find the plan'", undefined, "participant.answer('Which plan?', { expected: 'Pro' })")).findings)).not.toContain('outcome-present')
  })

  it('flags a url-only outcome for an access task', () => {
    const weak = wrap("task('share the board'", undefined, "outcome(async ({ page }) => { expect(page.url()).toContain('/shared') })")
    expect(ruleIds(run(weak).findings)).toContain('hook-strength')
    expect(ruleIds(run(wrap("task('share the board'")).findings)).not.toContain('hook-strength')
  })

  it('warns when a later answer appears in an earlier scenario', () => {
    const source = "study('s', { users: 'people who plan work' }, () => {\n  task('see the Pro plan', () => { outcome(async () => {}) })\n  task('find the price', () => { participant.answer('Which plan?', { expected: 'Pro' }) })\n})"
    expect(run(source).findings.find(f => f.rule === 'goals-independent')).toMatchObject({ severity: 'warning' })
  })

  it('wants one primary among several outcomes', () => {
    const two = "study('s', { users: 'people who plan work' }, () => {\n  task('invite Sam', () => { outcome(async () => {}) })\n  task('remove Sam', () => { outcome(async () => {}) })\n})"
    expect(ruleIds(run(two).findings)).toContain('one-primary')
    expect(ruleIds(run(two.replace("'invite Sam', ()", "'invite Sam', { primary: true }, ()")).findings)).not.toContain('one-primary')
  })

  it('keeps tasks and questions under 30 minutes', () => {
    expect(ruleIds(run(wrap("task('invite Sam', { timeLimit: '27 min' }")).findings)).toContain('under-30-minutes')
    expect(ruleIds(run(wrap("task('invite Sam', { timeLimit: '10 min' }")).findings)).not.toContain('under-30-minutes')
  })

  it('names users and purpose without the product', () => {
    const source = "study('s', { users: 'people who plan work', purpose: 'use ui-tests' }, () => {\n  task('invite Sam', () => { outcome(async () => {}) })\n})"
    const found = run(source, { product: 'ui-tests' }).findings.find(f => f.rule === 'users-purpose-named')!
    expect(found).toMatchObject({ severity: 'error', source: 'this contract; Young' })
    expect(ruleIds(run(wrap("task('invite Sam'", "users: 'everyone'")).findings)).toContain('users-purpose-named')
    expect(ruleIds(run(wrap("task('invite Sam'", "users: 'people who plan work', purpose: 'plan the week in ui-tests'"), { product: 'ui-tests' }).findings)).toContain('users-purpose-named')
  })

  it('reports invalid users fields', () => {
    expect(() => run(wrap("task('invite Sam'", "users: { are: 'people who plan work', within: 'soon' }"))).toThrow()
    const { compiled } = run(wrap("task('invite Sam'"))
    const authored = getStudies()[0]
    authored.options.users = { are: 'people who plan work', within: 'soon' }
    const found = lint({ study: authored, compiled, sourceText: '', config: {} }).filter(f => f.rule === 'users-valid')
    expect(found[0].message).toContain('within')
  })

  it('warns about a real-looking address but not a synthetic one', () => {
    expect(run(wrap("task('invite Sam', { scenario: 'Invite sam@gmail.com to the board' }")).findings.find(f => f.rule === 'fixture-synthetic')).toMatchObject({ severity: 'warning', source: 'PRD 06 Privacy' })
    expect(ruleIds(run(wrap("task('invite Sam', { scenario: 'Invite sam@acme.example to the board' }")).findings)).not.toContain('fixture-synthetic')
  })

  describe('renamed', () => {
    const cases: [string, string, string][] = [
      ["context('s', { users: 'a' }, () => {})", 'context', 'study'],
      ["goal('invite')", 'goal', 'task'],
      ["beforeEach(async () => ({}))", 'beforeEach', 'setup'],
      ["const o = { happyPath: ['/'] }", 'happyPath', 'path'],
      ["const o = { catch: { affecting: 1 } }", 'catch', 'sample'],
      ["const o = { video: true }", 'video: true', "record: 'video'"],
      ["const o = { impression: false }", 'impression', 'firstLook'],
      ["const o = { screen: { did: 'x' } }", 'screen', 'users'],
    ]
    it.each(cases)('flags %s', (code, old, fix) => {
      const source = `${wrap("task('invite Sam'")}\n${code}`
      const found = run(source).findings.filter(f => f.rule === 'renamed')
      expect(found).toHaveLength(1)
      expect(found[0]).toMatchObject({ severity: 'error', source: 'issue #68', line: 4 })
      expect(found[0].message).toContain(old)
      expect(found[0].fix).toContain(fix)
    })
    it('ignores old names in comments and strings', () => {
      const source = `${wrap("task('invite Sam'")}\n// goal('x') and video: true\nconst a = "context( happyPath impression:"`
      expect(ruleIds(run(source).findings)).not.toContain('renamed')
    })
    it('reads legacy option keys the study carries', () => {
      const study = "study('s', { users: 'people who plan', happyPath: ['/'] }, () => { task('invite Sam', () => { outcome(async () => {}) }) })"
      resetStudies(); evaluate(study)
      const authored = getStudies()[0]
      const compiled = compileStudy(authored, {})
      const found = lint({ study: authored, compiled, sourceText: '', config: {} }).filter(f => f.rule === 'renamed')
      expect(found).toHaveLength(1)
      expect(found[0].fix).toBe('path')
    })
  })

  it('formats each finding with why, source and fix', () => {
    const { findings } = run(wrap("task('click the Docs link'"))
    const text = formatFindings(findings.filter(f => f.rule === 'interface-terms'))
    expect(text).toMatch(/^error {2}interface-terms {2}.+\n {2}why: .+\n {2}source: NN\/g task writing\n {2}fix: .+$/)
  })

  it('plans the Weekboard run with its recording line', () => {
    const { compiled } = run(exampleFile)
    expect(planLines(compiled)).toContain("Recording: event replay (what people do on the page) and screen video (record: 'video'; the browser asks first; incentive 1.5×)")
    const events = run(example, { product: 'ui-tests' }).compiled
    expect(planLines(events)).toContain('Recording: event replay (what people do on the page)')
  })
})
