import { describe, it, expect } from 'vitest'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { checkTitle, checkConclusion, checkSummary, checkText, checkRunPayload, stickyComment, stickyOutcome, publishCheck, parseCheckRun, outcomeOf, type CheckRun } from '../packages/ui-tests/src/check'
import { exampleCheck } from '../apps/web/lib/pull-request'

const exec = promisify(execFile)
const none: CheckRun = { ...exampleCheck, reached: 5, pressedDoneFailed: 0, problems: [] }
const inconclusive: CheckRun = { ...exampleCheck, attempted: 3, reached: 1, pressedDoneFailed: 1 }

describe('the ui-tests check (issue #35, item 3)', () => {
  it('titles the three outcomes as the research words them', () => {
    expect(outcomeOf(exampleCheck)).toBe('problems')
    expect(checkTitle(exampleCheck)).toBe('4 problems found · 2 of 5 people reached the goal')
    expect(checkTitle(none)).toBe('No problems found with 5 people · 5 of 5 reached the goal')
    expect(checkTitle(inconclusive)).toBe('Inconclusive · only 3 of 5 attempts completed')
    expect(checkTitle({ ...exampleCheck, problems: exampleCheck.problems.slice(0, 1) })).toBe('1 problem found · 2 of 5 people reached the goal')
  })

  it('is neutral for all three outcomes, and fails only with block_on: problems when problems were found', () => {
    for (const run of [exampleCheck, none, inconclusive]) expect(checkConclusion(run)).toBe('neutral')
    expect(checkConclusion(exampleCheck, { block_on: 'problems' })).toBe('failure')
    expect(checkConclusion(none, { block_on: 'problems' })).toBe('neutral')
    expect(checkConclusion(inconclusive, { block_on: 'problems' })).toBe('neutral')
    expect(checkSummary(exampleCheck, { block_on: 'problems' })).toContain('This check fails your build when it finds problems')
    expect(checkSummary(exampleCheck)).toContain('This check never fails your build.')
  })

  it("writes the artefact's check page as the summary: sentence, the three to fix first with moment links, the links and the footer", () => {
    const blocks = checkSummary(exampleCheck).split('\n\n')
    expect(blocks[0]).toBe('5 people tried *invite a colleague* on this preview. 2 of 5 reached the goal; 2 of 5 pressed Done, but your check failed. This check never fails your build. It reports problems, or that none were seen this time.')
    const table = blocks[1].split('\n')
    expect(table[0]).toBe('| # | Problem | Where | People | Impact | Moment |')
    expect(table).toHaveLength(5)
    // Ranked by impact, then by how many: the Share menu, 4 of 5 but slowed, is third.
    expect(table[2]).toBe('| 1 | Pressed Add, saw nothing change, pressed it again; Sam got two invitations | `/settings/members` · `button "Add"` | 2 of 5 | Blocked | [Person 3 · 00:58](https://ui-tests.com/r/k2m9#problem-1&t=58) |')
    expect(table[3]).toContain('| 2 | The Add button looked switched off')
    expect(table[4]).toBe('| 3 | Looked for Invite in the Share menu and found only link options | `/board` · `menu "Share"` | 4 of 5 | Slowed | [Person 1 · 00:04](https://ui-tests.com/r/k2m9#problem-3&t=4) |')
    expect(blocks[2]).toBe('Blocked kept them from the goal · Slowed cost them time · Confused did something that had no effect')
    expect(blocks[3]).toBe('[Open the report](https://ui-tests.com/r/k2m9) · [+1 more problem](https://ui-tests.com/r/k2m9#problem-4) · [What worked](https://ui-tests.com/r/k2m9#worked)')
    expect(blocks[4]).toBe('<sub>5 people · paid panel (Prolific, CloudResearch Connect) · weekboard-git-invite-flow.vercel.app · 80035db · 14 Oct 2026</sub>')
    expect(blocks).toHaveLength(5)
    // The rest go in output.text, folded.
    expect(checkText(exampleCheck)).toMatch(/^<details><summary>1 more problem<\/summary>\n\n\| # \|[\s\S]*\| 4 \| Typed Sam's email into the board search \|[\s\S]*<\/details>$/)
    expect(checkText(none)).toBeUndefined()
    expect(checkSummary(none)).toContain('No problems were seen this time.')
    expect(checkSummary(inconclusive)).toContain('Not enough attempts yet: 3 of 5 in.')
  })

  it('sends one completed check run with the Details link to the report, no annotations and no images', () => {
    const payload = checkRunPayload(exampleCheck, 'abc123')
    expect(payload).toMatchObject({ name: 'ui-tests', head_sha: 'abc123', status: 'completed', conclusion: 'neutral', details_url: 'https://ui-tests.com/r/k2m9' })
    expect(Object.keys(payload.output).sort()).toEqual(['summary', 'text', 'title'])
    expect(JSON.stringify(payload)).not.toMatch(/annotations|images|!\[/)
  })

  it('keeps one sticky comment of three lines under its marker, created once, updated when the outcome changes, and off when asked', async () => {
    const body = stickyComment(exampleCheck)
    expect(body.split('\n')).toHaveLength(4)
    expect(body.split('\n').slice(1)).toEqual(['**ui-tests** · 4 problems found · 2 of 5 people reached the goal', expect.stringMatching(/^Fix first: Pressed Add/), '[Open the report](https://ui-tests.com/r/k2m9)'])
    expect(stickyOutcome(body)).toBe('problems')
    const calls: { method: string; url: string; body?: unknown }[] = []
    function github(comments: { id: number; body: string }[]) {
      calls.length = 0
      return async (url: string, init?: { method?: string; body?: string }) => {
        calls.push({ method: init?.method ?? 'GET', url, body: init?.body && JSON.parse(init.body) })
        return { ok: true, status: 200, json: async () => init?.method === 'GET' ? comments : { id: 7, html_url: 'https://github.com/o/r/runs/7' } }
      }
    }
    const input = { token: 't', repository: 'o/r', headSha: 'abc', pullRequest: 12, run: exampleCheck }
    expect((await publishCheck({ ...input, fetch: github([]) })).comment).toBe('created')
    expect(calls.map(call => `${call.method} ${call.url}`)).toEqual(['POST https://api.github.com/repos/o/r/check-runs', 'GET https://api.github.com/repos/o/r/issues/12/comments?per_page=100&page=1', 'POST https://api.github.com/repos/o/r/issues/12/comments'])
    expect((calls[0].body as { conclusion: string }).conclusion).toBe('neutral')
    expect((await publishCheck({ ...input, fetch: github([{ id: 3, body }]) })).comment).toBe('unchanged')
    expect(calls.filter(call => call.method !== 'GET')).toHaveLength(1)
    expect((await publishCheck({ ...input, run: none, fetch: github([{ id: 3, body }]) })).comment).toBe('updated')
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', url: 'https://api.github.com/repos/o/r/issues/comments/3' })
    expect((await publishCheck({ ...input, options: { comment: false }, fetch: github([]) })).comment).toBe('off')
    expect(calls).toHaveLength(1)
    expect((await publishCheck({ ...input, options: { block_on: 'problems' }, fetch: github([]) }))).toBeTruthy()
    expect((calls[0].body as { conclusion: string }).conclusion).toBe('failure')
  })

  it('reads the generated example run, rejects a malformed one, and prints the check from the CLI without calling GitHub', async () => {
    expect(JSON.parse(await readFile('apps/web/generated/example-check.json', 'utf8'))).toEqual(exampleCheck)
    expect(() => parseCheckRun({ ...exampleCheck, reached: 9 })).toThrow('Invalid run')
    expect(() => parseCheckRun({ ...exampleCheck, problems: [{ title: 'x', page: '/', locator: 'a', people: 1, impact: 'bad' }] })).toThrow('Invalid run')
    const moment = (url: string) => ({ ...exampleCheck, problems: [{ ...exampleCheck.problems[0], moment: { person: 1, seconds: 4, url } }] })
    for (const url of ['javascript:alert(1)', 'https://ui-tests.com/r/k2m9 #t=4', 'https://ui-tests.com/r/k2m9)#t=4', '']) expect(() => parseCheckRun(moment(url))).toThrow('Invalid run: problems')
    expect(parseCheckRun(moment('https://ui-tests.com/r/k2m9#problem-1&t=4'))).toBeTruthy()
    for (const reportUrl of ['javascript:alert(1)', 'https://ui-tests.com/r/k2m9)', 'https://ui-tests.com/r/ k2m9']) expect(() => parseCheckRun({ ...exampleCheck, reportUrl })).toThrow('Invalid run: reportUrl')
    for (const field of ['people', 'preview', 'commit', 'date'] as const) expect(() => parseCheckRun({ ...exampleCheck, footer: { ...exampleCheck.footer, [field]: '' } })).toThrow('Invalid run: footer')
    expect(() => parseCheckRun({ ...exampleCheck, footer: {} })).toThrow('Invalid run: footer')
    const { stdout } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'check', 'apps/web/generated/example-check.json', '--block-on', 'problems', '--print'], { env: { ...process.env, GITHUB_EVENT_PATH: '', GITHUB_SHA: 'deadbeef' }, timeout: 15000 })
    const printed = JSON.parse(stdout)
    expect(printed.checkRun).toEqual(checkRunPayload(exampleCheck, 'deadbeef', { block_on: 'problems' }))
    expect(printed.comment).toBe(stickyComment(exampleCheck))
    const directory = await mkdtemp(join(tmpdir(), 'ui-tests-check-'))
    try {
      const event = join(directory, 'event.json')
      await writeFile(event, JSON.stringify({ pull_request: { number: 4, head: { sha: 'headsha' } } }))
      const { stdout: off } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'check', 'apps/web/generated/example-check.json', '--no-comment', '--print'], { env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_SHA: 'merge' }, timeout: 15000 })
      expect(JSON.parse(off)).toMatchObject({ checkRun: { head_sha: 'headsha', conclusion: 'neutral' }, comment: null })
      // The workflow_run publisher: the head commit comes from the triggering run.
      await writeFile(event, JSON.stringify({ workflow_run: { head_sha: 'runhead', pull_requests: [{ number: 4 }] } }))
      const { stdout: published } = await exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'check', 'apps/web/generated/example-check.json', '--no-comment', '--print'], { env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_SHA: 'main' }, timeout: 15000 })
      expect(JSON.parse(published)).toMatchObject({ checkRun: { head_sha: 'runhead', conclusion: 'neutral' } })
      await expect(exec(process.execPath, ['packages/ui-tests/bin/ui-tests.mjs', 'check', 'apps/web/generated/example-check.json'], { env: { ...process.env, GITHUB_TOKEN: '', GITHUB_EVENT_PATH: '', GITHUB_SHA: '' }, timeout: 15000 })).rejects.toMatchObject({ code: 1 })
    } finally { await rm(directory, { recursive: true, force: true }) }
  }, 40000)
})
