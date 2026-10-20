import { mkdtemp, rm, writeFile, copyFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { checkTitle as webTitle } from '../../../apps/web/lib/check.ts'
import { main, type CliDeps, type Io } from '../src/cli/main.ts'
import { checkConclusion, checkPage, checkTitle, stickyComment } from '../src/github/check.ts'
import { fakeGitHub } from '../src/github/fake.ts'
import { restGitHub } from '../src/github/rest.ts'
import { SIGNATURE_HEADER, verifySignature } from '../src/notify/webhook.ts'
import { buildRecord } from '../src/record/build.ts'
import { refreshRun } from '../src/runner/progress.ts'
import { stubScreenshotter } from '../src/runner/screenshot.ts'
import { openStore } from '../src/store/open.ts'
import type { RunRow, RunStore } from '../src/store/types.ts'

const fixtures = join(import.meta.dirname, 'fixtures')

describe('checkTitle', () => {
  it('words the three outcomes', () => {
    expect(checkTitle({ n: 5, reached: 3, attempted: 5, problems: 2, result: 'problems-found' })).toBe('2 problems found · 3 of 5 people reached the goal')
    expect(checkTitle({ n: 5, reached: 4, attempted: 5, problems: 1, result: 'problems-found' })).toBe('1 problem found · 4 of 5 people reached the goal')
    expect(checkTitle({ n: 5, reached: 5, attempted: 5, problems: 0, result: 'none-found' })).toBe('No problems found with 5 people · 5 of 5 reached the goal')
    expect(checkTitle({ n: 5, reached: 3, attempted: 3, problems: 0, result: 'inconclusive' })).toBe('Inconclusive · only 3 of 5 attempts completed')
  })

  it('is the wording the landing draws, for the same run', () => {
    const run = (reached: number, attempted: number, problems: number) => ({
      goal: 'g', people: 5, attempted, reached, reportUrl: '', footer: { people: '', preview: '', commit: '', date: '' },
      problems: Array.from({ length: problems }, () => ({ title: 't', page: '/', locator: 'x', people: 1, impact: 'blocked' as const })),
    })
    expect(checkTitle({ n: 5, reached: 3, attempted: 5, problems: 2, result: 'problems-found' })).toBe(webTitle(run(3, 5, 2)))
    expect(checkTitle({ n: 5, reached: 4, attempted: 5, problems: 1, result: 'problems-found' })).toBe(webTitle(run(4, 5, 1)))
    expect(checkTitle({ n: 5, reached: 5, attempted: 5, problems: 0, result: 'none-found' })).toBe(webTitle(run(5, 5, 0)))
    expect(checkTitle({ n: 5, reached: 3, attempted: 3, problems: 0, result: 'inconclusive' })).toBe(webTitle(run(3, 3, 0)))
  })
})

describe('checkConclusion', () => {
  it('is neutral without block_on, failure only for problems with it, and never success', () => {
    for (const result of ['problems-found', 'none-found', 'inconclusive'] as const) {
      expect(checkConclusion(result)).toBe('neutral')
      expect(checkConclusion(result, 'problems')).toBe(result === 'problems-found' ? 'failure' : 'neutral')
    }
  })
})

describe('restGitHub', () => {
  it('speaks the check-run and comment endpoints', async () => {
    const seen: string[] = []
    const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    const fetchStub: typeof fetch = async (url, init) => {
      seen.push(`${init?.method} ${String(url).replace('https://api.github.com', '')} ${String(init?.body ?? '')}`)
      return String(url).endsWith('/comments?per_page=100') ? answer([{ id: 9, body: 'x <!-- ui-tests -->' }]) : answer({ id: 7 })
    }
    const github = restGitHub('tok', fetchStub)
    expect(await github.createCheck({ owner: 'o', repo: 'r', headSha: 'abc', name: 'ui-tests', status: 'in_progress', title: 't', summary: 's' })).toEqual({ id: 7 })
    await github.updateCheck(7, { owner: 'o', repo: 'r', status: 'completed', conclusion: 'neutral', title: 't', summary: 's', text: 'page' })
    await github.upsertComment({ owner: 'o', repo: 'r', pr: 4, marker: '<!-- ui-tests -->', body: 'new' })
    expect(seen[0]).toContain('POST /repos/o/r/check-runs')
    expect(seen[0]).toContain('"head_sha":"abc"')
    expect(seen[1]).toContain('PATCH /repos/o/r/check-runs/7')
    expect(seen[1]).toContain('"conclusion":"neutral"')
    expect(seen[3]).toContain('PATCH /repos/o/r/issues/comments/9')
  })
})

// The command, end to end against a local target, a fake GitHub and a local webhook receiver.
let target: Server
let targetUrl: string
let work: string
let data: string
let hookServer: Server
let hookUrl: string
const hooks: { body: string; signature: string | undefined }[] = []
const cleanup: (() => Promise<unknown> | unknown)[] = []

beforeAll(async () => {
  target = createServer((_req, res) => res.end('ok'))
  await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
  targetUrl = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
  hookServer = createServer((req, res) => {
    let body = ''
    req.on('data', c => (body += c))
    req.on('end', () => { hooks.push({ body, signature: req.headers[SIGNATURE_HEADER] as string | undefined }); res.end() })
  })
  await new Promise<void>(resolve => hookServer.listen(0, '127.0.0.1', resolve))
  hookUrl = `http://127.0.0.1:${(hookServer.address() as AddressInfo).port}/hook`
  work = await mkdtemp(join(fixtures, '.tmp-check-'))
  data = await mkdtemp(join(tmpdir(), 'ui-tests-check-'))
  await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
  await writeConfig()
})
afterAll(async () => {
  for (const s of [target, hookServer]) { s.closeAllConnections(); await new Promise(resolve => s.close(resolve)) }
  await rm(work, { recursive: true, force: true })
  await rm(data, { recursive: true, force: true })
})
afterEach(async () => { while (cleanup.length) await cleanup.pop()!() })

const writeConfig = (extra = '') =>
  writeFile(join(work, 'ui-tests.config.ts'), `export default { target: { url: '${targetUrl}' }, ci: { on: ['label:ui-test'] }, webhook: { url: '${hookUrl}', secret: 'hook-secret' }, ${extra} }\n`)

async function event(name: string, payload: unknown) {
  const file = join(work, `${name}.json`)
  await writeFile(file, JSON.stringify({ repository: { full_name: 'acme/site' }, ...(payload as object) }))
  return file
}
const pullRequest = (number: number, sha: string, labels: string[]) => ({ pull_request: { number, head: { sha }, labels: labels.map(name => ({ name })) } })

function session(env: Record<string, string>, deps: CliDeps) {
  let out = ''
  let err = ''
  const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, GITHUB_TOKEN: 'tok', ...env }, deps: { pollMs: 1, webhookBackoffMs: 1, screenshotter: stubScreenshotter(new Uint8Array([0])), ...deps } }
  return { io, out: () => out, err: () => err }
}
async function run(argv: string[], github: ReturnType<typeof fakeGitHub>, env: Record<string, string> = {}) {
  const s = session(env, { github })
  const code = await main(argv, s.io)
  return { code, out: s.out(), err: s.err() }
}
async function store(): Promise<RunStore> {
  const s = await openStore({ UI_TESTS_DATA_DIR: data })
  cleanup.push(() => s.close())
  return s
}
async function finishAll(s: RunStore, row: RunRow, verdicts: ('correct' | 'incorrect')[]) {
  for (const status of verdicts) {
    const { attempt } = await s.createAttempt({ runId: row.run, participant: `p${Math.random()}`, goalIndex: 0, rehearsal: false })
    await s.updateAttempt(attempt.id, { status: 'finished', reason: 'done', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), verification: { status, steps: [] } })
  }
}
const checkCalls = (g: ReturnType<typeof fakeGitHub>, call: string) => g.calls.filter(c => c.call === call)

describe('ui-tests check', () => {
  it('creates nothing for a pull request without the label', async () => {
    const github = fakeGitHub()
    const path = await event('unlabelled', pullRequest(101, 'sha101', ['bug']))
    const { code, out } = await run(['check'], github, { GITHUB_EVENT_PATH: path })
    expect(code).toBe(0)
    expect(out).toContain('not selected by ci.on')
    expect(github.calls).toEqual([])
    expect((await (await store()).listRuns()).filter(r => r.key.startsWith('pr-101:'))).toEqual([])
  })

  it('posts one pending check with the estimate, and a new push to the same pull request makes no second check or run', async () => {
    const github = fakeGitHub()
    const first = await run(['check'], github, { GITHUB_EVENT_PATH: await event('first', pullRequest(102, 'sha-a', ['ui-test'])) })
    expect(first.code).toBe(0)
    expect(checkCalls(github, 'createCheck')).toHaveLength(1)
    const [created] = [...github.checks.values()]
    expect(created).toMatchObject({ owner: 'acme', repo: 'site', headSha: 'sha-a', name: 'ui-tests', status: 'in_progress', title: 'Waiting for 5 people' })
    expect(created!.summary).toMatch(/Estimate: 5 people, up to \d+ minutes? each/)

    const second = await run(['check'], github, { GITHUB_EVENT_PATH: await event('second', pullRequest(102, 'sha-b', ['ui-test'])) })
    expect(second.code).toBe(0)
    expect(second.out).toContain('already has its check')
    expect(checkCalls(github, 'createCheck')).toHaveLength(1)
    const runs = (await (await store()).listRuns()).filter(r => r.key.startsWith('pr-102:'))
    expect(runs).toHaveLength(1)
    expect(runs[0]!.key).toMatch(/^pr-102:.+:human$/)
    expect(runs[0]!.build.commit).toBe('sha-a')
  })

  it('on a deployment, finds the pull request from the head commit through GitHub', async () => {
    const github = fakeGitHub([{ number: 103, headSha: 'sha-dep', labels: ['ui-test'] }, { number: 104, headSha: 'other', labels: ['ui-test'] }])
    const path = await event('deploy', { deployment: { sha: 'sha-dep' }, deployment_status: { state: 'success' } })
    const { code } = await run(['check'], github, { GITHUB_EVENT_PATH: path })
    expect(code).toBe(0)
    expect(checkCalls(github, 'pullRequestsForCommit')).toHaveLength(1)
    expect([...github.checks.values()]).toMatchObject([{ headSha: 'sha-dep' }])
    expect((await (await store()).listRuns()).some(r => r.key.startsWith('pr-103:'))).toBe(true)

    const none = fakeGitHub()
    const skipped = await run(['check'], none, { GITHUB_EVENT_PATH: await event('deploy-none', { deployment: { sha: 'zzz' }, deployment_status: { state: 'success' } }) })
    expect(skipped.code).toBe(0)
    expect(none.checks.size).toBe(0)
    const failed = await run(['check'], none, { GITHUB_EVENT_PATH: await event('deploy-failed', { deployment: { sha: 'sha-dep' }, deployment_status: { state: 'failure' } }) })
    expect(failed.out).toContain('skipped')
  })

  it('completes the check, comments once per outcome, and calls the webhook once when the run has a result', async () => {
    const github = fakeGitHub()
    await run(['check'], github, { GITHUB_EVENT_PATH: await event('done', pullRequest(105, 'sha-105', ['ui-test'])) })
    const s = await store()
    const row = (await s.listRuns()).find(r => r.key.startsWith('pr-105:'))!

    // Partway: still pending, so nothing is told.
    await finishAll(s, row, ['correct', 'correct'])
    await run(['verify', row.run], github)
    await run(['status', row.run], github)
    expect([...github.checks.values()][0]!.status).toBe('in_progress')
    expect(github.comments.size).toBe(0)
    expect(hooks.filter(h => JSON.parse(h.body).run === row.run)).toEqual([])

    await finishAll(s, row, ['correct', 'incorrect', 'correct'])
    const { code } = await run(['status', row.run, '--json'], github, { UI_TESTS_SHARE_SECRET: 'share' })
    expect(code).toBe(0)
    const final = [...github.checks.values()][0]!
    expect(final).toMatchObject({ status: 'completed', conclusion: 'neutral', title: '1 problem found · 4 of 5 people reached the goal' })
    expect(final.text).toContain('This check never fails your build.')
    expect(final.text).toContain('[Full report](')
    expect(github.comments.size).toBe(1)
    const sent = hooks.filter(h => JSON.parse(h.body).run === row.run)
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0]!.body)).toMatchObject({ run: row.run, result: 'problems-found' })
    expect(verifySignature(sent[0]!.body, sent[0]!.signature, 'hook-secret')).toBe(true)

    // Calling again changes nothing: the check, the comment and the webhook were each told once.
    const before = github.calls.length
    await run(['status', row.run], github)
    await run(['check', '--reconcile'], github)
    expect(github.calls.slice(before).filter(c => c.call !== 'pullRequestsForCommit')).toEqual([])
    expect(hooks.filter(h => JSON.parse(h.body).run === row.run)).toHaveLength(1)
  })

  it('updates the sticky comment in place only when the outcome changes, and not at all with check.comment: false', async () => {
    const github = fakeGitHub()
    await run(['check'], github, { GITHUB_EVENT_PATH: await event('sticky', pullRequest(106, 'sha-106', ['ui-test'])) })
    const s = await store()
    const row = (await s.listRuns()).find(r => r.key.startsWith('pr-106:'))!
    await finishAll(s, row, ['correct', 'correct', 'correct', 'correct', 'correct'])
    await run(['status', row.run], github)
    expect(checkCalls(github, 'upsertComment')).toHaveLength(1)
    expect(checkCalls(github, 'upsertComment')[0]).toMatchObject({ created: true })
    expect([...github.comments.values()][0]).toContain('No problems found with 5 people')

    // A late incorrect verdict changes the outcome: the same comment is replaced, not added.
    await s.updateAttempt((await s.listAttempts(row.run)).find(a => a.status === 'finished')!.id, { verification: { status: 'incorrect', steps: [] } })
    await refreshRun(s, row.run)
    await run(['status', row.run], github)
    expect(checkCalls(github, 'upsertComment')).toHaveLength(2)
    expect(checkCalls(github, 'upsertComment')[1]).toMatchObject({ created: false })
    expect(github.comments.size).toBe(1)
    expect([...github.comments.values()][0]).toContain('1 problem found')

    await writeConfig('check: { comment: false },')
    cleanup.push(() => writeConfig())
    const quiet = fakeGitHub()
    await run(['check'], quiet, { GITHUB_EVENT_PATH: await event('quiet', pullRequest(107, 'sha-107', ['ui-test'])) })
    const row2 = (await s.listRuns()).find(r => r.key.startsWith('pr-107:'))!
    await finishAll(s, row2, ['correct', 'correct', 'correct', 'correct', 'correct'])
    await run(['status', row2.run], quiet)
    expect([...quiet.checks.values()][0]!.status).toBe('completed')
    expect(quiet.comments.size).toBe(0)
  })

  it('fails the check only with block_on: problems', async () => {
    await writeConfig("check: { block_on: 'problems' },")
    cleanup.push(() => writeConfig())
    const github = fakeGitHub()
    await run(['check'], github, { GITHUB_EVENT_PATH: await event('block', pullRequest(108, 'sha-108', ['ui-test'])) })
    const s = await store()
    const row = (await s.listRuns()).find(r => r.key.startsWith('pr-108:'))!
    await finishAll(s, row, ['incorrect', 'correct', 'correct', 'correct', 'correct'])
    await run(['check', '--reconcile'], github)
    const final = [...github.checks.values()][0]!
    expect(final.conclusion).toBe('failure')
    expect(final.text).toContain('This check fails your build when it finds problems.')
  })
})

describe('the check page and the sticky comment', () => {
  it('has the sentence, the promise, report links, a footer and the rest folded, with no images; the comment is 3 to 5 lines', async () => {
    const github = fakeGitHub()
    await run(['check'], github, { GITHUB_EVENT_PATH: await event('page', pullRequest(109, 'sha-109abcdef', ['ui-test'])) })
    const s = await store()
    const row = (await s.listRuns()).find(r => r.key.startsWith('pr-109:'))!
    await finishAll(s, row, ['correct', 'correct', 'correct', 'correct', 'correct'])
    await refreshRun(s, row.run)
    const record = await buildRecord(s, row.run)
    const page = checkPage(record)
    expect(page.startsWith(record.sentence)).toBe(true)
    expect(page).toContain('This check never fails your build. It reports problems, or that none were seen this time.')
    expect(page).toMatch(/<sub>5 people from a link · ran on http:\/\/127\.0\.0\.1:\d+ · commit sha-109/)
    expect(page).toContain('<details>')
    expect(page).not.toContain('![')
    expect(page).not.toContain('Full report')
    const links = { report: 'https://x/r/1', attempt: (n: number) => `https://x/r/1/p${n}` }
    expect(checkPage(record, { links })).toContain('[Full report](https://x/r/1)')
    expect(checkPage(record, { blockOn: 'problems' })).toContain('This check fails your build when it finds problems. It reports problems, or that none were seen this time.')
    const comment = stickyComment(record, { links }).split('\n')
    expect(comment[0]).toBe('<!-- ui-tests -->')
    expect(comment.length - 1).toBeGreaterThanOrEqual(3)
    expect(comment.length - 1).toBeLessThanOrEqual(5)
  })
})
