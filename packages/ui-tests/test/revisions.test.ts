import { join } from 'node:path'
import { request } from 'node:http'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { buildRecord } from '../src/record/build.ts'
import { runRecordSchema } from '../src/record/schema.ts'
import { figuresOf, owedDeliveries, titleOf } from '../src/github/check.ts'
import { checkTitle } from '../src/github/check.ts'
import { ReportView } from '../src/report/view.tsx'
import { pendingStudyEdits, studyEditSnippet, numbered, type Revision } from '../src/revisions.ts'
import { createRun } from '../src/runner/create-run.ts'
import { idempotencyKey } from '../src/runner/key.ts'
import { refreshRun } from '../src/runner/progress.ts'
import { createCollector } from '../src/server/collector.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { buildTrace } from '../src/trace/build.ts'
import { recordRevision, RevisionRefused, type RevisionRequest } from '../src/trace/revise.ts'
import { serveTrace } from '../src/trace/serve.ts'
import { TraceView } from '../src/trace/view.tsx'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
let code: string
let compiled: ReturnType<typeof compileStudy>
let store: SqliteStore
let runId: string
const closers: (() => Promise<void>)[] = []
const ana = { by: 'ana', now: () => new Date('2026-10-19T12:00:00.000Z') }
/** Server-rendered text with React's text-node separators removed. */
const text = (node: Parameters<typeof renderToString>[0]) => renderToString(node).replace(/<!-- -->/g, '')
const withdraw = async (token: string) => createCollector({ store: async () => store })(new Request('http://app.test/api/ui-tests', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'withdraw' }) }))
const revise = (r: RevisionRequest) => recordRevision(store, runId, r, ana)

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  compiled = compileStudy((await loadBundle(code, file))[0]!, {})
})
afterEach(async () => { await Promise.all(closers.splice(0).map(close => close())) })

/** One finished, verified person on task 0 who hit `targets` (dead clicks) on the way. */
async function person(s: SqliteStore, id: string, n: number, verdict: 'correct' | 'incorrect', targets: string[] = [], extra: { goal?: number; impression?: string } = {}) {
  const { attempt, token } = await s.createAttempt({ runId: id, participant: `p_${n}`, goalIndex: extra.goal ?? 0, rehearsal: false })
  await s.updateAttempt(attempt.id, {
    status: 'finished', reason: 'done', purposes: compiled.consent.purposes, startedAt: new Date(0).toISOString(), endedAt: new Date(20_000).toISOString(),
    verification: { status: verdict, steps: [], ...(verdict === 'incorrect' && { diff: { expected: 'a', actual: 'b' } }) },
    answers: {
      screenerResult: { matches: n !== 3, outside: n === 3 ? ['Works in marketing'] : [], fit: { recency: 3, solving: 1, importance: 2, total: 6 } },
      ...(extra.impression && { impression: { text: extra.impression, code: 'did not name it', codedBy: 'rule', firstClick: null } }),
    },
  })
  await s.appendEvents(attempt.id, [
    { type: 'url', at: 0, url: 'http://t.test/', seq: 1 },
    ...targets.map((target, i) => ({ type: 'click' as const, at: 1000 + i * 2000, url: 'http://t.test/', target, changed: false, seq: 2 + i })),
  ])
  return { attempt, token }
}

beforeEach(async () => {
  store = new SqliteStore(':memory:')
  runId = (await store.createRun(newRun('k', { compiled, hooksBundle: code, deadline: new Date(Date.now() + 86_400_000).toISOString() }))).run.run
})

describe('exclusion', () => {
  it('takes a person out of n and the counts, keeps them in the record, paid, and counts the exclusions', async () => {
    const people = [await person(store, runId, 1, 'correct'), await person(store, runId, 2, 'correct', ['a#pricing']), await person(store, runId, 3, 'correct', ['a#pricing'], { impression: 'a shop' })]
    const before = await buildRecord(store, runId)
    expect(before.measures.byGoal['0']!.effectiveness).toMatchObject({ reached: 3, n: 3 })
    expect(before.fit).toMatchObject({ screened: 3, matched: 2 })
    expect(before.issues.map(i => i.participants.length)).toEqual([2])
    const revisionBefore = before.handle.revision

    const number = await revise({ kind: 'exclude', attempt: people[2]!.attempt.id, reason: 'not my audience' })
    expect(number).toBe(1)
    const after = await buildRecord(store, runId)
    expect(after.measures.byGoal['0']!.effectiveness).toMatchObject({ reached: 2, n: 2 })
    expect(after.quality.counted).toBe(2)
    expect(after.fit).toMatchObject({ screened: 2, matched: 2 })
    expect(after.impression.denominator).toBe(0)
    expect(after.issues.map(i => i.participants)).toEqual([[people[1]!.attempt.participant]])
    // The original attempt stays, with its answers, and the exclusion says who, why and that they stay paid.
    expect(after.attempts).toHaveLength(3)
    expect(after.attempts[2]).toMatchObject({ id: people[2]!.attempt.id, reason: 'done', verification: { status: 'correct' }, flags: ['excluded'] })
    expect(after.attempts[2]!.answers).toHaveProperty('impression')
    expect(after.exclusions).toEqual([{ attempt: people[2]!.attempt.id, reason: 'not my audience', by: 'ana', at: '2026-10-19T12:00:00.000Z', revision: 1, staysPaid: true }])
    expect(after.money).toEqual(before.money)
    expect(after.handle.revision).toBeGreaterThan(revisionBefore)
    expect(after.revisionLog).toEqual([{ number: 1, undone: false, revision: { kind: 'exclude', attempt: people[2]!.attempt.id, reason: 'not my audience', at: '2026-10-19T12:00:00.000Z', by: 'ana' } }])
    expect(runRecordSchema.safeParse(after).success).toBe(true)
    const report = text(createElement(ReportView, { record: after }))
    expect(report).toContain('1 person excluded by the author as not the audience')
    expect(report).toContain('they were still paid')
    expect(report).toContain('excluded, still paid')
  })

  it('moves a complete result when an exclusion takes someone out of n, and back when it is undone', async () => {
    const made = []
    for (let i = 1; i <= compiled.sample.n; i++) made.push(await person(store, runId, i, 'correct'))
    expect((await refreshRun(store, runId)).result).toBe('none-found')
    await revise({ kind: 'exclude', attempt: made[0]!.attempt.id, reason: 'not my audience' })
    expect((await store.getRun(runId))).toMatchObject({ result: 'pending', states: { collection: 'collecting' } })
    await revise({ kind: 'undo', revision: 1 })
    expect(await store.getRun(runId)).toMatchObject({ result: 'none-found', states: { collection: 'complete' } })
    expect((await store.getAttempt(made[0]!.attempt.id))!.flags).toEqual([])
  })

  it('refuses an exclusion twice, of an attempt that is not this run\'s, and with no reason', async () => {
    const { attempt } = await person(store, runId, 1, 'correct')
    await revise({ kind: 'exclude', attempt: attempt.id, reason: 'not my audience' })
    await expect(revise({ kind: 'exclude', attempt: attempt.id, reason: 'again' })).rejects.toThrow(RevisionRefused)
    await expect(revise({ kind: 'exclude', attempt: 'a_other', reason: 'x' })).rejects.toThrow(/No such attempt/)
    await expect(revise({ kind: 'exclude', attempt: attempt.id, reason: ' ' })).rejects.toThrow(RevisionRefused)
    expect(await store.listRevisions(runId)).toHaveLength(1)
  })
})

describe('reversible and attributable', () => {
  it('keeps an undone revision in the list, marked, and refuses to undo an undo or the same one twice', async () => {
    const { attempt } = await person(store, runId, 1, 'correct')
    await revise({ kind: 'scenario', goalIndex: 0, text: 'Find the docs' })
    await revise({ kind: 'exclude', attempt: attempt.id, reason: 'not my audience' })
    await revise({ kind: 'undo', revision: 2 })
    const record = await buildRecord(store, runId)
    expect(record.revisionLog.map(r => [r.number, r.undone, r.revision.by, r.revision.kind])).toEqual([[1, false, 'ana', 'scenario'], [2, true, 'ana', 'exclude'], [3, false, 'ana', 'undo']])
    expect(record.exclusions).toEqual([])
    await expect(revise({ kind: 'undo', revision: 2 })).rejects.toThrow(/already undone/)
    await expect(revise({ kind: 'undo', revision: 3 })).rejects.toThrow(/cannot be undone/)
    await expect(revise({ kind: 'undo', revision: 9 })).rejects.toThrow(/No revision 9/)
    // The same person can be excluded again afterwards.
    await revise({ kind: 'exclude', attempt: attempt.id, reason: 'second thoughts' })
    expect((await buildRecord(store, runId)).exclusions).toHaveLength(1)
  })

  it('numbers an undo that points at nothing earlier as taking nothing back', () => {
    const base = { at: 't', by: 'ana' }
    const list: Revision[] = [{ ...base, kind: 'undo', revision: 1 }, { ...base, kind: 'undo', revision: 5 }]
    expect(numbered(list).map(r => r.undone)).toEqual([false, false])
  })
})

describe('issues', () => {
  async function overlapping() {
    // A: a#pricing hit by p1 and p2; B: a#docs hit by p2 and p3.
    await person(store, runId, 1, 'correct', ['a#pricing'])
    await person(store, runId, 2, 'correct', ['a#pricing', 'a#docs'])
    await person(store, runId, 3, 'correct', ['a#docs'])
    return (await buildRecord(store, runId)).issues
  }

  it('merges two issues and sums their distinct participants', async () => {
    const issues = await overlapping()
    expect(issues.map(i => i.count)).toEqual(['2 of 5', '2 of 5'])
    await revise({ kind: 'issue-merge', issues: issues.map(i => i.id) })
    const merged = (await buildRecord(store, runId)).issues
    expect(merged).toHaveLength(1)
    expect(merged[0]!.participants.sort()).toEqual(['p_1', 'p_2', 'p_3'])
    expect(merged[0]!.count).toBe('3 of 5')
    // The stored run and its attempts are as they were; the original issues return when the merge is undone.
    await revise({ kind: 'undo', revision: 1 })
    expect((await buildRecord(store, runId)).issues.map(i => i.count)).toEqual(['2 of 5', '2 of 5'])
  })

  it('edits a title and a suggested change, and splits an issue by attempt', async () => {
    const issues = await overlapping()
    const a = issues.find(i => i.where.element === 'a#pricing')!
    const attempts = await store.listAttempts(runId)
    await revise({ kind: 'issue-edit', issue: a.id, title: 'Pricing link does nothing', suggestedChange: 'Link it to the plans' })
    const edited = (await buildRecord(store, runId)).issues.find(i => i.id === a.id)!
    expect(edited).toMatchObject({ title: 'Pricing link does nothing', suggestedChange: 'Link it to the plans', count: '2 of 5' })
    await revise({ kind: 'issue-split', issue: a.id, moments: [[attempts[0]!.id], [attempts[1]!.id]] })
    const split = (await buildRecord(store, runId)).issues.filter(i => i.id.startsWith(`${a.id}#`))
    expect(split.map(i => [i.id.slice(-2), i.participants, i.count])).toEqual([['#1', ['p_1'], '1 of 5'], ['#2', ['p_2'], '1 of 5']])
    await expect(revise({ kind: 'issue-split', issue: a.id, moments: [[attempts[2]!.id], [attempts[0]!.id]] })).rejects.toThrow(/No such issue/)
    await expect(revise({ kind: 'issue-edit', issue: 'nope', title: 'x' })).rejects.toThrow(/No such issue/)
  })
})

describe('study edits and the first look', () => {
  it('shows a scenario revision as an edit with who made it, and the original wording stays', async () => {
    const original = compiled.goals[0]!.scenario.text
    await revise({ kind: 'scenario', goalIndex: 0, text: 'You need the getting started page.' })
    const trace = await buildTrace(store, runId)
    expect(trace.scenario.edits).toMatchObject([{ number: 1, by: 'ana', goalIndex: 0, text: 'You need the getting started page.' }])
    expect(trace.compiled.goals[0]!.scenario.text).toBe(original)
    const html = text(createElement(TraceView, { trace }))
    expect(html).toContain('wording edited by ana')
    expect(html).toContain('You need the getting started page.')
    expect(pendingStudyEdits(await store.listRevisions(runId))).toEqual([{ goalIndex: 0, scenario: 'You need the getting started page.' }])
    expect(html).toContain('scenario: &#x27;You need the getting started page.&#x27;,')
  })

  it('turns a promoted path into the text to paste, the latest per task, and drops it when undone', async () => {
    await revise({ kind: 'promote-path', goalIndex: 0, path: ['/', '/pricing'] })
    await revise({ kind: 'promote-path', goalIndex: 0, path: ['/', "/it's"] })
    const edits = pendingStudyEdits(await store.listRevisions(runId))
    expect(edits).toEqual([{ goalIndex: 0, path: ['/', "/it's"] }])
    expect(studyEditSnippet(edits[0]!)).toEqual(["path: ['/', '/it\\'s'],"])
    expect(studyEditSnippet({ goalIndex: 0, path: ['/', '/pricing'] })).toEqual(["path: ['/', '/pricing'],"])
    await revise({ kind: 'undo', revision: 2 })
    expect(pendingStudyEdits(await store.listRevisions(runId))).toEqual([{ goalIndex: 0, path: ['/', '/pricing'] }])
    expect((await buildRecord(store, runId)).studyEdits).toEqual([{ goalIndex: 0, path: ['/', '/pricing'] }])
    await expect(revise({ kind: 'promote-path', goalIndex: 99, path: ['/'] })).rejects.toThrow(/No task 99/)
  })

  it('changes the code of a first look as a revision; the stored answer stays', async () => {
    const { attempt } = await person(store, runId, 1, 'correct', [], { impression: 'a tool for invites' })
    expect((await buildRecord(store, runId)).impression).toMatchObject({ named: 0, didNot: 1 })
    await revise({ kind: 'code-impression', attempt: attempt.id, code: 'named the purpose' })
    const record = await buildRecord(store, runId)
    expect(record.impression).toMatchObject({ named: 1, didNot: 0 })
    expect((record.attempts[0]!.answers.impression as { code: string }).code).toBe('did not name it')
    expect((await buildTrace(store, runId)).attempts[0]!.impression).toMatchObject({ code: 'named the purpose', codedBy: 'author' })
    const without = await person(store, runId, 2, 'correct')
    await expect(revise({ kind: 'code-impression', attempt: without.attempt.id, code: 'no answer' })).rejects.toThrow(/no first-look answer/)
  })

  it('records an incentive adjustment for the run or one person', async () => {
    const { attempt } = await person(store, runId, 1, 'correct')
    await revise({ kind: 'incentive', amount: { minor: 800, currency: 'USD' } })
    await revise({ kind: 'incentive', attempt: attempt.id, amount: { minor: 1200, currency: 'USD' } })
    expect((await buildRecord(store, runId)).incentive).toEqual({ amount: { minor: 800, currency: 'USD' }, attempts: { [attempt.id]: { minor: 1200, currency: 'USD' } } })
    await expect(revise({ kind: 'incentive', amount: { minor: 1.5, currency: 'USD' } })).rejects.toThrow(RevisionRefused)
  })
})

describe('withdrawal', () => {
  it('deletes the recordings, marks the attempt withdrew, leaves a complete result as it was, and the report says reproducibility is reduced', async () => {
    const made = []
    for (let i = 1; i <= compiled.sample.n; i++) made.push(await person(store, runId, i, 'correct'))
    const done = await refreshRun(store, runId)
    expect(done).toMatchObject({ result: 'none-found', states: { collection: 'complete' } })
    const blob = await store.putBlob(made[0]!.attempt.id, 'video', new Uint8Array([1]), 'video/webm')
    const collect = createCollector({ store: async () => store })
    const response = await collect(new Request('http://app.test/api/ui-tests', { method: 'POST', headers: { Authorization: `Bearer ${made[0]!.token}` }, body: JSON.stringify({ action: 'withdraw' }) }))
    expect(response.status).toBe(200)
    expect(await store.getBlob(blob)).toBeUndefined()
    expect(await store.listEvents(made[0]!.attempt.id)).toEqual([])
    expect(await store.getAttempt(made[0]!.attempt.id)).toMatchObject({ reason: 'withdrew' })
    const settled = await refreshRun(store, runId)
    expect(settled).toMatchObject({ result: 'none-found', states: { collection: 'complete', recruitment: 'filled' } })
    const record = await buildRecord(store, runId)
    expect(record.compiled.sample.n).toBe(compiled.sample.n)
    expect(record.quality.withdrawn).toBe(1)
    expect(text(createElement(ReportView, { record }))).toContain('1 person withdrew and their recordings were deleted, so this report cannot be reproduced in full.')
  })
})

describe('re-run on a new build', () => {
  it('makes a new run for a new commit and leaves the old record as it was', async () => {
    const make = (commit: string) => createRun({ store, compiled, hooksBundle: code, target: 'http://t.test', actor: 'human', rehearsal: false, commit, key: idempotencyKey({ commit, contextId: compiled.id, actor: 'human' }) })
    const first = await make('aaa111')
    await person(store, first.run.run, 1, 'incorrect', ['a#pricing'])
    await recordRevision(store, first.run.run, { kind: 'scenario', goalIndex: 0, text: 'Reworded' }, ana)
    const recordBefore = JSON.stringify(await buildRecord(store, first.run.run))
    const second = await make('bbb222')
    expect(second.created).toBe(true)
    expect(second.run.run).not.toBe(first.run.run)
    expect(second.run.build.commit).toBe('bbb222')
    expect((await make('aaa111')).run.run).toBe(first.run.run)
    await person(store, second.run.run, 1, 'correct')
    await recordRevision(store, second.run.run, { kind: 'exclude', attempt: (await store.listAttempts(second.run.run))[0]!.id, reason: 'not my audience' }, ana)
    expect(JSON.stringify(await buildRecord(store, first.run.run))).toBe(recordBefore)
    expect((await buildRecord(store, second.run.run)).revisionLog).toHaveLength(1)
  })
})

describe('the local viewer', () => {
  const post = (url: string, body: string, headers: Record<string, string> = {}) =>
    new Promise<{ status: number; location?: string; text: string }>((resolve, reject) => {
      const u = new URL(url)
      const req = request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', host: u.host, ...headers } }, res => {
        let text = ''
        res.on('data', c => (text += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, text }))
      })
      req.on('error', reject)
      req.end(body)
    })

  it('takes a form post from its own page, attributes it to the author and redirects back', async () => {
    const { attempt } = await person(store, runId, 1, 'correct')
    const server = await serveTrace({ store, port: 0, author: 'Ana' })
    closers.push(server.close)
    const page = await (await fetch(`${server.url}/runs/${runId}/`)).text()
    expect(page).toContain('Exclude (they stay paid)')
    expect(page).toContain('Revisions')
    const body = new URLSearchParams({ kind: 'exclude', attempt: attempt.id, reason: 'not my audience' }).toString()
    const done = await post(`${server.url}/runs/${runId}/revisions`, body, { origin: server.url })
    expect(done).toMatchObject({ status: 303, location: `/runs/${runId}/#revisions` })
    expect(await store.listRevisions(runId)).toMatchObject([{ kind: 'exclude', by: 'Ana', reason: 'not my audience' }])
    const after = (await (await fetch(`${server.url}/runs/${runId}/`)).text()).replace(/<!-- -->/g, '')
    expect(after).toContain('1 person excluded as not the audience')
    expect(after).toContain('Undo')
    const undone = await post(`${server.url}/runs/${runId}/revisions`, 'kind=undo&revision=1', { origin: server.url })
    expect(undone.status).toBe(303)
    expect((await store.getAttempt(attempt.id))!.flags).toEqual([])
  })

  it('refuses writes from another origin, with no origin, from a rebound host, or marked cross-site; and writes to nothing else', async () => {
    const { attempt } = await person(store, runId, 1, 'correct')
    const server = await serveTrace({ store, port: 0 })
    closers.push(server.close)
    const url = `${server.url}/runs/${runId}/revisions`
    const body = new URLSearchParams({ kind: 'exclude', attempt: attempt.id, reason: 'x' }).toString()
    expect((await post(url, body)).status).toBe(403)
    expect((await post(url, body, { origin: 'http://evil.example' })).status).toBe(403)
    expect((await post(url, body, { origin: 'null' })).status).toBe(403)
    expect((await post(url, body, { origin: server.url, 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await post(url, body, { host: 'evil.example', origin: 'http://evil.example' })).status).toBe(403)
    expect((await post(url, body, { host: 'localhost.evil.example', origin: 'http://localhost.evil.example' })).status).toBe(403)
    expect((await post(`${server.url}/runs/${runId}/report/`, body, { origin: server.url })).status).toBe(404)
    expect((await post(`${server.url}/runs/r_missing/revisions`, body, { origin: server.url })).status).toBe(404)
    expect(await store.listRevisions(runId)).toEqual([])
  })

  it('answers a refused revision with 400 and its reason, and writes nothing', async () => {
    const server = await serveTrace({ store, port: 0 })
    closers.push(server.close)
    const refused = await post(`${server.url}/runs/${runId}/revisions`, 'kind=exclude&attempt=a_nobody&reason=x', { origin: server.url })
    expect(refused.status).toBe(400)
    expect(refused.text).toContain('No such attempt')
    expect((await post(`${server.url}/runs/${runId}/revisions`, 'kind=mystery', { origin: server.url })).status).toBe(400)
    expect((await post(`${server.url}/runs/${runId}/revisions`, `kind=scenario&goalIndex=0&text=${'x'.repeat(70_000)}`, { origin: server.url })).status).toBe(413)
    expect(await store.listRevisions(runId)).toEqual([])
  })
})

describe('fix round 1', () => {
  it('keeps a withdrawn, verified person in n everywhere on a completed run: result, check title, counts', async () => {
    const made = []
    for (let i = 1; i <= compiled.sample.n; i++) made.push(await person(store, runId, i, 'correct'))
    await refreshRun(store, runId)
    expect((await withdraw(made[0]!.token)).status).toBe(200)
    await refreshRun(store, runId)
    const record = await buildRecord(store, runId)
    expect(record.handle.result).toBe('none-found')
    expect(record.quality).toMatchObject({ counted: 5, withdrawn: 1 })
    expect(record.measures.byGoal['0']!.effectiveness).toMatchObject({ reached: 5, n: 5 })
    expect(figuresOf(record)).toMatchObject({ n: 5, reached: 5, attempted: 5 })
    expect(titleOf(record)).toBe(checkTitle({ n: 5, reached: 5, attempted: 5, problems: 0, result: 'none-found' }))
    expect(titleOf(record)).toContain('5 of 5 reached the goal')
  })

  it('still lists the issue a withdrawn person caused on a problems-found result, without their words', async () => {
    const made = [await person(store, runId, 1, 'incorrect')]
    for (let i = 2; i <= compiled.sample.n; i++) made.push(await person(store, runId, i, 'correct'))
    await store.updateAttempt(made[0]!.attempt.id, { answers: { 'goal0.difficulty': 'I could not find it', screenerResult: { matches: true, outside: [], fit: { recency: 1, solving: 1, importance: 1, total: 3 } } } })
    await refreshRun(store, runId)
    expect((await store.getRun(runId))!.result).toBe('problems-found')
    await withdraw(made[0]!.token)
    await refreshRun(store, runId)
    const record = await buildRecord(store, runId)
    expect(record.handle.result).toBe('problems-found')
    expect(record.issues).toHaveLength(1)
    expect(record.issues[0]).toMatchObject({ participants: ['p_1'], words: [], moments: [], count: '1 of 5' })
    expect(figuresOf(record)).toMatchObject({ problems: 1, attempted: 5, reached: 4 })
    expect(JSON.stringify(record)).not.toContain('I could not find it')
  })

  it('keeps a live scenario edit in the paste block when an earlier revision is undone', async () => {
    const { attempt } = await person(store, runId, 1, 'correct')
    await revise({ kind: 'exclude', attempt: attempt.id, reason: 'not my audience' })
    await revise({ kind: 'scenario', goalIndex: 0, text: 'Keep this wording' })
    await revise({ kind: 'undo', revision: 1 })
    const html = text(createElement(TraceView, { trace: await buildTrace(store, runId) }))
    expect(html).toContain('Paste into your study file')
    expect(html).toContain('scenario: &#x27;Keep this wording&#x27;,')
  })

  it('excludes a person, not an attempt: all their attempts leave the counts and they are counted once', async () => {
    const a = await person(store, runId, 1, 'correct', ['a#pricing'])
    const b = await person(store, runId, 1, 'correct', ['a#pricing'], { goal: 1 })
    await person(store, runId, 2, 'correct', ['a#pricing'])
    await revise({ kind: 'exclude', attempt: a.attempt.id, reason: 'not my audience' })
    expect((await store.getAttempt(b.attempt.id))!.flags).toEqual(['excluded'])
    await expect(revise({ kind: 'exclude', attempt: b.attempt.id, reason: 'again' })).rejects.toThrow(/already excluded/)
    const record = await buildRecord(store, runId)
    expect(record.exclusions).toHaveLength(1)
    expect(record.measures.byGoal['1']!.effectiveness.n).toBe(0)
    expect(record.quality.counted).toBe(1)
    expect(text(createElement(ReportView, { record }))).toContain('1 person excluded')
    await revise({ kind: 'undo', revision: 1 })
    expect((await store.getAttempt(b.attempt.id))!.flags).toEqual([])
  })

  it('offers promote-path only on a person who reached the outcome', async () => {
    await person(store, runId, 1, 'correct', ['a#x'])
    await person(store, runId, 2, 'incorrect', ['a#x'])
    const html = text(createElement(TraceView, { trace: await buildTrace(store, runId) }))
    expect(html.match(/value="promote-path"/g)).toHaveLength(1)
  })

  it('tells the outside again when an exclusion or undo changes a delivered result', async () => {
    const made = [await person(store, runId, 1, 'incorrect')]
    for (let i = 2; i <= compiled.sample.n + 1; i++) made.push(await person(store, runId, i, 'correct'))
    expect((await refreshRun(store, runId)).result).toBe('problems-found')
    await store.updateRun(runId, { github: { owner: 'o', repo: 'r', pr: 1, checkId: 7 }, delivered: { check: 'problems-found', comment: 'problems', webhook: 'problems-found' } }, (await store.getRun(runId))!.revision)
    const seen: { result: string; checkOwed: boolean }[] = []
    const onResult = async (run: Parameters<typeof owedDeliveries>[0]) => { seen.push({ result: run.result, checkOwed: owedDeliveries(run, {}).check }) }
    await recordRevision(store, runId, { kind: 'exclude', attempt: made[0]!.attempt.id, reason: 'not my audience' }, { ...ana, onResult })
    expect(seen).toEqual([{ result: 'none-found', checkOwed: true }])
    await recordRevision(store, runId, { kind: 'undo', revision: 1 }, { ...ana, onResult })
    expect(seen.at(-1)).toEqual({ result: 'problems-found', checkOwed: false })
  })

  it('stores a revision, its marks and the run number together or not at all', async () => {
    const { attempt } = await person(store, runId, 1, 'correct')
    const before = (await store.getRun(runId))!.revision
    const real = store.transaction.bind(store)
    store.transaction = (fn => real(tx => { tx.updateRun = async () => false; return fn(tx) })) as typeof store.transaction
    await expect(revise({ kind: 'exclude', attempt: attempt.id, reason: 'x' })).rejects.toThrow(/Nothing was stored|nothing was stored/)
    store.transaction = real
    expect(await store.listRevisions(runId)).toEqual([])
    expect((await store.getAttempt(attempt.id))!.flags).toEqual([])
    expect((await store.getRun(runId))!.revision).toBe(before)
  })

  it('puts a merged issue back in rank order', async () => {
    await person(store, runId, 1, 'correct', ['a#z'])
    await person(store, runId, 2, 'correct', ['a#z'])
    await person(store, runId, 3, 'correct', ['a#x'])
    await person(store, runId, 4, 'correct', ['a#x', 'a#y'])
    await person(store, runId, 5, 'correct', ['a#y'])
    const issues = (await buildRecord(store, runId)).issues
    const ids = issues.filter(i => i.where.element !== 'a#z').map(i => i.id)
    await revise({ kind: 'issue-merge', issues: ids })
    const merged = (await buildRecord(store, runId)).issues
    expect(merged[0]!.participants).toHaveLength(3)
    expect(merged[1]!.where.element).toBe('a#z')
  })
})
