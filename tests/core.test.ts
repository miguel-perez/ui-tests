import { describe, it, expect as assert, beforeEach, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { study, setup as fixture, task, outcome, expect, getContexts, resetContexts, resolveFixtures } from '../packages/ui-tests/src/index'
import { compile, compileFile, forAttempt, lint, generateTemplate, sentence, sampleSize, deriveScenario, codeImpression, recordingLine, plan } from '../packages/ui-tests/src/compiler'
import { deriveScreener, inferFacts, recencyBands, screenerScreens } from '../packages/ui-tests/src/screener'
import { exampleFile } from '../packages/ui-tests/src/example'
import { SQLiteAdapter, recordingRetentionMs } from '../packages/ui-tests/src/storage'
import { verify, issues } from '../packages/ui-tests/src/verify'
import { participantView, createCollector, maxAudioBytes } from '../packages/ui-tests/src/server'
import * as siteCopy from '../apps/web/lib/copy'
import { renderTrace } from '../packages/ui-tests/src/trace'

beforeEach(resetContexts)
/** Authors the landing study with the given task options and returns the studies. */
function authored(options = { path: ['/', '/docs/getting-started'] }) {
  study('getting started', { users: 'developers', purpose: 'find out whether people can use what I built' }, () => {
    task('start trying ui-tests', options, () => outcome(({ page }) => expect(page.url()).toContain('/docs/getting-started')))
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
    assert(sampleSize()).toBe(5); assert(sampleSize(1 / 3)).toBe(5); assert(sentence()).toBe('Rehearsal: 0 of 5 planned attempts recorded.')
    assert(() => sampleSize('1 in 0')).toThrow()
    assert(() => sampleSize(0)).toThrow()
  })
  it('generates scenario only from task and fixtures, and supports author override', () => {
    assert(generateTemplate('finish planning', ['April budget'])).toContain('April budget')
    const [c] = compile(authored())
    assert(c.goals[0].scenario.text).toContain('start trying ui-tests')
    assert(c.goals[0].scenario.text).not.toMatch(/click|link|button|\/docs/)
    getContexts()[0].goals[0].options.scenario = 'A pinned scenario'
    assert(compile(getContexts())[0].goals[0].scenario).toEqual({ text: 'A pinned scenario', rule: 'author scenario override' })
  })
  it('records all task shapes and warns for issues-only exploration', () => {
    study('s', { users: 'people', purpose: 'finish my work' }, () => {
      task('finish', () => outcome(({ page }) => expect(page.url()).toContain('/')))
      task('explore', () => {})
      task('finish a plan', () => outcome(({ page }) => expect(page.url()).toContain('/')))
    })
    assert(compile(getContexts())[0].goals.map(g => g.shape)).toEqual(['outcome', 'outcome', 'outcome'])
    assert(compile(getContexts())[0].goals[1].resultSentence).toBeNull()
    assert(lint(getContexts()).filter(d => !d.rule.startsWith('users-'))).toEqual([assert.objectContaining({ severity: 'warning', rule: 'outcome-required' })])
  })
  it('fails each required lint example with rule, reason, source and fix', () => {
    study('s', { users: 'people', purpose: 'use ui-tests' }, () => {
      task('click the Docs link and open getting started', () => outcome(() => {}))
      task('understand what ui-tests does and start', () => outcome(() => {}))
    })
    const diagnostics = lint(getContexts()).filter(d => !d.rule.startsWith('users-'))
    assert(diagnostics.map(d => d.rule)).toEqual(assert.arrayContaining(['task-no-interface', 'outcome-strength', 'person-purpose']))
    assert(diagnostics.every(d => d.reason && d.source && d.fix && d.severity === 'error')).toBe(true)
  })
  it('rejects duplicate outcomes and flags every renamed authoring name with the fix naming the replacement', async () => {
    study('s', { users: 'people', purpose: 'finish my work' }, () => task('finish', () => { outcome(() => {}); outcome(() => {}) }))
    assert(lint(getContexts()).map(d => d.rule).filter(rule => !rule.startsWith('users-'))).toEqual(['one-outcome'])
    // The old names still load and are lint errors whose fix names the new one.
    resetContexts()
    const { context, goal, beforeEach: legacyFixture } = await import('../packages/ui-tests/src/index')
    context({ users: 'people', purpose: 'finish my work', video: true, impression: { page: '/' } } as never, () => {
      legacyFixture(async () => ({}))
      goal('finish', { happyPath: ['/'], start: '/', minutes: 3, catch: { affecting: '1 in 3', confidence: 0.85 }, fixtures: ['email'] } as never, () => outcome(({ page }) => expect(page.url()).toContain('/')))
    })
    const errors = lint(getContexts()).filter(d => d.severity === 'error')
    const fix = (rule: string) => errors.find(d => d.rule === rule)?.fix
    assert(errors.map(d => d.rule).sort()).toEqual(['beforeEach-renamed', 'catch-renamed', 'context-renamed', 'fixtures-renamed', 'goal-renamed', 'happyPath-renamed', 'impression-renamed', 'minutes-renamed', 'start-renamed', 'video-renamed'])
    assert(fix('context-renamed')).toContain('study(')
    assert(fix('goal-renamed')).toContain('task(')
    assert(fix('beforeEach-renamed')).toContain('setup(async ({ request })')
    assert(fix('happyPath-renamed')).toContain('path:')
    assert(fix('catch-renamed')).toContain('sample: { affecting: 1 / 3, confidence: 0.85 }')
    assert(fix('video-renamed')).toContain("record: 'video'")
    assert(fix('impression-renamed')).toContain('firstLook')
    assert(fix('start-renamed')).toContain('setup')
    assert(fix('minutes-renamed')).toContain('timeLimit')
    // The old names on the new calls are caught too, and the sample has no per-task form.
    resetContexts()
    study('s', { users: 'people', purpose: 'finish my work' }, () => task('finish', { happyPath: ['/'], sample: { affecting: 1 / 3 } } as never, () => outcome(({ page }) => expect(page.url()).toContain('/'))))
    assert(lint(getContexts()).filter(d => d.severity === 'error').map(d => d.rule)).toEqual(['happyPath-renamed', 'sample-on-study'])
    // A step inside a task, the old goal's tasks, no longer loads.
    resetContexts()
    assert(() => study('s', { users: 'people', purpose: 'finish my work' }, () => task('finish', () => task('a step')))).toThrow(/inside another task/)
    resetContexts()
    study('s', { users: 'people', purpose: 'finish my work' }, () => task('finish', { timeLimit: 3 } as never, () => outcome(({ page }) => expect(page.url()).toContain('/'))))
    assert(lint(getContexts()).map(d => d.rule)).toContain('timeLimit-valid')
  })
})
describe('users, recording, start and the first look', () => {
  const invite = { are: 'people who signed up this week and want a colleague on their board', did: 'signed up for a tool to plan work with a team', within: '7 days', uses: ['Trello', 'Asana', 'Notion', 'Linear'], not: ['has used Weekboard'] }
  const purpose = 'plan the week together without emailing screenshots around'
  it('takes users as an object with how to check it, validated by the compiler, without lint errors', () => {
    study('invite flow', { users: invite, purpose }, () => task('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).filter(d => d.rule.startsWith('users-'))).toEqual([])
    const [c] = compile(getContexts())
    assert(c.users).toBe(invite.are)
    assert(c.screener).toMatchObject({ source: 'authored', inferred: [], facts: { did: invite.did, within: '7 days' } })
    assert(c.screener.facts).not.toHaveProperty('are')
    resetContexts()
    study('s', { users: { are: 'people', within: 'soon', where: ['usa'], age: { min: 40, max: 30 }, extra: true } as never, purpose }, () => task('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const invalid = lint(getContexts()).find(d => d.rule === 'users-valid')!
    assert(invalid.severity).toBe('error')
    assert(invalid.reason).toMatch(/within/); assert(invalid.reason).toMatch(/where/); assert(invalid.reason).toMatch(/age/); assert(invalid.reason).toMatch(/extra/)
    assert(() => compile(getContexts())).toThrow()
    resetContexts()
    study('s', { users: { did: 'paid' } as never, purpose }, () => task('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).map(d => d.rule)).toContain('users-valid')
  })
  it('derives the six screens the person sees from users and purpose, in the artefact\'s words, without labels or rules', () => {
    const screener = deriveScreener(invite, purpose)
    const screens = screenerScreens(screener)
    assert(screens.map(s => s.question)).toEqual(['When did you last sign up for a tool to plan work with a team?', 'Which of these do you use to plan work? Pick all that apply.', 'Which of these have you done? Pick all that apply.', 'When did you last need to plan the week together?', 'How do you do it today?', 'How much does it matter to you to get this right?'])
    assert(screens[0].options).toEqual(['In the past week', 'In the past month', 'Earlier this year', "I haven't"])
    assert(screens[1]).toMatchObject({ kind: 'multi', options: ['Trello', 'Asana', 'Notion', 'Linear', 'Basecamp', 'None of these'] })
    assert(JSON.stringify(screens)).not.toMatch(/accept|reject|may-select|rule|NN\/g/)
    assert(screener.questions[0].options.map(o => o.label)).toEqual(['accept', 'reject', 'reject', 'reject'])
    const funnel = deriveScreener({ ...invite, often: 'weekly', role: ['developer'], where: ['US', 'GB'], language: 'en', age: { min: 18, max: 65 } }, purpose)
    assert(funnel.questions.map(q => q.field)).toEqual(['did', 'often', 'role', 'role', 'uses', 'not', 'purpose', 'purpose', 'purpose'])
    assert(funnel.questions.every(q => q.rule.length > 20 && q.options.length >= 3)).toBe(true)
    assert(funnel.filters.map(f => [f.filter, f.value])).toEqual([['country', 'US'], ['country', 'GB'], ['language', 'en'], ['age', '18 to 65'], ['previous-studies', 'exclude people who took part in an earlier run of this context']])
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
    study('s', { users: invite.are, purpose }, () => task('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const draft = lint(getContexts()).find(d => d.rule === 'users-inferred')!
    assert(draft.severity).toBe('warning')
    assert(draft.draft).toBe("users: {\n  are: 'people who signed up this week and want a colleague on their board',\n  did: 'signed up', // inferred\n  within: '7 days', // inferred\n},")
    assert(compile(getContexts())[0].screener).toMatchObject({ source: 'inferred', inferred: ['did', 'within'] })
    resetContexts()
    study('s', { users: 'accountants', purpose: 'close the month' }, () => task('close the month', () => outcome(({ page }) => expect(page.url()).toContain('/'))))
    assert(lint(getContexts()).map(d => d.rule)).toEqual(['users-inferred', 'users-did'])
  })
  it('records event replay unless record: \'video\' adds the screen, the prompt and the 1.5× incentive, and prints the level in the plan', () => {
    study('s', { users: invite, purpose }, () => task('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    study('v', { users: invite, purpose, record: 'video' }, () => task('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    const [events, video] = compile(getContexts())
    assert(events.recording).toMatchObject({ video: false, level: 'event replay', incentive: 1 })
    assert(video.recording).toMatchObject({ video: true, level: 'event replay and screen video', incentive: 1.5 })
    assert(plan([events])).toContain(recordingLine(false))
    assert(plan([video])).toContain("Recording: event replay (what people do on the page) and screen video (record: 'video'")
    assert(recordingLine(false)).toContain("Add record: 'video'")
    resetContexts()
    study('s', { users: invite, purpose, record: 'yes' as never }, () => task('invite a colleague', () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(lint(getContexts()).map(d => d.rule)).toContain('record-valid')
  })
  it('starts each task at setup\'s start, else the first page of its path, else the root, and flashes the start only when it is public', () => {
    study('s', { users: invite, purpose }, () => {
      fixture(async () => ({ board: 'b1' }))
      task('invite a colleague', { path: ['/board', '/settings/members'] }, () => outcome(({ page }) => expect(page.url()).toContain('/members')))
      task('rename the board', { path: ['/board', '/settings'] }, () => outcome(({ page }) => expect(page.url()).toContain('/settings')))
      task('find a card', () => outcome(({ page }) => expect(page.url()).toContain('/board')))
    })
    const [c] = compile(getContexts())
    assert(c.goals.map(g => g.start.path)).toEqual(['/board', '/board', '/'])
    assert(c.impression?.page).toBe('/board')
    // An attempt whose setup returns a start begins there, signed in, and has no first look; firstLook: { page } names a public one.
    const signedIn = forAttempt(c, { start: 'http://localhost:3000/sign-in?token=t1', board: 'b1' })
    assert(signedIn.goals.map(g => g.start)).toEqual(Array(3).fill({ path: 'http://localhost:3000/sign-in?token=t1', rule: 'setup start' }))
    assert(signedIn.impression).toBeNull()
    assert(c.goals[0].start.path).toBe('/board')
    resetContexts()
    study('s', { users: invite, purpose }, () => { fixture(async () => ({ start: '/board' })); task('invite a colleague', { firstLook: { page: 'https://weekboard.app/' } }, () => outcome(({ page }) => expect(page.url()).toContain('/members'))) })
    assert(compile(getContexts())[0].impression?.page).toBe('https://weekboard.app/')
    assert(forAttempt(compile(getContexts())[0], { start: '/board' }).impression?.page).toBe('https://weekboard.app/')
    resetContexts()
    study('s', { users: invite, purpose }, () => task('invite a colleague', { firstLook: false }, () => outcome(({ page }) => expect(page.url()).toContain('/members'))))
    assert(compile(getContexts())[0].impression).toBeNull()
    resetContexts()
    study('s', { users: invite, purpose }, () => task('invite a colleague', { firstLook: { page: 'board' }, path: ['board'] } as never, () => outcome(() => {})))
    assert(lint(getContexts()).map(d => d.rule)).toEqual(assert.arrayContaining(['firstLook-page', 'path-valid']))
  })
  it('codes an open impression answer against the purpose, with the words that matched and how the code was made', () => {
    assert(codeImpression('A board to plan the week with your team', purpose)).toMatchObject({ code: 'named the purpose', matched: ['plan', 'week'], proposedBy: expectString() })
    assert(codeImpression('Some kind of to-do list', purpose)).toMatchObject({ code: 'did not name it', matched: [] })
    assert(codeImpression('   ', purpose).code).toBe('no answer')
    assert(codeImpression('emailing screenshots', purpose).code).toBe('did not name it')
  })
  it('writes the card from users, purpose, the task and setup, never the path', async () => {
    assert(deriveScenario(invite.are, purpose, 'invite a colleague', { colleague: 'Sam', email: 'sam@acme.example' })).toBe("You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example.")
    assert(deriveScenario('developers', 'ship', 'start', {})).toBeUndefined()
    study('s', { users: invite, purpose }, () => { fixture(async () => ({ colleague: 'Sam', email: 'sam@acme.example' })); task('invite a colleague', { path: ['/board', '/settings/members'] }, () => outcome(({ page }) => expect(page.url()).toContain('/members'))) })
    await resolveFixtures(getContexts())
    const [c] = compile(getContexts())
    assert(c.goals[0].scenario.text).toBe("You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example.")
    assert(c.goals[0].scenario.text).not.toMatch(/settings|members|\/board/)
  })
  it('runs the file init writes the way a rehearsal does: setup once per attempt with request, the card from its values, the outcome against the app\'s state', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises')
    await mkdir('.ui-tests/example', { recursive: true })
    await writeFile('.ui-tests/example/invite.ui.test.ts', exampleFile)
    const { authored: [study], compiled: [c] } = await compileFile('.ui-tests/example/invite.ui.test.ts', '.ui-tests/compiled-example')
    // A stand-in for Weekboard's test API behind Playwright's request: each attempt gets its own board, and Add records invitations.
    const boards = new Map<string, string[]>()
    const calls: string[] = []
    const reply = (body: unknown) => ({ ok: () => true, status: () => 200, json: async () => body, text: async () => JSON.stringify(body) })
    const request = {
      post: async (url: string) => { calls.push(`POST ${url}`); const id = `b${boards.size + 1}`; boards.set(id, []); return reply({ id, signInUrl: `/sign-in?board=${id}` }) },
      get: async (url: string) => { calls.push(`GET ${url}`); return reply((boards.get(/boards\/(\w+)\/invitations/.exec(url)![1]) ?? []).map(email => ({ email }))) },
    } as never
    const { runSetup } = await import('../packages/ui-tests/src/index')
    const first = await runSetup(study, request), second = await runSetup(study, request)
    assert(first).toEqual({ start: '/sign-in?board=b1', board: 'b1', colleague: 'Sam', email: 'sam@acme.example' })
    assert(second.board).toBe('b2')
    const attempt = forAttempt(c, first)
    assert(attempt.goals[0].start).toEqual({ path: '/sign-in?board=b1', rule: 'setup start' })
    assert(attempt.goals[0].scenario.text).toBe(siteCopy.landing.scenario)
    assert(attempt.impression?.page).toBe('/')
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(attempt); run.setup = first; run.reason = 'done'
      // Whatever page they ended on, the outcome asks the app: no invitation yet is not reached; Add pressed twice still reached it.
      run.snapshot = { url: 'http://localhost/board', dom: '<main />' }
      assert(await verify(run, study.goals[0], [], { request })).toMatchObject({ reached: 'no', diff: { expected: 'sam@acme.example', actual: [] } })
      boards.get('b1')!.push('sam@acme.example', 'sam@acme.example')
      assert(await verify(run, study.goals[0], [], { request })).toEqual({ reached: 'yes' })
      assert(calls).toEqual(['POST /api/test/boards', 'POST /api/test/boards', 'GET /api/test/boards/b1/invitations', 'GET /api/test/boards/b1/invitations'])
      // Without the app the check cannot decide, and says so.
      assert((await verify(run, study.goals[0])).reached).toBe("couldn't tell")
    } finally { store.close() }
    const { checkFixtures } = await import('../packages/ui-tests/src/index')
    assert(() => checkFixtures([])).toThrow(/object/)
    assert(() => checkFixtures({ board: { id: 1 } })).toThrow(/board/)
    assert(() => checkFixtures({ start: 'board' })).toThrow(/start/)
  })
  it('compiles the file init writes and this site\'s own test, and the file reads its end state with page.url', async () => {
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
    assert(c.goals[0]).toMatchObject({ start: { path: '/board' }, sample: { planned: 5 } })
    assert(c.impression?.page).toBe('/')
    // This site's own study reads its end state with `page` (the rehearsal verifier); the Weekboard file's outcome reads the app's state with `request`.
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(result.compiled[0]); const g = result.authored[0].goals[0]
      assert((await verify(run, g)).reached).toBe("couldn't tell")
      run.snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main>Ready</main>' }; run.reason = 'done'
      assert((await verify(run, g)).reached).toBe('yes')
      run.snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main>Ready</main>' }
      run.snapshot = { url: 'http://localhost/elsewhere', dom: '<main>Ready</main>' }
      assert((await verify(run, g)).reached).toBe('no')
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
      assert((await post(voice)).status).toBe(409)
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
      for (const action of [{ action: 'begin' }, { action: 'events', events: [] }, { action: 'extend' }, { action: 'end', reason: 'done', snapshot: { url: 'http://localhost/', dom: '' } }, { action: 'questions', seq: 5 }, voice]) assert((await post(action)).status).toBe(409)
      assert(store.get(run.id)!).toEqual(withdrawn)
      assert(store.db.prepare('SELECT COUNT(*) AS n FROM recordings').get()).toEqual({ n: 0 })
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
      assert(view.impression).toEqual({ page: '/', flashMs: 500, question: 'What was that page for?', goal: 'start trying this tool' })
      assert(view).toMatchObject({ start: '/', video: false, screened: false, impressed: false })
      const handler = createCollector(() => store)
      const post = (body: unknown) => handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://localhost', cookie: `ui-tests-run=${run.id}.${run.token}` }, body: JSON.stringify(body) }))
      assert((await post({ action: 'impression', answer: 'x', spoken: false })).status).toBe(409)
      run.status = 'consented'; store.update(run)
      assert((await post({ action: 'screener', answers: [['In the past month']] })).status).toBe(200)
      const response = await post({ action: 'impression', answer: 'A way to find out whether people can use what you built', spoken: false })
      assert(response.status).toBe(200)
      const returned = await response.json()
      assert(returned).toMatchObject({ screened: true, impressed: true })
      assert(JSON.stringify(returned)).not.toMatch(/named the purpose|matched/)
      const saved = store.get(run.id)!
      assert(saved.screener).toEqual([['In the past month']])
      assert(saved.impression).toMatchObject({ answer: 'A way to find out whether people can use what you built', spoken: false, code: { code: 'named the purpose', proposedBy: expectString() } })
      const trace = renderTrace(saved, [])
      assert(trace).toContain('What was that page for?')
      assert(trace).toMatch(/<select aria-label="How the answer reads against the purpose">/)
      assert(trace).toContain('named the purpose')
      assert((await post({ action: 'screener', answers: [['In the past month']] })).status).toBe(200)
      assert((await post({ action: 'screener', answers: [['In the past three months']] })).status).toBe(409)
      assert((await post({ action: 'impression', answer: 'A way to find out whether people can use what you built', spoken: false })).status).toBe(200)
      assert((await post({ action: 'impression', answer: 'Something else', spoken: false })).status).toBe(409)
      assert((await post({ action: 'impression', answer: 'A way to find out whether people can use what you built', spoken: true })).status).toBe(409)
      assert(store.get(run.id)!).toMatchObject({ screener: [['In the past month']], impression: { answer: 'A way to find out whether people can use what you built', spoken: false } })
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
      study('s', { users: 'people', purpose: 'finish my work' }, () => task('explore', () => {}))
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
      assert((await verify(store.get(run.id)!, getContexts()[0].goals[0])).reached).toBe('yes')
      const view = JSON.stringify(participantView(run))
      assert(view).not.toMatch(/happyPath|expected|outcomes|\/docs\/getting-started|ui-tests/)
      assert(participantView(run)).not.toHaveProperty('purpose')
    } finally { store.close() }
  })
  it('lets the path decide nothing, I couldn\'t do this as not reached, and missing evidence as couldn\'t tell', async () => {
    const store = new SQLiteAdapter(':memory:')
    try {
      const run = store.create(compile(authored({ path: ['/', '/wrong'] }))[0]); const g = getContexts()[0].goals[0]
      assert((await verify(run, g)).reached).toBe("couldn't tell")
      // The path is only the route you expect: ending elsewhere is a signal, never the result.
      run.snapshot = { url: 'http://localhost/docs/getting-started', dom: '<main />' }; run.reason = 'done'
      assert(await verify(run, g)).toEqual({ reached: 'yes' })
      run.reason = "couldn't do this"
      assert(await verify(run, g)).toMatchObject({ reached: 'no', reason: "How it ended: pressed I couldn't do this" })
      run.seq = 2
      const found = issues(run, [{ type: 'click', at: 123, url: run.snapshot.url, target: 'div#inert', changed: false }, { type: 'url', at: 124, url: 'http://localhost/elsewhere' }, { type: 'pause', at: 125, url: run.snapshot.url, stoppedMs: 5100 }])
      assert(found.map(i => i.kind)).toEqual(['how it ended', 'nothing happened', 'off your path', 'stopped', 'not easy'])
      assert(found.map(i => i.detail)).toEqual(["How it ended: pressed I couldn't do this", 'Clicked div#inert, nothing happened', 'Off your path · opened /elsewhere', 'Stopped 5 s', 'How easy was it? 2 of 7 (7 = very easy)'])
      assert(found[1]).toMatchObject({ at: 123, detail: assert.stringContaining('div#inert') })
    } finally { store.close() }
  })
  it('atomically rejects stale verification without overwriting submitted answers or attempt evidence', async () => {
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
    study('s', { users: 'people', purpose: 'finish my work' }, () => task('finish', () => outcome(async ({ page, participant }) => {
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
      assert((await verify(run, getContexts()[0].goals[0])).reached).toBe('yes')
    } finally { store.close() }
  })
  it('rejects unauthorized and cross-origin collector writes', async () => {
    const handler = createCollector(() => new SQLiteAdapter(':memory:'))
    const probe = await handler(new Request('http://localhost/api/ui-tests'))
    assert(probe.status).toBe(200); assert(await probe.json()).toBeNull()
    assert((await handler(new Request('http://localhost/api/ui-tests', { headers: { cookie: 'ui-tests-run=a.b' } }))).status).toBe(401)
    assert((await handler(new Request('http://localhost/api/ui-tests', { method: 'POST', headers: { origin: 'http://evil.test' }, body: '{}' }))).status).toBe(403)
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
    return Object.entries(value as Record<string, unknown>).filter(([key]) => !['icon', 'picture'].includes(key)).flatMap(([, item]) => strings(item))
  }
  for (const text of strings(siteCopy)) assert(readme).toContain(text)
  assert((await readFile('apps/web/landing.ui.test.ts', 'utf8')).trim()).toBe(siteCopy.example)
  assert(readme).not.toMatch(/\b(?:compliant|certified)\b|synthetic users|AI participants/i)
  assert(readme).toContain('It is a capability test, not a usability one, and it never counts with people.')
  assert(readme).not.toMatch(/instead of a person/i)
  assert(strings(siteCopy).join('\n')).toContain('There is no score and no pass.')
})