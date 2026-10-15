import { describe, it, expect as assert, beforeEach, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { context, goal, task, outcome, expect, getContexts, resetContexts } from '../packages/ui-tests/src/index'
import { compile, lint, generateTemplate, sentence, sampleSize } from '../packages/ui-tests/src/compiler'
import { SQLiteAdapter } from '../packages/ui-tests/src/storage'
import { verify, issues } from '../packages/ui-tests/src/verify'
import { participantView, createCollector } from '../packages/ui-tests/src/server'
import * as siteCopy from '../apps/web/lib/copy'

beforeEach(resetContexts)
/** Authors the landing context with the given goal options and returns the contexts. */
function authored(options = { happyPath: ['/', '/docs/getting-started'] }) {
  context({ users: 'developers', purpose: 'find out whether people can use what I built' }, () => {
    goal('start trying ui-tests', options, () => outcome(({ page }) => expect(page.url()).toContain('/docs/getting-started')))
  })
  return getContexts()
}
describe('authoring and derivation', () => {
  it('derives stable identifiers, rules, five attempts and an exact rehearsal sentence', () => {
    const [c] = compile(authored())
    assert(c.id).toBe(compile(getContexts())[0].id)
    assert(c.goals[0]).toMatchObject({ shape: 'happy-path', timeout: { seconds: 180 }, sample: { planned: 5 }, resultSentence: 'Rehearsal: 0 of 5 planned attempts recorded.' })
    assert(c.impression).toMatchObject({ answer: c.purpose, rule: expectString() })
    assert(c.fitQuestions).toHaveLength(3)
    assert(c.fitQuestions.every(q => q.rule && q.question.includes(c.purpose))).toBe(true)
    assert(sampleSize()).toBe(5); assert(sentence()).toBe('Rehearsal: 0 of 5 planned attempts recorded.')
    assert(() => sampleSize('1 in 0')).toThrow()
  })
  it('generates scenario only from goal and fixtures, and supports author override', () => {
    assert(generateTemplate('finish planning', ['April budget'])).toContain('April budget')
    const [c] = compile(authored())
    assert(c.goals[0].scenario.text).toContain('start trying ui-tests')
    assert(c.goals[0].scenario.text).not.toMatch(/click|link|button|\/docs/)
    getContexts()[0].goals[0].options.scenario = 'A pinned scenario'
    assert(compile(getContexts())[0].goals[0].scenario).toEqual({ text: 'A pinned scenario', rule: 'author scenario override' })
  })
  it('records all goal shapes and warns for issues-only exploration', () => {
    context({ users: 'people', purpose: 'finish my work' }, () => {
      goal('finish', () => outcome(({ page }) => expect(page.url()).toContain('/')))
      goal('explore', { minutes: 5 })
      goal('finish a plan', () => { task('click the Docs link and open getting started'); task('understand what ui-tests does and start'); outcome(({ page }) => expect(page.url()).toContain('/')) })
    })
    assert(compile(getContexts())[0].goals.map(g => g.shape)).toEqual(['outcome', 'exploration', 'steps'])
    assert(compile(getContexts())[0].goals[1].resultSentence).toBeNull()
    assert(lint(getContexts())).toEqual([assert.objectContaining({ severity: 'warning', rule: 'outcome-required' })])
  })
  it('fails each required lint example with rule, reason, source and fix', () => {
    context({ users: 'people', purpose: 'use ui-tests' }, () => {
      goal('click the Docs link and open getting started', () => outcome(() => {}))
      goal('understand what ui-tests does and start', () => outcome(() => {}))
    })
    const diagnostics = lint(getContexts())
    assert(diagnostics.map(d => d.rule)).toEqual(assert.arrayContaining(['goal-no-interface', 'outcome-strength', 'person-purpose']))
    assert(diagnostics.every(d => d.reason && d.source && d.fix && d.severity === 'error')).toBe(true)
  })
  it('rejects duplicate outcomes and contexts of 30 minutes or more', () => {
    context({ users: 'people', purpose: 'finish my work' }, () => { goal('finish', { minutes: 30 }, () => { outcome(() => {}); outcome(() => {}) }) })
    assert(lint(getContexts()).map(d => d.rule)).toEqual(['one-outcome', 'under-30-minutes'])
  })
})
/** Matches any string. */
function expectString() { return assert.any(String) }
describe('storage, verification and participant boundary', () => {
  it('persists runs, attempts, events and snapshots; validates tokens', async () => {
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(compile(authored())[0]); run.snapshot = { url: 'http://localhost:3000/docs/getting-started', dom: '<main><h1>Ready</h1></main>' }; run.reason = 'done'
      store.update(run); store.append(run.id, [{ type: 'url', at: 42, url: run.snapshot.url }])
      assert(store.authorize(run.id, run.token)?.id).toBe(run.id)
      assert(store.authorize(run.id, 'invalid')).toBeUndefined()
      assert(store.events(run.id)).toHaveLength(1)
      assert(store.db.prepare('SELECT rehearsal FROM attempts').get()).toEqual({ rehearsal: 1 })
      assert(store.db.prepare('SELECT url FROM snapshots').get()).toEqual({ url: run.snapshot.url })
      assert(await verify(store.get(run.id)!, getContexts()[0].goals[0])).toMatchObject({ status: 'correct' })
      const view = JSON.stringify(participantView(run))
      assert(view).not.toMatch(/happyPath|expected|outcomes|\/docs\/getting-started|ui-tests/)
    } finally { store.close() }
  })
  it('produces expected/actual URL diffs, gave-up failures, and missing-evidence unknown', async () => {
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(compile(authored({ happyPath: ['/', '/wrong'] }))[0]); const g = getContexts()[0].goals[0]
      assert(await verify(run, g)).toMatchObject({ status: 'unknown' })
      run.snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main />' }; run.reason = 'done'
      assert(await verify(run, g)).toMatchObject({ status: 'incorrect', diff: { expected: '/wrong', actual: run.snapshot.url } })
      run.reason = 'gave up'
      assert(await verify(run, g)).toMatchObject({ status: 'incorrect', reason: 'Terminal reason: gave up' })
      run.seq = 2
      const found = issues(run, [{ type: 'click', at: 123, url: run.snapshot.url, target: 'div#inert', changed: false }, { type: 'url', at: 124, url: 'http://localhost/elsewhere' }, { type: 'pause', at: 125, url: run.snapshot.url, duration: 5100 }])
      assert(found.map(i => i.kind)).toEqual(['gave up', 'dead click', 'deviation', 'pause', 'low SEQ'])
      assert(found[1]).toMatchObject({ at: 123, detail: assert.stringContaining('div#inert') })
    } finally { store.close() }
  })
  it('atomically rejects stale verification without overwriting submitted answers or attempt evidence', () => {
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(compile(authored())[0]); run.status = 'questions'; store.update(run)
      const previous = store.get(run.id)!
      const verifying = structuredClone(previous); verifying.result = { status: 'correct' }
      run.status = 'finished'; run.answers = { 'Which plan?': 'April' }; run.seq = 3
      run.snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main>Ready</main>' }
      store.update(run)
      assert(store.update(verifying, previous)).toBe(false)
      assert(store.get(run.id)).toMatchObject({ status: 'finished', answers: run.answers, seq: 3, snapshot: run.snapshot })
      assert(store.db.prepare('SELECT data FROM attempts').get()).toEqual({ data: assert.stringContaining('"seq":3') })
      assert(store.db.prepare('SELECT dom FROM snapshots').get()).toEqual({ dom: run.snapshot.dom })
      const latest = store.get(run.id)!
      assert(store.update({ ...latest, result: { status: 'correct' } }, latest)).toBe(true)
      assert(store.get(run.id)?.result).toEqual({ status: 'correct' })
    } finally { store.close() }
  })
  it('queries the stored DOM and asks a validation question without leaking its answer', async () => {
    context({ users: 'people', purpose: 'finish my work' }, () => goal('finish', () => outcome(async ({ page, participant }) => {
      expect(page.query('h1')?.textContent).toBe('Ready')
      expect(await participant.answer('Which plan?', { choices: ['April', 'May'], expected: 'April' })).toBe('April')
    })))
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(compile(getContexts())[0]); run.snapshot = { url: 'http://localhost/', dom: '<h1>Ready</h1>' }
      run.result = await verify(run, getContexts()[0].goals[0])
      assert(run.result).toMatchObject({ status: 'unknown', question: { expected: 'April' } })
      assert(participantView(run).validation).toEqual({ question: 'Which plan?', choices: ['April', 'May'] })
      run.answers = { 'Which plan?': 'April' }
      assert(await verify(run, getContexts()[0].goals[0])).toMatchObject({ status: 'correct' })
    } finally { store.close() }
  })
  it('rejects unauthorized and cross-origin collector writes', async () => {
    const handler = createCollector(() => new SQLiteAdapter(':memory:'))
    assert((await handler(new Request('http://localhost/api/ui-tests'))).status).toBe(401)
    assert((await handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://evil.test' }, body: '{}' }))).status).toBe(403)
  })
  it('does not let an overlapping recorder request restore an ended attempt to active', async () => {
    const store = new SQLiteAdapter(':memory:')
    const close = vi.spyOn(store, 'close').mockImplementation(() => {})
    try {
      const run = store.create(compile(authored())[0]); run.status = 'active'; store.update(run)
      const handler = createCollector(() => store)
      const headers = { origin: 'http://localhost', cookie: `ui-tests-run=${run.id}.${run.token}` }
      const recorder = new Request('http://localhost/api/ui-tests', { method: 'POST', headers, body: '{}' })
      let release!: (value: unknown) => void
      vi.spyOn(recorder, 'json').mockReturnValue(new Promise(resolve => { release = resolve }))
      const pending = handler(recorder)
      const snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main>Ready</main>' }
      assert((await handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers, body: JSON.stringify({ action: 'end', reason: 'done', snapshot }) }))).status).toBe(200)
      release({ action: 'events', events: [{ type: 'url', at: Date.now(), url: snapshot.url }] })
      assert((await pending).status).toBe(409)
      assert(store.get(run.id)).toMatchObject({ status: 'questions', reason: 'done', snapshot })
      assert(store.events(run.id)).toEqual([])
    } finally { close.mockRestore(); store.close() }
  })
})
it('keeps README, landing context and rendered copy word-for-word aligned', async () => {
  const readme = await readFile('README.md', 'utf8')
  function strings(value: unknown): string[] {
    if (typeof value === 'string') return [value]
    return Object.values(value as Record<string, unknown>).flatMap(strings)
  }
  for (const text of strings(siteCopy)) assert(readme).toContain(text)
  assert((await readFile('apps/web/landing.ui.test.ts', 'utf8')).trim()).toBe(siteCopy.example)
  assert(readme).not.toMatch(/\b(?:pass|compliant|certified)\b|%|!/i)
  assert(strings(siteCopy).join('\n')).not.toMatch(/\b(?:pass|compliant|certified)\b|%|!|synthetic users|AI participants|agent runs|hosted track/i)
})
