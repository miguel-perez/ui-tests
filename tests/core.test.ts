import { describe, it, expect as assert, beforeEach, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { context, goal, task, outcome, expect, getContexts, resetContexts } from '../packages/ui-tests/src/index'
import { compile, compileFile, lint, generateTemplate, sentence, sampleSize } from '../packages/ui-tests/src/compiler'
import { deriveScreener, inferScreen, recencyBands } from '../packages/ui-tests/src/screener'
import { SQLiteAdapter, recordingRetentionMs } from '../packages/ui-tests/src/storage'
import { verify, issues } from '../packages/ui-tests/src/verify'
import { participantView, createCollector, maxAudioBytes } from '../packages/ui-tests/src/server'
import * as siteCopy from '../apps/web/lib/copy'
import { renderTrace } from '../packages/ui-tests/src/trace'

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
    // The screen rules are covered on their own below; this test is about the goal shapes.
    assert(lint(getContexts()).filter(d => !d.rule.startsWith('screen-'))).toEqual([assert.objectContaining({ severity: 'warning', rule: 'outcome-required' })])
  })
  it('fails each required lint example with rule, reason, source and fix', () => {
    context({ users: 'people', purpose: 'use ui-tests' }, () => {
      goal('click the Docs link and open getting started', () => outcome(() => {}))
      goal('understand what ui-tests does and start', () => outcome(() => {}))
    })
    const diagnostics = lint(getContexts()).filter(d => !d.rule.startsWith('screen-'))
    assert(diagnostics.map(d => d.rule)).toEqual(assert.arrayContaining(['goal-no-interface', 'outcome-strength', 'person-purpose']))
    assert(diagnostics.every(d => d.reason && d.source && d.fix && d.severity === 'error')).toBe(true)
  })
  it('rejects duplicate outcomes and contexts of 30 minutes or more', () => {
    context({ users: 'people', purpose: 'finish my work' }, () => { goal('finish', { minutes: 30 }, () => { outcome(() => {}); outcome(() => {}) }) })
    assert(lint(getContexts()).map(d => d.rule).filter(rule => !rule.startsWith('screen-'))).toEqual(['one-outcome', 'under-30-minutes'])
  })
})
describe('the screen block', () => {
  const invite = { did: 'signed up for a tool to plan work with a team', within: '7 days', uses: ['Trello', 'Asana', 'Notion', 'Linear'], not: ['has used Weekboard'] }
  it('is validated by the compiler and accepted without lint errors', () => {
    context({ users: 'people who signed up this week and want a colleague on their board', purpose: 'plan the week together', screen: invite }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).filter(d => d.rule.startsWith('screen-'))).toEqual([])
    const [c] = compile(getContexts())
    assert(c.screener).toMatchObject({ source: 'authored', inferred: [] })
    resetContexts()
    context({ users: 'people', purpose: 'plan the week together', screen: { within: 'soon', where: ['usa'], age: { min: 40, max: 30 }, extra: true } as never }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const invalid = lint(getContexts()).find(d => d.rule === 'screen-valid')!
    assert(invalid.severity).toBe('error')
    assert(invalid.reason).toMatch(/within/); assert(invalid.reason).toMatch(/where/); assert(invalid.reason).toMatch(/age/); assert(invalid.reason).toMatch(/extra/)
    assert(() => compile(getContexts())).toThrow()
  })
  it('derives a funnel with the originating field and rule beside every question, and filters that are never asked', () => {
    const screener = deriveScreener({ ...invite, often: 'weekly', role: ['developer'], where: ['US', 'GB'], language: 'en', age: { min: 18, max: 65 } })
    assert(screener.questions.map(q => q.field)).toEqual(['did', 'often', 'role', 'role', 'uses', 'not'])
    assert(screener.questions.every(q => q.rule.length > 20 && q.options.length >= 3)).toBe(true)
    const [recency] = screener.questions
    assert(recency.question).toBe('When was the last time you signed up for a tool to plan work with a team?')
    assert(recency.options.map(o => o.label)).toEqual(['accept', 'reject', 'reject', 'reject', 'reject'])
    assert(recency.options[0].text).toBe('Within the last 7 days')
    assert(recency.options[1].text).toBe('More than 7 days ago, up to 1 month ago')
    const uses = screener.questions.find(q => q.field === 'uses')!
    assert(uses.options.filter(o => o.label === 'reject').map(o => o.text)).toEqual(['Plandrift', 'None of the above'])
    const not = screener.questions.find(q => q.field === 'not')!
    assert(not.options.filter(o => o.label === 'reject').map(o => o.text)).toEqual(['I have used Weekboard', 'I work in UX, design, marketing or market research'])
    assert(not.options.some(o => o.label === 'may-select')).toBe(true)
    assert(screener.questions.find(q => q.field === 'often')!.options.map(o => o.label)).toEqual(['accept', 'accept', 'reject', 'reject', 'reject'])
    assert(screener.filters.map(f => [f.filter, f.value])).toEqual([['country', 'US'], ['country', 'GB'], ['language', 'en'], ['age', '18 to 65'], ['previous-studies', 'exclude people who took part in an earlier run of this context']])
    assert(screener.questions.some(q => /country|language|age/i.test(q.question))).toBe(false)
  })
  it('keeps recency bands non-overlapping for every window', () => {
    for (const within of ['1 day', '7 days', '2 weeks', '1 month', '3 months', '6 months', '1 year', '2 years']) {
      const bands = recencyBands(within)
      assert(bands[0]).toEqual({ text: `Within the last ${within}`, label: 'accept' })
      assert(bands.at(-1)).toEqual({ text: 'Never', label: 'reject' })
      for (let i = 1; i < bands.length - 2; i++) assert(bands[i].text.startsWith(`More than ${bands[i - 1].text.replace(/^Within the last |^More than .* ago, up to | ago$/g, '')}`)).toBe(true)
    }
  })
  it('drafts an inferred screen from the users sentence and lint prints it as TypeScript', () => {
    assert(inferScreen('people who signed up this week and want a colleague on their board')).toEqual({ screen: { did: 'signed up', within: '7 days' }, inferred: ['did', 'within'] })
    assert(inferScreen('developers who ship UI and have no researcher').screen.did).toBe('shipped UI')
    context({ users: 'people who signed up this week and want a colleague on their board', purpose: 'plan the week together' }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const draft = lint(getContexts()).find(d => d.rule === 'screen-inferred')!
    assert(draft.severity).toBe('warning')
    assert(draft.draft).toBe("screen: {\n  did: 'signed up', // inferred\n  within: '7 days', // inferred\n},")
    assert(compile(getContexts())[0].screener).toMatchObject({ source: 'inferred', inferred: ['did', 'within'] })
    resetContexts()
    context({ users: 'accountants', purpose: 'close the month' }, () => goal('close the month', () => outcome(({ page }) => expect(page.url()).toContain('/'))))
    assert(lint(getContexts()).map(d => d.rule)).toEqual(['screen-inferred', 'screen-did'])
  })
  it('compiles both example files on the pages with their screen blocks', async () => {
    const result = await compileFile('apps/web/landing.ui.test.ts', '.ui-tests/compiled-test')
    assert(result.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    assert(result.compiled[0].screener).toMatchObject({ source: 'authored', screen: { did: 'shipped a user interface you built yourself', within: '3 months', role: ['developer', 'designer', 'founder'], not: ['works in UX research'] } })
    for (const file of [siteCopy.example, siteCopy.inviteExample]) assert(file).toMatch(/\n  screen: \{\n    did: '[^']+',\n    within: '\d+ (days|months)',\n/)
  })
})
/** Matches any string. */
function expectString() { return assert.any(String) }
describe('storage, verification and participant boundary', () => {
  it('accepts optional words with answers, persists them and escapes them in the trace', async () => {
    const store = new SQLiteAdapter(':memory:')
    const close = vi.spyOn(store, 'close').mockImplementation(() => {})
    try {
      const run = store.create(compile(authored())[0]); run.status = 'questions'; store.update(run)
      const handler = createCollector(() => store)
      const send = (words?: unknown) => handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://localhost', cookie: `ui-tests-run=${run.id}.${run.token}` }, body: JSON.stringify({ action: 'questions', seq: 3, confidence: 2, words }) }))
      assert((await send(42)).status).toBe(400)
      assert((await send('x'.repeat(5001))).status).toBe(400)
      const words = '<script>alert(1)</script>\nShare seemed like the place for people.'
      assert((await send(words)).status).toBe(200)
      const saved = store.get(run.id)!
      assert(saved).toMatchObject({ seq: 3, confidence: 2, words, status: 'finished' })
      assert(renderTrace(saved, [])).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
      assert(participantView(saved)).not.toHaveProperty('words')
      assert((await send()).status).toBe(200)
    } finally { close.mockRestore(); store.close() }
  })
  it('keeps a spoken answer, its audio and its transcript with the attempt, and shows them in the trace', async () => {
    const store = new SQLiteAdapter(':memory:')
    const close = vi.spyOn(store, 'close').mockImplementation(() => {})
    try {
      const run = store.create(compile(authored())[0])
      assert(participantView(run).recording).toEqual({ events: true, screen: false, voice: false, webcam: false })
      run.status = 'questions'; store.update(run)
      const handler = createCollector(() => store)
      const post = (body: unknown) => handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://localhost', cookie: `ui-tests-run=${run.id}.${run.token}` }, body: JSON.stringify(body) }))
      const audio = Buffer.from('fake opus audio').toString('base64')
      const voice = { action: 'voice', question: 'words', mime: 'audio/webm', audio, transcript: 'Share seemed like the place for people.', seconds: 4.2 }
      assert((await post({ ...voice, mime: 'text/html' })).status).toBe(400)
      assert((await post({ ...voice, audio: 'not base64!' })).status).toBe(400)
      assert((await post({ ...voice, question: 'seq' })).status).toBe(400)
      assert((await post({ ...voice, audio: Buffer.alloc(maxAudioBytes + 3).toString('base64') })).status).toBe(400)
      const response = await post(voice)
      assert(response.status).toBe(200)
      assert((await response.json()).recording).toEqual({ events: true, screen: false, voice: true, webcam: false })
      const first = store.get(run.id)!.voice![0].recording
      // Recording again replaces the earlier answer for the same question and deletes its audio.
      assert((await post({ ...voice, transcript: 'Share seemed like the place for people. <b>really</b>' })).status).toBe(200)
      assert(store.recording(first)).toBeUndefined()
      assert(store.db.prepare('SELECT COUNT(*) AS n FROM recordings').get()).toEqual({ n: 1 })
      assert((await post({ action: 'questions', seq: 3, uxLite: { ease: 2, usefulness: 4 }, words: 'Share seemed like the place for people.' })).status).toBe(200)
      const saved = store.get(run.id)!
      assert(saved.voice).toHaveLength(1)
      assert(saved.voice![0]).toMatchObject({ question: 'words', transcript: 'Share seemed like the place for people. <b>really</b>', mime: 'audio/webm', seconds: 4.2 })
      assert(store.recording(saved.voice![0].recording)!.audio.toString()).toBe('fake opus audio')
      assert(saved).toMatchObject({ seq: 3, uxLite: { ease: 2, usefulness: 4 }, status: 'finished' })
      assert(saved.confidence).toBeUndefined()
      const trace = renderTrace(saved, [], store)
      assert(trace).toContain('voice recorded, consent given when they chose to talk')
      assert(trace).toContain('&lt;b&gt;really&lt;/b&gt;')
      assert(trace).toContain(`src="data:audio/webm;base64,${audio}"`)
      assert(trace).toContain('Confidence: not asked')
      // Voice is only taken while the questions are open: never after the answers are sent.
      assert((await post(voice)).status).toBe(409)
      // Withdrawal deletes every recording for the run and marks the attempt withdrawn; voice is refused afterwards.
      const kept = saved.voice![0].recording
      assert((await post({ action: 'withdraw' })).status).toBe(200)
      assert(store.recording(kept)).toBeUndefined()
      assert(store.db.prepare('SELECT COUNT(*) AS n FROM recordings').get()).toEqual({ n: 0 })
      const withdrawn = store.get(run.id)!
      assert(withdrawn.withdrawnAt).toEqual(assert.any(Number))
      assert(withdrawn.voice).toBeUndefined()
      assert(withdrawn.recording?.voice).toBe(false)
      assert(store.db.prepare('SELECT data FROM attempts').get()).toEqual({ data: assert.stringContaining('"withdrawnAt"') })
      assert(renderTrace(withdrawn, [], store)).toContain('their recordings were deleted')
      // Withdrawal is final: no other action may write to the attempt afterwards.
      for (const action of [{ action: 'begin' }, { action: 'events', events: [] }, { action: 'extend' }, { action: 'end', reason: 'done', snapshot: { url: 'http://localhost/', dom: '' } }, { action: 'questions', seq: 5 }, voice]) assert((await post(action)).status).toBe(409)
      assert(store.get(run.id)!).toEqual(withdrawn)
      assert(store.db.prepare('SELECT COUNT(*) AS n FROM recordings').get()).toEqual({ n: 0 })
      // Withdrawing before consent leaves the run created, and consent is still refused without a cookie.
      const early = store.create(compile(authored())[0])
      const send = (body: unknown, cookie?: string) => handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://localhost', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }))
      assert((await send({ action: 'withdraw' }, `ui-tests-run=${early.id}.${early.token}`)).status).toBe(200)
      const refused = await send({ action: 'consent', id: early.id, token: early.token })
      assert(refused.status).toBe(409)
      assert(refused.headers.get('set-cookie')).toBeNull()
      assert(store.get(early.id)!.status).toBe('created')
    } finally { close.mockRestore(); store.close() }
  })
  it('deletes recordings past the 90-day retention default', async () => {
    const store = new SQLiteAdapter(':memory:')
    const close = vi.spyOn(store, 'close').mockImplementation(() => {})
    try {
      const run = store.create(compile(authored())[0])
      const old = store.saveRecording(run.id, 'audio/webm', Buffer.from('old'))
      const recent = store.saveRecording(run.id, 'audio/webm', Buffer.from('recent'))
      store.db.prepare('UPDATE recordings SET created_at=? WHERE id=?').run(Date.now() - recordingRetentionMs - 1000, old)
      await createCollector(() => store)(new Request('http://localhost/api/ui-tests', { headers: { cookie: `ui-tests-run=${run.id}.${run.token}` } }))
      assert(store.recording(old)).toBeUndefined()
      assert(store.recording(recent)!.audio.toString()).toBe('recent')
    } finally { close.mockRestore(); store.close() }
  })
  it('deletes expired recordings whenever the database is opened, without a collector request', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'ui-tests-retention-')), 'dev.sqlite')
    const first = new SQLiteAdapter(file)
    const run = first.create(compile(authored())[0])
    const old = first.saveRecording(run.id, 'audio/webm', Buffer.from('old'))
    first.db.prepare('UPDATE recordings SET created_at=?').run(Date.now() - recordingRetentionMs - 1000)
    first.close()
    const reopened = new SQLiteAdapter(file)
    try { assert(reopened.recording(old)).toBeUndefined() } finally { reopened.close() }
  })
  it('gives more time once, records an early abandonment apart from giving up, and asks confidence only when unverifiable', async () => {
    const store = new SQLiteAdapter(':memory:')
    const close = vi.spyOn(store, 'close').mockImplementation(() => {})
    try {
      const run = store.create(compile(authored())[0]); run.status = 'active'; store.update(run)
      const handler = createCollector(() => store)
      const post = (body: unknown) => handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://localhost', cookie: `ui-tests-run=${run.id}.${run.token}` }, body: JSON.stringify(body) }))
      const before = participantView(store.get(run.id)!)
      assert(before).toMatchObject({ extended: false, askConfidence: false, sequence: { index: 1, total: 1 } })
      const extended = await post({ action: 'extend' })
      assert(extended.status).toBe(200)
      assert((await extended.json()).timeout).toBe(before.timeout + 90)
      assert((await post({ action: 'extend' })).status).toBe(409)
      assert((await post({ action: 'end', reason: 'abandoned early', snapshot: { url: 'http://localhost/', dom: '<main />' } })).status).toBe(200)
      const ended = store.get(run.id)!
      assert(ended.reason).toBe('abandoned early')
      assert(await verify(ended, getContexts()[0].goals[0])).toMatchObject({ status: 'incorrect', reason: 'Terminal reason: abandoned early' })
      assert(issues(ended, []).map(i => i.kind)).toEqual(['abandoned early'])
      resetContexts()
      context({ users: 'people', purpose: 'finish my work' }, () => goal('explore', { minutes: 2 }))
      assert(participantView(store.create(compile(getContexts())[0])).askConfidence).toBe(true)
    } finally { close.mockRestore(); store.close() }
  })
  it('renders the screener as an editable table with each field and rule', () => {
    const store = new SQLiteAdapter(':memory:')
    try {
      const html = renderTrace(store.create(compile(authored())[0]), [])
      assert(html).toContain('<h2>Screener</h2>')
      assert(html).toContain('Drafted from the users sentence. Inferred: within.')
      assert(html).toMatch(/<input[^>]+aria-label="Question 1"/)
      assert(html).toContain('standing exclusion of people who work in UX, marketing or research')
      assert(html).toContain('within: &#x27;3 months&#x27;, // inferred')
    } finally { store.close() }
  })
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
  assert(readme).not.toMatch(/\b(?:compliant|certified)\b|synthetic users|AI participants/i)
  assert(readme).toContain('Agent runs are never counted with people and never described as people.')
  assert(strings(siteCopy).join('\n')).toContain('There is no score and no pass.')
})
