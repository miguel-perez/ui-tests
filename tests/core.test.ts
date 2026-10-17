import { describe, it, expect as assert, beforeEach, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { context, beforeEach as fixture, goal, task, outcome, expect, getContexts, resetContexts, resolveFixtures } from '../packages/ui-tests/src/index'
import { compile, compileFile, lint, generateTemplate, sentence, sampleSize, deriveScenario, codeImpression, recordingLine, plan } from '../packages/ui-tests/src/compiler'
import { deriveScreener, inferFacts, recencyBands, screenerScreens } from '../packages/ui-tests/src/screener'
import { exampleFile } from '../packages/ui-tests/src/example'
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
    assert(c.goals[0]).toMatchObject({ shape: 'happy-path', timeBox: { seconds: 180 }, sample: { planned: 5 }, resultSentence: 'Rehearsal: 0 of 5 planned attempts recorded.' })
    assert(c.impression).toMatchObject({ page: '/', question: 'What was that page for?', codedAgainst: 'purpose', rule: expectString() })
    assert(c.impression).not.toHaveProperty('distractors')
    const fit = c.screener.questions.filter(q => q.field === 'purpose')
    assert(fit.map(q => q.question)).toEqual(['When did you last need to find out whether people can use what I built?', 'How do you do it today?', 'How much does it matter to you to get this right?'])
    assert(fit.every(q => q.rule)).toBe(true)
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
    assert(lint(getContexts()).filter(d => !d.rule.startsWith('users-'))).toEqual([assert.objectContaining({ severity: 'warning', rule: 'outcome-required' })])
  })
  it('fails each required lint example with rule, reason, source and fix', () => {
    context({ users: 'people', purpose: 'use ui-tests' }, () => {
      goal('click the Docs link and open getting started', () => outcome(() => {}))
      goal('understand what ui-tests does and start', () => outcome(() => {}))
    })
    const diagnostics = lint(getContexts()).filter(d => !d.rule.startsWith('users-'))
    assert(diagnostics.map(d => d.rule)).toEqual(assert.arrayContaining(['goal-no-interface', 'outcome-strength', 'person-purpose']))
    assert(diagnostics.every(d => d.reason && d.source && d.fix && d.severity === 'error')).toBe(true)
  })
  it('rejects duplicate outcomes and contexts of 30 minutes or more', () => {
    context({ users: 'people', purpose: 'finish my work' }, () => { goal('finish', { minutes: 30 }, () => { outcome(() => {}); outcome(() => {}) }) })
    assert(lint(getContexts()).map(d => d.rule).filter(rule => !rule.startsWith('users-'))).toEqual(['one-outcome', 'under-30-minutes'])
  })
})
describe('users, video, start and the first impression', () => {
  const invite = { are: 'people who signed up this week and want a colleague on their board', did: 'signed up for a tool to plan work with a team', within: '7 days', uses: ['Trello', 'Asana', 'Notion', 'Linear'], not: ['has used Weekboard'] }
  const purpose = 'plan the week together without emailing screenshots around'
  it('takes users as an object with how to check it, validated by the compiler, without lint errors', () => {
    context({ users: invite, purpose }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).filter(d => d.rule.startsWith('users-'))).toEqual([])
    const [c] = compile(getContexts())
    assert(c.users).toBe(invite.are)
    assert(c.screener).toMatchObject({ source: 'authored', inferred: [], facts: { did: invite.did, within: '7 days' } })
    assert(c.screener.facts).not.toHaveProperty('are')
    resetContexts()
    context({ users: { are: 'people', within: 'soon', where: ['usa'], age: { min: 40, max: 30 }, extra: true } as never, purpose }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const invalid = lint(getContexts()).find(d => d.rule === 'users-valid')!
    assert(invalid.severity).toBe('error')
    assert(invalid.reason).toMatch(/within/); assert(invalid.reason).toMatch(/where/); assert(invalid.reason).toMatch(/age/); assert(invalid.reason).toMatch(/extra/)
    assert(() => compile(getContexts())).toThrow()
    // The separate screen key and record: 'screen' are gone, and lint says where their fields went.
    resetContexts()
    context({ users: 'people', purpose, screen: { did: 'paid for software' }, record: 'screen' } as never, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const rules = lint(getContexts()).filter(d => d.severity === 'error').map(d => d.rule)
    assert(rules).toEqual(assert.arrayContaining(['users-removed', 'video-removed']))
    resetContexts()
    context({ users: { did: 'paid' } as never, purpose }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).map(d => d.rule)).toContain('users-valid')
  })
  it('derives the six screens the person sees from users and purpose, in the artefact\'s words, without labels or rules', () => {
    const screener = deriveScreener(invite, purpose)
    const screens = screenerScreens(screener)
    assert(screens.map(s => s.question)).toEqual(['When did you last sign up for a tool to plan work with a team?', 'Which of these do you use to plan work? Pick all that apply.', 'Which of these have you done? Pick all that apply.', 'When did you last need to plan the week together?', 'How do you do it today?', 'How much does it matter to you to get this right?'])
    assert(screens[0].options).toEqual(['In the past week', 'In the past month', 'Earlier this year', "I haven't"])
    assert(screens[1]).toMatchObject({ kind: 'multi', options: ['Trello', 'Asana', 'Notion', 'Linear', 'Basecamp', 'None of these'] })
    assert(screens[2].options).toEqual(['Managed a team of more than five', 'Used Weekboard', 'Taken a course on planning or project management', 'Worked in UX, design, marketing or market research', 'None of these'])
    assert(JSON.stringify(screens)).not.toMatch(/accept|reject|may-select|rule|NN\/g/)
    assert(screener.questions[0].options.map(o => o.label)).toEqual(['accept', 'reject', 'reject', 'reject'])
    assert(screener.questions[2].options.filter(o => o.label === 'reject').map(o => o.text)).toEqual(['Used Weekboard', 'Worked in UX, design, marketing or market research'])
    const funnel = deriveScreener({ ...invite, often: 'weekly', role: ['developer'], where: ['US', 'GB'], language: 'en', age: { min: 18, max: 65 } }, purpose)
    assert(funnel.questions.map(q => q.field)).toEqual(['did', 'often', 'role', 'role', 'uses', 'not', 'purpose', 'purpose', 'purpose'])
    assert(funnel.questions.every(q => q.rule.length > 20 && q.options.length >= 3)).toBe(true)
    assert(funnel.questions.find(q => q.field === 'often')!.options.map(o => o.label)).toEqual(['accept', 'accept', 'reject', 'reject', 'reject'])
    assert(funnel.filters.map(f => [f.filter, f.value])).toEqual([['country', 'US'], ['country', 'GB'], ['language', 'en'], ['age', '18 to 65'], ['previous-studies', 'exclude people who took part in an earlier run of this context']])
    assert(funnel.questions.some(q => /country|language|age/i.test(q.question))).toBe(false)
  })
  it('keeps recency bands in plain words, widening from the window, ending with I haven\'t', () => {
    for (const within of ['1 day', '7 days', '2 weeks', '1 month', '3 months', '6 months', '1 year', '2 years']) {
      const bands = recencyBands(within)
      assert(bands[0].label).toBe('accept')
      assert(bands.slice(1).every(b => b.label === 'reject')).toBe(true)
      assert(bands.at(-1)).toEqual({ text: "I haven't", label: 'reject' })
      assert(new Set(bands.map(b => b.text)).size).toBe(bands.length)
    }
    assert(recencyBands('3 months').map(b => b.text)).toEqual(['In the past three months', 'In the past year', 'Longer ago', "I haven't"])
  })
  it('drafts users from the sentence alone, and lint prints the users object to paste in', () => {
    assert(inferFacts(invite.are)).toEqual({ facts: { did: 'signed up', within: '7 days' }, inferred: ['did', 'within'] })
    assert(inferFacts('developers who ship UI and have no researcher').facts.did).toBe('shipped UI')
    context({ users: invite.are, purpose }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const draft = lint(getContexts()).find(d => d.rule === 'users-inferred')!
    assert(draft.severity).toBe('warning')
    assert(draft.draft).toBe("users: {\n  are: 'people who signed up this week and want a colleague on their board',\n  did: 'signed up', // inferred\n  within: '7 days', // inferred\n},")
    assert(compile(getContexts())[0].screener).toMatchObject({ source: 'inferred', inferred: ['did', 'within'] })
    resetContexts()
    context({ users: 'accountants', purpose: 'close the month' }, () => goal('close the month', () => outcome(({ page }) => expect(page.url()).toContain('/'))))
    assert(lint(getContexts()).map(d => d.rule)).toEqual(['users-inferred', 'users-did'])
  })
  it('records event replay unless video: true adds the screen, the prompt and the 1.5× incentive, and prints the level in the plan', () => {
    context({ users: invite, purpose }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    context({ users: invite, purpose, video: true }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const [events, video] = compile(getContexts())
    assert(events.recording).toMatchObject({ video: false, level: 'event replay', incentive: 1 })
    assert(video.recording).toMatchObject({ video: true, level: 'event replay and screen video', incentive: 1.5 })
    assert(plan([events])).toContain(recordingLine(false))
    assert(plan([video])).toContain('Recording: event replay (what people do on the page) and screen video (video: true')
    assert(recordingLine(false)).toContain('Add video: true')
    resetContexts()
    context({ users: invite, purpose, video: 'yes' as never }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).map(d => d.rule)).toContain('video-boolean')
  })
  it('starts each goal at its start, else the first page of its happy path, else the root, and flashes the first goal\'s start unless impression names a page', () => {
    context({ users: invite, purpose }, () => {
      goal('invite a colleague', { happyPath: ['/board', '/settings/members'] }, () => outcome(({ page }) => expect(page.url()).toContain('/members')))
      goal('rename the board', { start: '/settings', happyPath: ['/board', '/settings'] }, () => outcome(({ page }) => expect(page.url()).toContain('/settings')))
      goal('find a card', () => outcome(({ page }) => expect(page.url()).toContain('/board')))
    })
    const [c] = compile(getContexts())
    assert(c.goals.map(g => g.start.path)).toEqual(['/board', '/settings', '/'])
    assert(c.impression?.page).toBe('/board')
    resetContexts()
    context({ users: invite, purpose, impression: { page: 'https://weekboard.app/' } }, () => goal('invite a colleague', { start: '/board' }, () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(compile(getContexts())[0].impression?.page).toBe('https://weekboard.app/')
    resetContexts()
    context({ users: invite, purpose, impression: false }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(compile(getContexts())[0].impression).toBeNull()
    resetContexts()
    context({ users: invite, purpose, impression: { page: 'board' } }, () => goal('invite a colleague', { start: 'board' }, () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).map(d => d.rule)).toEqual(assert.arrayContaining(['impression-page', 'start-path']))
    // Anything else under impression is a lint error with a fix, never a crash in the compiler.
    for (const impression of [true, { page: '/', flash: 300 }]) {
      resetContexts()
      context({ users: invite, purpose, impression: impression as never }, () => goal('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
      assert(lint(getContexts()).filter(d => d.severity === 'error').map(d => d.rule)).toEqual(['impression-valid'])
    }
  })
  it('codes an open impression answer against the purpose, with the words that matched and how the code was made', () => {
    assert(codeImpression('A board to plan the week with your team', purpose)).toMatchObject({ code: 'named the purpose', matched: ['plan', 'week'], proposedBy: expectString() })
    assert(codeImpression('Some kind of to-do list', purpose)).toMatchObject({ code: 'did not name it', matched: [] })
    assert(codeImpression('   ', purpose).code).toBe('no answer')
    // The "without…" clause is not the purpose: naming screenshots alone is not naming it.
    assert(codeImpression('emailing screenshots', purpose).code).toBe('did not name it')
  })
  it('writes the card from users, purpose, the goal and beforeEach, never the path', async () => {
    assert(deriveScenario(invite.are, purpose, 'invite a colleague', { colleague: 'Sam', email: 'sam@acme.co' })).toBe("You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.")
    assert(deriveScenario('developers', 'ship', 'start', {})).toBeUndefined()
    context({ users: invite, purpose }, () => { fixture(async () => ({ colleague: 'Sam', email: 'sam@acme.co' })); goal('invite a colleague', { happyPath: ['/board', '/settings/members'] }, () => outcome(({ page }) => expect(page.url()).toContain('/members'))) })
    await resolveFixtures(getContexts())
    const [c] = compile(getContexts())
    assert(c.goals[0].scenario.text).toBe("You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.")
    assert(c.goals[0].scenario.text).not.toMatch(/settings|members|\/board/)
  })
  it('compiles the file init writes and this site\'s own test, and the file reads its end state with page.textContent', async () => {
    const result = await compileFile('apps/web/landing.ui.test.ts', '.ui-tests/compiled-test')
    assert(result.diagnostics.filter(d => d.severity === 'error')).toEqual([])
    assert(result.compiled[0].screener).toMatchObject({ source: 'authored', facts: { did: 'shipped a user interface you built yourself', within: '3 months', role: ['developer', 'designer', 'founder'], not: ['works in UX research'] } })
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir('.ui-tests/example', { recursive: true })
    await writeFile('.ui-tests/example/invite.ui.test.ts', exampleFile)
    const invited = await compileFile('.ui-tests/example/invite.ui.test.ts', '.ui-tests/compiled-example')
    assert(invited.diagnostics).toEqual([])
    const [c] = invited.compiled
    assert(c.recording.video).toBe(true)
    assert(c.goals[0]).toMatchObject({ start: { path: '/board' }, sample: { planned: 5 }, scenario: { text: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co." } })
    assert(c.impression?.page).toBe('/board')
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(c); run.reason = 'done'
      run.snapshot = { url: 'http://localhost/settings/members', dom: '<main><p>1 invitation pending</p></main>' }
      assert(await verify(run, invited.authored[0].goals[0])).toMatchObject({ reached: 'yes' })
      run.snapshot = { url: 'http://localhost/settings/members', dom: '<main><p>2 invitations pending</p></main>' }
      assert(await verify(run, invited.authored[0].goals[0])).toMatchObject({ reached: 'no', diff: { expected: '1 invitation pending' } })
      run.snapshot = { url: 'http://localhost/settings/members', dom: '<div>nothing here</div>' }
      assert(await verify(run, invited.authored[0].goals[0])).toMatchObject({ reached: "couldn't tell" })
    } finally { store.close() }
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
      assert((await post({ action: 'questions', seq: 3, afterGoal: { ease: 2, usefulness: 4 }, words: 'Share seemed like the place for people.' })).status).toBe(200)
      const saved = store.get(run.id)!
      assert(saved.voice).toHaveLength(1)
      assert(saved.voice![0]).toMatchObject({ question: 'words', transcript: 'Share seemed like the place for people. <b>really</b>', mime: 'audio/webm', seconds: 4.2 })
      assert(store.recording(saved.voice![0].recording)!.audio.toString()).toBe('fake opus audio')
      assert(saved).toMatchObject({ seq: 3, afterGoal: { ease: 2, usefulness: 4 }, status: 'finished' })
      assert(saved.confidence).toBeUndefined()
      const trace = renderTrace(saved, [], store)
      assert(trace).toContain('voice, with consent given when they chose to talk')
      assert(trace).toContain('&lt;b&gt;really&lt;/b&gt;')
      assert(trace).toContain(`src="data:audio/webm;base64,${audio}"`)
      assert(trace).toContain('done it: not asked')
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
  it('takes the screener answers and the open impression answer after consent, codes the answer against the purpose, and never sends the code back', async () => {
    const store = new SQLiteAdapter(':memory:')
    const close = vi.spyOn(store, 'close').mockImplementation(() => {})
    try {
      const run = store.create(compile(authored())[0])
      const view = participantView(run)
      assert(view.screener.map(s => s.question)).toContain('When did you last need to find out whether people can use what I built?')
      assert(view.impression).toEqual({ page: '/', flashMs: 500, question: 'What was that page for?' })
      assert(view).toMatchObject({ start: '/', video: false, screened: false, impressed: false })
      const handler = createCollector(() => store)
      const post = (body: unknown) => handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://localhost', cookie: `ui-tests-run=${run.id}.${run.token}` }, body: JSON.stringify(body) }))
      // Before consent neither is taken.
      assert((await post({ action: 'impression', answer: 'x', spoken: false })).status).toBe(409)
      run.status = 'consented'; store.update(run)
      assert((await post({ action: 'screener', answers: [['In the past week']] })).status).toBe(200)
      const response = await post({ action: 'impression', answer: 'A way to find out whether people can use what you built', spoken: false })
      assert(response.status).toBe(200)
      const returned = await response.json()
      assert(returned).toMatchObject({ screened: true, impressed: true })
      assert(JSON.stringify(returned)).not.toMatch(/named the purpose|matched/)
      const saved = store.get(run.id)!
      assert(saved.screener).toEqual([['In the past week']])
      assert(saved.impression).toMatchObject({ answer: 'A way to find out whether people can use what you built', spoken: false, code: { code: 'named the purpose', proposedBy: expectString() } })
      // The trace shows the words, the proposed code as a choice a reviewer can change, and the purpose it was read against.
      const trace = renderTrace(saved, [])
      assert(trace).toContain('What was that page for?')
      assert(trace).toMatch(/<select aria-label="How the answer reads against the purpose">/)
      assert(trace).toContain('named the purpose')
      assert(trace).toContain('In the past week')
      // Each comes once: an identical retry after a lost response is accepted and changes nothing; different data is refused.
      assert((await post({ action: 'screener', answers: [['In the past week']] })).status).toBe(200)
      assert((await post({ action: 'screener', answers: [['In the past month']] })).status).toBe(409)
      assert((await post({ action: 'impression', answer: 'A way to find out whether people can use what you built', spoken: false })).status).toBe(200)
      assert((await post({ action: 'impression', answer: 'Something else', spoken: false })).status).toBe(409)
      assert((await post({ action: 'impression', answer: 'A way to find out whether people can use what you built', spoken: true })).status).toBe(409)
      assert(store.get(run.id)!).toMatchObject({ screener: [['In the past week']], impression: { answer: 'A way to find out whether people can use what you built', spoken: false } })
      assert((await post({ action: 'begin' })).status).toBe(200)
      assert((await post({ action: 'impression', answer: 'late', spoken: false })).status).toBe(409)
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
      assert((await extended.json()).timeBox).toBe(before.timeBox + 90)
      assert((await post({ action: 'extend' })).status).toBe(409)
      assert((await post({ action: 'end', reason: 'abandoned early', snapshot: { url: 'http://localhost/', dom: '<main />' } })).status).toBe(200)
      const ended = store.get(run.id)!
      assert(ended.reason).toBe('abandoned early')
      assert(await verify(ended, getContexts()[0].goals[0])).toMatchObject({ reached: 'no', reason: 'How it ended: left before trying' })
      assert(issues(ended, []).map(i => i.detail)).toEqual(['How it ended: left before trying'])
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
      assert(html).toContain('standing exclusion of people who work in UX, design, marketing or market research')
      assert(html).toContain('within: &#x27;3 months&#x27;, // inferred')
      assert(html).toContain('users: {')
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
      assert(await verify(store.get(run.id)!, getContexts()[0].goals[0])).toMatchObject({ reached: 'yes' })
      const view = JSON.stringify(participantView(run))
      assert(view).not.toMatch(/happyPath|expected|outcomes|\/docs\/getting-started|ui-tests/)
      // The purpose itself is never sent: the first impression is read against it.
      assert(participantView(run)).not.toHaveProperty('purpose')
    } finally { store.close() }
  })
  it('produces expected/actual URL diffs, I couldn\'t do this as not reached, and missing evidence as couldn\'t tell', async () => {
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(compile(authored({ happyPath: ['/', '/wrong'] }))[0]); const g = getContexts()[0].goals[0]
      assert(await verify(run, g)).toMatchObject({ reached: "couldn't tell" })
      run.snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main />' }; run.reason = 'done'
      assert(await verify(run, g)).toMatchObject({ reached: 'no', diff: { expected: '/wrong', actual: run.snapshot.url } })
      run.reason = "couldn't do this"
      assert(await verify(run, g)).toMatchObject({ reached: 'no', reason: "How it ended: pressed I couldn't do this" })
      run.seq = 2
      const found = issues(run, [{ type: 'click', at: 123, url: run.snapshot.url, target: 'div#inert', changed: false }, { type: 'url', at: 124, url: 'http://localhost/elsewhere' }, { type: 'pause', at: 125, url: run.snapshot.url, stoppedMs: 5100 }])
      assert(found.map(i => i.kind)).toEqual(['how it ended', 'nothing happened', 'off your path', 'stopped', 'not easy'])
      assert(found.map(i => i.detail)).toEqual(["How it ended: pressed I couldn't do this", 'Clicked div#inert, nothing happened', 'Off your path · opened /elsewhere', 'Stopped 5 s', 'How easy was it? 2 of 7 (7 = very easy)'])
      assert(found[1]).toMatchObject({ at: 123, detail: assert.stringContaining('div#inert') })
    } finally { store.close() }
  })
  it('atomically rejects stale verification without overwriting submitted answers or attempt evidence', () => {
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(compile(authored())[0]); run.status = 'questions'; store.update(run)
      const previous = store.get(run.id)!
      const verifying = structuredClone(previous); verifying.result = { reached: 'yes' }
      run.status = 'finished'; run.answers = { 'Which plan?': 'April' }; run.seq = 3
      run.snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main>Ready</main>' }
      store.update(run)
      assert(store.update(verifying, previous)).toBe(false)
      assert(store.get(run.id)).toMatchObject({ status: 'finished', answers: run.answers, seq: 3, snapshot: run.snapshot })
      assert(store.db.prepare('SELECT data FROM attempts').get()).toEqual({ data: assert.stringContaining('"seq":3') })
      assert(store.db.prepare('SELECT dom FROM snapshots').get()).toEqual({ dom: run.snapshot.dom })
      const latest = store.get(run.id)!
      assert(store.update({ ...latest, result: { reached: 'yes' } }, latest)).toBe(true)
      assert(store.get(run.id)?.result).toEqual({ reached: 'yes' })
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
      assert(run.result).toMatchObject({ reached: "couldn't tell", question: { expected: 'April' } })
      assert(participantView(run).validation).toEqual({ question: 'Which plan?', choices: ['April', 'May'] })
      run.answers = { 'Which plan?': 'April' }
      assert(await verify(run, getContexts()[0].goals[0])).toMatchObject({ reached: 'yes' })
    } finally { store.close() }
  })
  it('rejects unauthorized and cross-origin collector writes', async () => {
    const handler = createCollector(() => new SQLiteAdapter(':memory:'))
    // With no credentials at all the bar's probe hears "no rehearsal", not an error; wrong credentials are still refused.
    const probe = await handler(new Request('http://localhost/api/ui-tests'))
    assert(probe.status).toBe(200); assert(await probe.json()).toBeNull()
    assert((await handler(new Request('http://localhost/api/ui-tests', { headers: { cookie: 'ui-tests-run=a.b' } }))).status).toBe(401)
    assert((await handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://evil.test' }, body: '{}' }))).status).toBe(403)
    // In production the collector is off, but the probe from every page still hears "no rehearsal", so the landing logs no 404.
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const quiet = await handler(new Request('http://localhost/api/ui-tests'))
      assert(quiet.status).toBe(200); assert(await quiet.json()).toBeNull()
      assert((await handler(new Request('http://localhost/api/ui-tests', { headers: { cookie: 'ui-tests-run=a.b' } }))).status).toBe(404)
    } finally { vi.unstubAllEnvs() }
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
