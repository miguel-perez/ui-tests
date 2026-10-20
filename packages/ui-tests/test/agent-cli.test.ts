import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect as vitestExpect, it } from 'vitest'
import { main, type Io } from '../src/cli/main.ts'
import { cliHarness, splitWords, strippedEnv } from '../src/agents/harness-cli.ts'
import { runTrials, type Trial } from '../src/agents/loop.ts'
import { scriptedModel, type ScriptedTurn } from '../src/agents/scripted.ts'
import { globToRegExp } from '../src/agents/workspace.ts'
import { expect } from '../src/expect.ts'
import type { RunStore } from '../src/store/types.ts'
import { agentStudy } from './agent-fixtures.ts'

const fixtures = join(import.meta.dirname, 'fixtures', 'agents')
const command = 'node ./fake-cli.mjs'
const reportExists = async ({ workspace }: { workspace: { file(glob: string): string | null | undefined } }) => {
  expect(workspace.file('.ui-tests/runs/*/report.json')).toExist()
}
const run = (args = ''): ScriptedTurn => ({ toolCalls: [{ name: 'run', input: { command: `${command}${args}` } }] })
const done: ScriptedTurn = { text: 'The report is written.' }

let stores: RunStore[] = []
afterEach(async () => { for (const store of stores) await store.close(); stores = [] })

async function trialsOf(script: ScriptedTurn[] | ScriptedTurn[][], trials = 5): Promise<Trial[]> {
  const made = await agentStudy({ target: { cli: command }, hook: reportExists, trials })
  stores.push(made.store)
  return runTrials({ ...made, model: scriptedModel(script), harness: cliHarness(command, { cwd: fixtures }) })
}

describe('agent trials through the cli harness', () => {
  it('runs five trials, each verified by the PRD 04 outcome, in a different workspace each', async () => {
    const made = await agentStudy({ target: { cli: command }, hook: reportExists })
    stores.push(made.store)
    const trials = await runTrials({ ...made, model: scriptedModel([run(), done]), harness: cliHarness(command, { cwd: fixtures }) })
    vitestExpect(trials.map(t => t.state)).toEqual(['verified', 'verified', 'verified', 'verified', 'verified'])
    vitestExpect(trials.every(t => t.claimedDone && !t.recovered && t.stoppedBy === undefined)).toBe(true)
    const outputs = trials.map(t => t.transcript.find(m => m.role === 'tool')).map(m => m?.role === 'tool' ? m.output : '')
    vitestExpect(new Set(outputs).size).toBe(5)
    vitestExpect(trials[0].sideEffects).toEqual(['created .ui-tests/runs/r1/report.json'])
    vitestExpect(trials[0].cost).toMatchObject({ tokens: 240, calls: 2 })
    vitestExpect(trials[0].transcript[0]).toEqual({ role: 'user', text: 'Get a first result from the tool.' })
    const attempts = await made.store.listAttempts(made.run.run)
    vitestExpect(attempts.map(a => [a.status, a.reason, a.verification?.status])).toEqual(Array(5).fill(['finished', 'done', 'correct']))
  })

  it('reads a claimed done without the file as stopped: a false success, with what stopped it in one line', async () => {
    const [trial] = await trialsOf([done], 1)
    vitestExpect(trial).toMatchObject({ state: 'stopped', claimedDone: true, recovered: false })
    vitestExpect(trial.stoppedBy).toMatch(/^said it was done, but toExist/)
    vitestExpect(trial.stoppedBy).not.toContain('\n')
    vitestExpect(trial.verification.status).toBe('incorrect')
    vitestExpect(trial.cost).toMatchObject({ tokens: 120, calls: 1 })
  })

  it('marks a trial that hit an error and still verified as recovered', async () => {
    const [trial] = await trialsOf([run(' --bad'), run(), done], 1)
    vitestExpect(trial).toMatchObject({ state: 'verified', recovered: true })
    const failed = trial.transcript.find(m => m.role === 'tool' && m.error)
    vitestExpect(failed).toMatchObject({ error: 'ran `node ./fake-cli.mjs --bad`, which exited 1: unknown flag --bad' })
  })

  it('names the failed call a stopped trial ended on, and counts its cost', async () => {
    const [trial] = await trialsOf([run(' --bad'), { text: 'I could not get it to work.' }], 1)
    vitestExpect(trial).toMatchObject({ state: 'stopped', claimedDone: true, stoppedBy: 'ran `node ./fake-cli.mjs --bad`, which exited 1: unknown flag --bad' })
    vitestExpect(trial.cost.calls).toBe(2)
    vitestExpect(trial.cost.tokens).toBeGreaterThan(0)
  })

  it('records a clarifying question as a behaviour, not a failure', async () => {
    const [trial] = await trialsOf([{ text: 'Which folder should the report go in?' }, run(), done], 1)
    vitestExpect(trial.state).toBe('verified')
    vitestExpect(trial.behaviours).toEqual(['asked: Which folder should the report go in?'])
    vitestExpect(trial.transcript.some(m => m.role === 'user' && m.text.startsWith('Nobody can answer questions'))).toBe(true)
  })

  it('ends a trial at its call budget, a model failure or a refusal, and says so', async () => {
    const made = await agentStudy({ target: { cli: command }, hook: reportExists, trials: 3 })
    stores.push(made.store)
    made.run.compiled.agents = { config: { model: { provider: 'scripted', name: 'fixture' }, budgets: { calls: 2 } }, fingerprint: 'x' }
    const loop = Array(5).fill({ toolCalls: [{ name: 'run', input: { command: `${command} --env` } }] })
    const trials = await runTrials({ ...made, model: scriptedModel([loop, [{ throws: 'overloaded' }], [{ text: 'I will not do that.', stop: 'refusal' }]]), harness: cliHarness(command, { cwd: fixtures }) })
    vitestExpect(trials.map(t => t.stoppedBy)).toEqual(['ran out of its budget of 2 model calls', 'the model failed: overloaded', 'declined the task: I will not do that.'])
    vitestExpect(trials.map(t => t.claimedDone)).toEqual([false, false, false])
    vitestExpect((await made.store.listAttempts(made.run.run)).map(a => a.reason)).toEqual(['gave up', 'gave up', 'gave up'])
  })
})

describe('the cli harness sandbox', () => {
  it('runs only the configured command, without a shell', async () => {
    const harness = cliHarness(command, { cwd: fixtures })
    await harness.reset()
    for (const line of ['rm -rf /', 'node -e "1"', 'node ./other.mjs']) {
      vitestExpect((await harness.call('run', { command: line })).error).toBe(`tried to run \`${line}\`, but only \`node ./fake-cli.mjs …\` can be run here`)
    }
    const injected = await harness.call('run', { command: `${command}; touch pwned` })
    vitestExpect(injected.error).toContain('only `node ./fake-cli.mjs …`')
    vitestExpect((await harness.call('shell', { command: 'ls' })).error).toBe('called shell, which is not a tool here')
    await harness.dispose()
  })

  it('strips secrets from the environment', async () => {
    const harness = cliHarness(command, { cwd: fixtures, env: { PATH: process.env.PATH, HOME: '/tmp', ANTHROPIC_API_KEY: 'k', GITHUB_TOKEN: 't', UI_TESTS_CLI_SECRET: 's', UI_TESTS_DATA_DIR: '/x', DATABASE_URL: 'p', MY_PASSWORD: 'p' } })
    await harness.reset()
    const { output } = await harness.call('run', { command: `${command} --env` })
    vitestExpect(output.split('\n')).toEqual(vitestExpect.arrayContaining(['HOME', 'PATH']))
    for (const name of ['ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'UI_TESTS_CLI_SECRET', 'UI_TESTS_DATA_DIR', 'DATABASE_URL', 'MY_PASSWORD']) vitestExpect(output).not.toContain(name)
    vitestExpect(Object.keys(strippedEnv({ NPM_TOKEN: 'x', LANG: 'en' }))).toEqual(['LANG'])
    await harness.dispose()
  })

  it('stops a command past its time limit and caps its output', async () => {
    const harness = cliHarness(command, { cwd: fixtures, timeoutMs: 300, outputCap: 1000 })
    await harness.reset()
    vitestExpect((await harness.call('run', { command: `${command} --sleep` })).error).toBe('ran `node ./fake-cli.mjs --sleep`, which ran past 300 ms and was stopped')
    const big = await harness.call('run', { command: `${command} --big` })
    vitestExpect(big.output).toContain('[output cut at 1000 characters]')
    vitestExpect(big.output.length).toBeLessThan(1200)
    await harness.dispose()
  })

  it('splits words with quotes and matches globs', () => {
    vitestExpect(splitWords(`npx ui-tests --study "first run" 'a b' c\\ d`)).toEqual(['npx', 'ui-tests', '--study', 'first run', 'a b', 'c d'])
    vitestExpect(globToRegExp('.ui-tests/runs/*/report.json').test('.ui-tests/runs/r1/report.json')).toBe(true)
    vitestExpect(globToRegExp('.ui-tests/runs/*/report.json').test('.ui-tests/runs/a/b/report.json')).toBe(false)
    vitestExpect(globToRegExp('**/report.json').test('report.json')).toBe(true)
    vitestExpect(globToRegExp('**/report.json').test('a/b/report.json')).toBe(true)
  })
})

describe('ui-tests --actor agent', () => {
  const studySource = `import { expect, outcome, study, task } from 'ui-tests'

study('first run', { users: 'developers trying ui-tests for the first time', purpose: 'find out whether an agent gets a result', actors: ['agent'], target: { cli: 'node ./fake-cli.mjs' } }, () => {
  task('get a result on the example', { trials: 2 }, () => {
    outcome(async ({ workspace }) => {
      expect(workspace.file('.ui-tests/runs/*/report.json')).toExist()
    })
  })
})
`
  async function project(agents: string, script?: unknown) {
    const work = await mkdtemp(join(fixtures, '.tmp-agent-run-'))
    const data = await mkdtemp(join(tmpdir(), 'ui-tests-agent-run-'))
    await copyFile(join(fixtures, 'fake-cli.mjs'), join(work, 'fake-cli.mjs'))
    await writeFile(join(work, 'first-run.ui.test.ts'), studySource)
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { reporters: ['default', 'json'], agents: ${agents} }\n`)
    if (script) await writeFile(join(work, 'agent-script.json'), JSON.stringify(script))
    const cli = async (argv: string[], env: Record<string, string> = {}) => {
      let out = '', err = ''
      const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, PATH: process.env.PATH ?? '', ...env } }
      return { code: await main(argv, io), out, err }
    }
    return { work, cli, cleanup: async () => { await rm(work, { recursive: true, force: true }); await rm(data, { recursive: true, force: true }) } }
  }

  it('runs the trials, prints the table under the capability heading, and writes report.json', async () => {
    const p = await project("{ model: { provider: 'scripted', name: './agent-script.json' } }", [{ toolCalls: [{ name: 'run', input: { command: 'node ./fake-cli.mjs' } }] }, { text: 'Done.' }])
    try {
      const first = await p.cli(['--actor', 'agent', '--commit', 'abc'])
      vitestExpect(first.code).toBe(0)
      vitestExpect(first.out).toMatch(/^Agent run r_\w+ · capability test, not usability\n/)
      vitestExpect(first.out).toMatch(/  1  verified .*240 tokens  2 calls\n  2  verified/)
      vitestExpect(first.out).toContain('pass^k: pass · 2 of 2 verified')
      const runId = /Agent run (r_\w+)/.exec(first.out)![1]
      const report = JSON.parse(await readFile(join(p.work, '.ui-tests', 'runs', runId, 'report.json'), 'utf8'))
      vitestExpect(report).toMatchObject({ run: runId, actor: 'agent', heading: 'capability test, not usability', tasks: [{ name: 'get a result on the example', reliability: 'all', result: 'pass' }] })
      vitestExpect(report.key).toMatch(/^abc:.+:[0-9a-f]{12}:agent$/)
      vitestExpect(report.tasks[0].trials.map((t: Trial) => t.state)).toEqual(['verified', 'verified'])
      const again = await p.cli(['--actor', 'agent', '--commit', 'abc'])
      vitestExpect(again.out).toContain(`Run ${runId} already exists for key`)
      vitestExpect(again.code).toBe(0)
    } finally { await p.cleanup() }
  })

  it('exits 1 when a trial stops, and 2 without an agent model it can run', async () => {
    const p = await project("{ model: { provider: 'scripted', name: './agent-script.json' } }", [{ text: 'Done.' }])
    try {
      const failed = await p.cli(['--actor', 'agent'])
      vitestExpect(failed.code).toBe(1)
      vitestExpect(failed.out).toContain('pass^k: fail · 0 of 2 verified')
      vitestExpect(failed.out).toContain('(said it was done)')
    } finally { await p.cleanup() }
    const keyless = await project("{ model: { provider: 'anthropic', name: 'claude-opus-5-5' } }")
    try {
      const result = await keyless.cli(['--actor', 'agent'])
      vitestExpect(result.code).toBe(2)
      vitestExpect(result.err).toContain('ANTHROPIC_API_KEY')
    } finally { await keyless.cleanup() }
  })
})
