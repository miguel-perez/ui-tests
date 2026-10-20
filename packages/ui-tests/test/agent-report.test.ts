import { afterEach, describe, expect, it } from 'vitest'
import { runTrials } from '../src/agents/loop.ts'
import type { Harness } from '../src/agents/model.ts'
import { scriptedModel, type ScriptedTurn } from '../src/agents/scripted.ts'
import { AgentReport } from '../src/agents/report.tsx'
import { renderToString } from 'react-dom/server'
import { createElement } from 'react'
import { checkName, agentTitle, deliverResult, owedDeliveries } from '../src/github/check.ts'
import { fakeGitHub } from '../src/github/fake.ts'
import { runRecordSchema } from '../src/record/schema.ts'
import { buildRecord } from '../src/record/build.ts'
import { isSlot } from '../src/runner/invites.ts'
import { refreshRun } from '../src/runner/progress.ts'
import { serveTrace } from '../src/trace/serve.ts'
import type { RunStore } from '../src/store/types.ts'
import { expect as check } from '../src/expect.ts'
import { agentStudy } from './agent-fixtures.ts'

const harness = (): Harness => ({
  tools: () => [], call: async () => ({ output: '' }), reset: async () => {}, dispose: async () => {},
  endState: async () => ({ workspace: { root: '', file: () => 'x' } }),
})
const done: ScriptedTurn[] = [{ toolCalls: [{ name: 'done', input: {} }] }]
const giveUp: ScriptedTurn[] = [{ toolCalls: [{ name: 'give_up', input: { reason: 'the flag does not exist' } }] }]

let stores: RunStore[] = []
afterEach(async () => { for (const s of stores) await s.close(); stores = [] })

/** Five trials: the third gives up. The outcome would pass on that trial's end state, so only the terminal reason stops it. */
async function made(scripts: ScriptedTurn[][] = [done, done, giveUp, done, done]) {
  const m = await agentStudy({ target: { cli: 'x' }, hook: async ({ workspace }) => { check(workspace.file('f')).toExist() }, trials: scripts.length })
  stores.push(m.store)
  const trials = await runTrials({ ...m, model: scriptedModel(scripts), harness: harness() })
  return { ...m, trials }
}

describe('agent trials, record and report', () => {
  it('reads a trial that gave up as stopped, whatever its end state, on every harness', async () => {
    const { trials } = await made()
    expect(trials.map(t => t.state)).toEqual(['verified', 'verified', 'stopped', 'verified', 'verified'])
    expect(trials[2].stoppedBy).toBe('the flag does not exist')
    expect(trials[2].verification.reason).toBe('Terminal reason: gave up')
  })

  it('keeps agent trials out of the human invite slots', async () => {
    const { store, run } = await made()
    const attempts = await store.listAttempts(run.run)
    expect(attempts).toHaveLength(5)
    expect(attempts.filter(isSlot)).toEqual([])
  })

  it('writes an agent record with trials, pass^k and pass@k, no clause evidence, and no people wording', async () => {
    const { store, run } = await made()
    const record = await buildRecord(store, run.run)
    expect(runRecordSchema.parse(record).actor).toBe('agent')
    expect(record.trials?.map(t => [t.index, t.state])).toEqual([[1, 'verified'], [2, 'verified'], [3, 'stopped'], [4, 'verified'], [5, 'verified']])
    expect(record.trials?.[2].stoppedBy).toBe('the flag does not exist')
    expect([record.passK, record.passAtK]).toEqual([false, true])
    expect(record.evidence).toEqual([])
    expect(record.issues).toEqual([])
    expect(`${record.sentence} ${record.evidenceStatement}`).not.toMatch(/people|person/i)
    expect(record.sentence).toContain('pass^k fail, 4 of 5 trials verified')
    expect(record.attempts.every(a => !('agent.trial' in a.answers))).toBe(true)
    const { actor: _actor, ...without } = record
    expect(runRecordSchema.safeParse(without).success).toBe(false)
  })

  it('keeps the result of an agent run when it is refreshed', async () => {
    const { store, run } = await made()
    await store.updateRun(run.run, { result: 'problems-found' }, run.revision)
    expect((await refreshRun(store, run.run)).result).toBe('problems-found')
  })

  it('renders the per-trial table with state, time, the stop line and a trace link', async () => {
    const { store, run } = await made()
    const html = renderToString(createElement(AgentReport, { record: await buildRecord(store, run.run) }))
    expect(html).toContain('capability test, not usability')
    expect(html).toContain('the flag does not exist')
    expect(html.match(/<a href="[^"]*">Trace</g)).toHaveLength(5)
    expect(html).toContain(`/runs/${run.run}/#`)
    expect(html).not.toMatch(/instead of a person|stand-?in|substitute/i)
  })

  it('serves the agent report at its own address and never inside a human report', async () => {
    const { store, run } = await made()
    const server = await serveTrace({ store, port: 0 })
    try {
      const page = await fetch(`${server.url}/agent-runs/${run.run}/`)
      expect(page.status).toBe(200)
      expect(await page.text()).toContain('capability test, not usability')
      const human = await fetch(`${server.url}/runs/${run.run}/report/`, { redirect: 'manual' })
      expect(human.status).toBe(308)
      expect(human.headers.get('location')).toBe(`/agent-runs/${run.run}/`)
      expect((await fetch(`${server.url}/agent-runs/r_nope/`)).status).toBe(404)
    } finally { await server.close() }
  })

  it('posts its own check, named ui-tests (agent), neutral, with no comment', async () => {
    expect(checkName('agent')).toBe('ui-tests (agent)')
    expect(checkName('human')).toBe('ui-tests')
    const { store, run } = await made()
    const github = fakeGitHub()
    const { id } = await github.createCheck({ owner: 'o', repo: 'r', headSha: 's', name: checkName('agent'), status: 'in_progress', title: 'x', summary: 'y' })
    await store.updateRun(run.run, { result: 'problems-found', github: { owner: 'o', repo: 'r', pr: 1, headSha: 's', checkId: id, name: checkName('agent') } }, run.revision)
    const current = (await store.getRun(run.run))!
    expect(owedDeliveries(current, {})).toEqual({ check: true, comment: false, webhook: false })
    expect(await deliverResult({ store, run: current, config: { check: { block_on: 'problems' } }, github })).toEqual([])
    const update = github.calls.find(c => c.call === 'updateCheck')!.input as { conclusion: string; title: string; text: string }
    expect(update.conclusion).toBe('neutral')
    expect(update.title).toBe('Capability test failed · 4 of 5 trials verified')
    expect(update.text).toContain('the flag does not exist')
    expect(github.calls.some(c => c.call === 'upsertComment')).toBe(false)
    expect(agentTitle(await buildRecord(store, run.run))).toBe(update.title)
  })
})
