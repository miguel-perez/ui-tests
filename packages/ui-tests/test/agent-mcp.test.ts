import { afterEach, describe, expect as vitestExpect, it } from 'vitest'
import { mcpHarness } from '../src/agents/harness-mcp.ts'
import { runTrials } from '../src/agents/loop.ts'
import { scriptedModel, type ScriptedTurn } from '../src/agents/scripted.ts'
import { expect } from '../src/expect.ts'
import type { RunStore } from '../src/store/types.ts'
import type { Hook } from '../src/types.ts'
import { participantView } from '../src/server/view.ts'
import { agentStudy } from './agent-fixtures.ts'
import { join } from 'node:path'

const fixtures = join(import.meta.dirname, 'fixtures', 'agents')
const command = 'node ./fake-mcp.mjs'
const adaAdded: Hook = async ({ workspace }) => {
  expect(workspace.file('members.json')).toContain('Ada')
}
const done: ScriptedTurn = { toolCalls: [{ name: 'done', input: {} }] }
const call = (name: string, input: unknown = {}): ScriptedTurn => ({ toolCalls: [{ name, input }] })

let stores: RunStore[] = []
afterEach(async () => { for (const store of stores) await store.close(); stores = [] })

async function trialsOf(script: ScriptedTurn[], hook: Hook = adaAdded, env?: Record<string, string | undefined>) {
  const made = await agentStudy({ target: { mcp: command }, hook, trials: 1, scenario: 'Add Ada as a member of the team.' })
  stores.push(made.store)
  const harness = mcpHarness(command, { cwd: fixtures, ...(env && { env }) })
  return runTrials({ ...made, model: scriptedModel(script), harness })
}

describe('agent trials through the mcp harness', () => {
  it('offers the server tools, similar names included, and nothing else', async () => {
    const harness = mcpHarness(command, { cwd: fixtures })
    vitestExpect(harness.tools()).toEqual([])
    await harness.reset()
    vitestExpect(harness.tools().map(t => t.name)).toEqual(['add_member', 'add_members', 'list_members', 'env_names'])
    vitestExpect(harness.tools()[0]).toMatchObject({ description: 'Adds one person to the team by name.', input: { type: 'object', required: ['name'] } })
    vitestExpect(await harness.call('shell', { command: 'ls' })).toEqual({ output: '', error: 'called shell, which is not a tool of this server' })
    await harness.dispose()
  })

  it('verifies a trial whose tool call reached the end state, and lists its side effects', async () => {
    const [trial] = await trialsOf([call('add_member', { name: 'Ada' }), call('list_members', {}), done])
    vitestExpect(trial).toMatchObject({ state: 'verified', claimedDone: true, sideEffects: ['called add_member', 'created members.json'] })
    const answers = trial.transcript.filter(m => m.role === 'tool').map(m => m.role === 'tool' && m.output)
    vitestExpect(answers.slice(0, 2)).toEqual(['added Ada', '["Ada"]'])
  })

  it('stops a trial that called the wrong tool, and says what the tool answered in one line', async () => {
    const [trial] = await trialsOf([call('add_member', { name: 'Ada' }), call('add_member', { name: 'Ada' }), call('add_members', { names: 3 }), done], async ({ workspace }) => { expect(workspace.file('members.json')).toContain('Grace') })
    vitestExpect(trial.state).toBe('stopped')
    vitestExpect(trial.stoppedBy).toMatch(/^called add_members, which failed/)
    vitestExpect(trial.recovered).toBe(false)
  })

  it('names a tool that failed, and the agent can carry on', async () => {
    const [trial] = await trialsOf([call('add_member', { name: 'Ada' }), call('add_member', { name: 'Ada' }), done])
    vitestExpect(trial).toMatchObject({ state: 'verified', recovered: true })
    const failed = trial.transcript.find(m => m.role === 'tool' && m.error)
    vitestExpect(failed?.role === 'tool' && failed.error).toBe('called add_member, which failed: Ada is already a member')
  })

  it('starts each trial with a fresh server and a new directory', async () => {
    const harness = mcpHarness(command, { cwd: fixtures })
    await harness.reset()
    await harness.call('add_member', { name: 'Ada' })
    vitestExpect((await harness.call('list_members', {})).output).toBe('["Ada"]')
    await harness.reset()
    vitestExpect((await harness.call('list_members', {})).output).toBe('[]')
    await harness.dispose()
  })

  it('gives the server none of the operator environment but PATH, locale and terminal', async () => {
    const env = { PATH: process.env.PATH, LANG: 'en_US.UTF-8', ANTHROPIC_API_KEY: 'sk-secret', NODE_OPTIONS: '--require x', HOME: '/home/operator', GITHUB_TOKEN: 'ghp_secret' }
    const harness = mcpHarness(command, { cwd: fixtures, env })
    await harness.reset()
    const { output } = await harness.call('env_names', {})
    vitestExpect(output).not.toMatch(/sk-secret|ghp_secret|--require|\/home\/operator/)
    vitestExpect(output).toContain('LANG=en_US.UTF-8')
    vitestExpect(output).toMatch(/^HOME=.*ui-tests-agent-.*\/home$/m)
    await harness.dispose()
  })

  it('says so when the server does not start', async () => {
    const harness = mcpHarness('node ./missing-server.mjs', { cwd: fixtures })
    await vitestExpect(harness.reset()).rejects.toThrow(/did not start/)
    await harness.dispose()
  })

  it('refuses to run agent trials in a run that is not an agent run, and disposes the harness', async () => {
    const made = await agentStudy({ target: { mcp: command }, hook: adaAdded, trials: 1 })
    stores.push(made.store)
    let disposed = false
    const harness = { ...mcpHarness(command, { cwd: fixtures }), dispose: async () => { disposed = true } }
    await vitestExpect(runTrials({ ...made, run: { ...made.run, actor: 'human' }, model: scriptedModel([done]), harness })).rejects.toThrow(/not in .*, which is for humans/)
    vitestExpect(disposed).toBe(true)
  })

  it('shows an agent attempt neither the screener nor the practice screen', async () => {
    const made = await agentStudy({ target: { mcp: command }, hook: adaAdded, trials: 1 })
    stores.push(made.store)
    const { attempt } = await made.store.createAttempt({ runId: made.run.run, participant: 'agent:0:1', goalIndex: 0, rehearsal: false })
    const asAgent = participantView(made.run, attempt)
    const asHuman = participantView({ ...made.run, actor: 'human' }, attempt)
    vitestExpect([asAgent.practice, asAgent.screener]).toEqual([false, []])
    vitestExpect(asHuman.practice).toBe(true)
  })
})
