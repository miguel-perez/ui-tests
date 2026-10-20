import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect as vitestExpect, it } from 'vitest'
import { main, type Io } from '../src/cli/main.ts'
import { fakeGitHub } from '../src/github/fake.ts'
import { openStore } from '../src/store/open.ts'
import { absolutePath, cliHarness, splitWords } from '../src/agents/harness-cli.ts'
import { runTrials, type Trial } from '../src/agents/loop.ts'
import type { AgentModel } from '../src/agents/model.ts'
import { packLocalPackage, type LocalPackage } from '../src/agents/pack.ts'
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
const done: ScriptedTurn = { text: 'The report is written.', toolCalls: [{ name: 'done', input: { summary: 'wrote the report' } }] }
const envOf = (output: string) => Object.fromEntries(output.split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

let stores: RunStore[] = []
afterEach(async () => { for (const store of stores) await store.close(); stores = [] })

async function trialsOf(script: ScriptedTurn[] | ScriptedTurn[][], trials = 5, model?: AgentModel, budgets?: Record<string, number>): Promise<{ trials: Trial[]; store: RunStore; runId: string }> {
  const made = await agentStudy({ target: { cli: command }, hook: reportExists, trials })
  stores.push(made.store)
  if (budgets) made.run.compiled.agents = { config: { model: { provider: 'scripted', name: 'fixture' }, budgets }, fingerprint: 'x' }
  const result = await runTrials({ ...made, model: model ?? scriptedModel(script), harness: cliHarness(command, { cwd: fixtures }) })
  return { trials: result, store: made.store, runId: made.run.run }
}

describe('agent trials through the cli harness', () => {
  it('runs five trials, each verified by the PRD 04 outcome, in a different workspace each', async () => {
    const { trials, store, runId } = await trialsOf([run(), done])
    vitestExpect(trials.map(t => t.state)).toEqual(['verified', 'verified', 'verified', 'verified', 'verified'])
    vitestExpect(trials.every(t => t.claimedDone && !t.recovered && t.stoppedBy === undefined)).toBe(true)
    const outputs = trials.map(t => t.transcript.find(m => m.role === 'tool')).map(m => m?.role === 'tool' ? m.output : '')
    vitestExpect(new Set(outputs).size).toBe(5)
    vitestExpect(trials[0].sideEffects).toEqual(['created .ui-tests/runs/r1/report.json'])
    vitestExpect(trials[0].cost).toMatchObject({ tokens: 240, calls: 2 })
    vitestExpect(trials[0].transcript[0]).toEqual({ role: 'user', text: 'Get a first result from the tool.' })
    const attempts = await store.listAttempts(runId)
    vitestExpect(attempts.map(a => [a.status, a.reason, a.verification?.status])).toEqual(Array(5).fill(['finished', 'done', 'correct']))
    vitestExpect(attempts.map(a => a.participant)).toEqual(['agent:0:1', 'agent:0:2', 'agent:0:3', 'agent:0:4', 'agent:0:5'])
  })

  it('reads done without the file as stopped: a false success, with what stopped it in one line', async () => {
    const { trials: [trial] } = await trialsOf([done], 1)
    vitestExpect(trial).toMatchObject({ state: 'stopped', claimedDone: true, recovered: false })
    vitestExpect(trial.stoppedBy).toMatch(/^said it was done, but toExist/)
    vitestExpect(trial.stoppedBy).not.toContain('\n')
    vitestExpect(trial.verification.status).toBe('incorrect')
    vitestExpect(trial.cost).toMatchObject({ tokens: 120, calls: 1 })
  })

  it('marks a trial that hit an error and still verified as recovered', async () => {
    const { trials: [trial] } = await trialsOf([run(' --bad'), run(), done], 1)
    vitestExpect(trial).toMatchObject({ state: 'verified', recovered: true })
    const failed = trial.transcript.find(m => m.role === 'tool' && m.error)
    vitestExpect(failed).toMatchObject({ error: 'ran `node ./fake-cli.mjs --bad`, which exited 1: unknown flag --bad' })
  })

  it('reads a final message without done as giving up, with that message as what stopped it', async () => {
    const { trials: [trial], store, runId } = await trialsOf([run(' --bad'), { text: 'I could not get it to work.' }], 1)
    vitestExpect(trial).toMatchObject({ state: 'stopped', claimedDone: false, stoppedBy: 'I could not get it to work.' })
    vitestExpect(trial.cost.calls).toBe(2)
    vitestExpect(trial.cost.tokens).toBeGreaterThan(0)
    vitestExpect((await store.listAttempts(runId))[0].reason).toBe('gave up')
  })

  it('reads give_up as giving up with its reason, and names the failed call when the agent says nothing', async () => {
    const { trials } = await trialsOf([[run(' --bad'), { toolCalls: [{ name: 'give_up', input: { reason: 'The flag is not known and there is no help.' } }] }], [run(' --bad'), { text: '' }]], 2)
    vitestExpect(trials.map(t => [t.claimedDone, t.stoppedBy])).toEqual([[false, 'The flag is not known and there is no help.'], [false, 'stopped without calling done']])
    const { trials: [quiet] } = await trialsOf([run(' --bad')], 1, undefined, { calls: 1 })
    vitestExpect(quiet.stoppedBy).toBe('ran `node ./fake-cli.mjs --bad`, which exited 1: unknown flag --bad')
  })

  it('records a clarifying question as a behaviour, not a failure', async () => {
    const { trials: [trial] } = await trialsOf([{ text: 'Which folder should the report go in?' }, run(), done], 1)
    vitestExpect(trial.state).toBe('verified')
    vitestExpect(trial.behaviours).toEqual(['asked: Which folder should the report go in?'])
    vitestExpect(trial.transcript.some(m => m.role === 'user' && m.text.startsWith('Nobody can answer questions'))).toBe(true)
  })

  it('ends a trial at its call budget, a reply cut off, or a refusal, and says so', async () => {
    const loop = Array(5).fill({ toolCalls: [{ name: 'run', input: { command: `${command} --env` } }] })
    const { trials, store, runId } = await trialsOf([loop, [{ text: 'Let me', stop: 'max_tokens' }], [{ text: 'I will not do that.', stop: 'refusal' }]], 3, undefined, { calls: 2 })
    vitestExpect(trials.map(t => t.stoppedBy)).toEqual(['ran out of its budget of 2 model calls', 'ran out of output tokens in the middle of a reply', 'declined the task: I will not do that.'])
    vitestExpect(trials.map(t => [t.state, t.claimedDone])).toEqual([['stopped', false], ['stopped', false], ['stopped', false]])
    vitestExpect((await store.listAttempts(runId)).map(a => a.reason)).toEqual(['gave up', 'gave up', 'gave up'])
  })

  it('reads a provider outage as unknown, not stopped', async () => {
    const { trials: [trial] } = await trialsOf([{ throws: 'overloaded' }], 1)
    vitestExpect(trial).toMatchObject({ state: 'unknown', claimedDone: false, infrastructure: 'the model provider failed: overloaded' })
    vitestExpect(trial.stoppedBy).toBeUndefined()
    vitestExpect(trial.cost.calls).toBe(1)
  })

  it('stops a trial at its seconds budget while the model is still thinking, and at a dollars budget it cannot keep', async () => {
    const slow: AgentModel = { step: () => new Promise(resolve => setTimeout(() => resolve({ toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stop: 'done' }), 5000)) }
    const started = Date.now()
    const { trials: [late] } = await trialsOf([], 1, slow, { seconds: 0.2 })
    vitestExpect(late.stoppedBy).toBe('ran out of its budget of 0.2 seconds')
    vitestExpect(Date.now() - started).toBeLessThan(3000)
    const { trials: [unpriced] } = await trialsOf([run(), done], 1, undefined, { dollars: 1 })
    vitestExpect(unpriced.stoppedBy).toBe('cannot keep its budget of $1: the model reports no price')
    const { trials: [priced] } = await trialsOf([{ ...run(' --bad'), usage: { dollars: 0.6 } }, { ...run(), usage: { dollars: 0.6 } }, done], 1, undefined, { dollars: 1 })
    vitestExpect(priced.stoppedBy).toBe('ran `node ./fake-cli.mjs --bad`, which exited 1: unknown flag --bad')
    vitestExpect(priced.cost).toMatchObject({ calls: 2, dollars: 1.2 })
    vitestExpect(priced.transcript.filter(m => m.role === 'tool')).toHaveLength(1)
  })
})

describe('the cli harness sandbox', () => {
  it('runs only the configured command and the allowed npm forms, without a shell', async () => {
    const harness = cliHarness(command, { cwd: fixtures })
    await harness.reset()
    for (const line of ['rm -rf /', 'node -e "1"', 'node ./other.mjs', 'sh -c ls']) {
      vitestExpect((await harness.call('run', { command: line })).error).toBe(`tried to run \`${line}\`, but only \`node ./fake-cli.mjs …\`, \`npm i -D ui-tests\` and \`npx ui-tests …\` can be run here`)
    }
    const injected = await harness.call('run', { command: `${command}; touch pwned` })
    vitestExpect(injected.error).toContain('can be run here')
    vitestExpect((await harness.endState()).sideEffects).toEqual([])
    vitestExpect((await harness.call('shell', { command: 'ls' })).error).toBe('called shell, which is not a tool here')
    await harness.dispose()
  })

  it('refuses every npm and npx form that could run a shell, leave the trial or reach a registry, before anything starts', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'ui-tests-escape-'))
    const marker = join(outside, 'escaped')
    const started: string[][] = []
    const recorder = ((file: string, args: readonly string[], opts: object) => { started.push([file, ...args]); return spawn(process.execPath, ['-e', ''], opts) }) as unknown as typeof spawn
    try {
      for (const target of [command, 'npx ui-tests']) {
        const harness = cliHarness(target, { cwd: fixtures, spawn: recorder })
        await harness.reset()
        const escapes = [
          `npx -c "touch ${marker}"`, `npx --call "touch ${marker}"`, 'npx -p left-pad left-pad', 'npx --yes ui-tests', 'npx left-pad', `npx ui-tests`,
          `npm exec -c "touch ${marker}"`, `npm x -- sh -c "touch ${marker}"`, 'npm --offline=false view left-pad version', 'npm view left-pad version',
          'npm i left-pad', 'npm i -D ui-tests left-pad', 'npm i -D ui-tests --registry=https://registry.npmjs.org/', 'npm i -D ui-tests --offline=false',
          `npm i --prefix=${outside} ui-tests`, `npm i --userconfig=${outside}/npmrc ui-tests`, 'npm i ui-tests --script-shell=/bin/sh', 'npm i -g ui-tests',
          `npm pkg set scripts.x="touch ${marker}"`, 'npm run x', 'npm run-script x', 'npm test', 'npm start', 'npm config set registry https://registry.npmjs.org/',
          'npm publish', 'npm ci ui-tests', 'npm ci -D', 'npm', 'npm --version',
        ]
        for (const line of escapes) {
          const result = await harness.call('run', { command: line })
          vitestExpect(result.error, line).toMatch(new RegExp(`^tried to run \`${line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`, but `))
        }
        vitestExpect((await harness.call('run', { command: 'npx ui-tests --help' })).error).toBe('tried to run `npx ui-tests --help`, but ui-tests is not installed in this project; install it with `npm i -D ui-tests`')
        await harness.dispose()
      }
      vitestExpect(started).toEqual([])
      vitestExpect(existsSync(marker)).toBe(false)
    } finally { await rm(outside, { recursive: true, force: true }) }
  })

  it('runs the allowed npm forms with the trial settings appended, offline and without scripts', async () => {
    const started: string[][] = []
    const recorder = ((file: string, args: readonly string[], opts: object) => { started.push([file, ...args]); return spawn(process.execPath, ['-e', ''], opts) }) as unknown as typeof spawn
    const harness = cliHarness('npx ui-tests', { spawn: recorder })
    await harness.reset()
    for (const line of ['npm i -D ui-tests', 'npm install --save-dev ui-tests', 'npm i', 'npm ci']) vitestExpect((await harness.call('run', { command: line })).error, line).toBeUndefined()
    const work = (await harness.endState()).workspace!.root
    const home = work.replace(/work$/, 'home')
    const fixed = ['--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-update-notifier', `--prefix=${work}`, `--userconfig=${home}/.npmrc`, `--cache=${home}/.npm`]
    vitestExpect(started.map(argv => argv.slice(1))).toEqual([['i', '-D', 'ui-tests', ...fixed], ['install', '--save-dev', 'ui-tests', ...fixed], ['i', ...fixed], ['ci', ...fixed]])
    vitestExpect(started.every(argv => argv[0].endsWith('/npm'))).toBe(true)
    await harness.dispose()
  })

  it('passes only an allowlist of the environment, with home, temp and the npm cache inside the trial', async () => {
    const env = { PATH: `relbin${':'}${process.env.PATH}`, HOME: homedir(), LANG: 'en_GB.UTF-8', LC_ALL: 'C', TERM: 'xterm', CI: '1', POSTGRES_URL: 'postgres://u:p@neon/db', NODE_OPTIONS: '--require /x.js', FOO_SECRET: 's', ANTHROPIC_API_KEY: 'k', npm_config_registry: 'https://registry.example' }
    const harness = cliHarness(command, { cwd: fixtures, env })
    await harness.reset()
    const seen = envOf((await harness.call('run', { command: `${command} --env` })).output)
    for (const name of ['POSTGRES_URL', 'NODE_OPTIONS', 'FOO_SECRET', 'ANTHROPIC_API_KEY']) vitestExpect(seen[name]).toBeUndefined()
    vitestExpect(seen).toMatchObject({ LANG: 'en_GB.UTF-8', LC_ALL: 'C', TERM: 'xterm', CI: '1', npm_config_offline: 'true' })
    vitestExpect(seen.HOME).not.toBe(homedir())
    const root = seen.HOME.replace(/\/home$/, '')
    vitestExpect(seen.HOME).toBe(`${root}/home`)
    vitestExpect(seen.TMPDIR).toBe(`${root}/tmp`)
    vitestExpect(seen.npm_config_cache).toBe(`${root}/home/.npm`)
    vitestExpect(seen.npm_config_userconfig).toBe(`${root}/home/.npmrc`)
    vitestExpect(seen.XDG_CONFIG_HOME).toBe(`${root}/home/.config`)
    vitestExpect(seen.npm_config_registry).toBeUndefined()
    vitestExpect(seen.PATH.split(':')).not.toContain('relbin')
    vitestExpect(absolutePath('a:/b::./c:/d')).toBe('/b:/d')
    await harness.reset()
    const next = envOf((await harness.call('run', { command: `${command} --env` })).output)
    vitestExpect(next.HOME).not.toBe(seen.HOME)
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

  it('refuses an empty command', () => {
    vitestExpect(() => cliHarness('  ')).toThrow('The cli target has no command')
  })

  it('splits words with quotes and matches globs', () => {
    vitestExpect(splitWords(`npx ui-tests --study "first run" 'a b' c\\ d`)).toEqual(['npx', 'ui-tests', '--study', 'first run', 'a b', 'c d'])
    vitestExpect(globToRegExp('.ui-tests/runs/*/report.json').test('.ui-tests/runs/r1/report.json')).toBe(true)
    vitestExpect(globToRegExp('.ui-tests/runs/*/report.json').test('.ui-tests/runs/a/b/report.json')).toBe(false)
    vitestExpect(globToRegExp('**/report.json').test('report.json')).toBe(true)
    vitestExpect(globToRegExp('**/report.json').test('a/b/report.json')).toBe(true)
  })
})

describe('the package installed in a trial', () => {
  let local: LocalPackage
  beforeAll(async () => { local = await packLocalPackage() }, 180_000)
  afterAll(() => local?.dispose())

  it('installs the local ui-tests offline with npm i -D, and npx ui-tests runs the local CLI', async () => {
    const harness = cliHarness('npx ui-tests', { localPackage: local })
    await harness.reset()
    const install = await harness.call('run', { command: 'npm i -D ui-tests' })
    vitestExpect(install.error).toBeUndefined()
    const help = await harness.call('run', { command: 'npx ui-tests --help' })
    vitestExpect(help.error).toBeUndefined()
    vitestExpect(help.output).toContain('--actor agent     run the study\'s tasks as agent trials')
    const { workspace, sideEffects } = await harness.endState()
    vitestExpect(JSON.parse(workspace!.file('package.json')!).devDependencies).toEqual({ 'ui-tests': `^${local.version}` })
    vitestExpect(sideEffects).toEqual(vitestExpect.arrayContaining(['created node_modules/', 'changed package.json']))
    vitestExpect((await harness.call('run', { command: 'npm i -D left-pad' })).error).toBe('tried to run `npm i -D left-pad`, but only `ui-tests` can be installed here')
    const again = await harness.call('run', { command: 'npm ci' })
    vitestExpect(again.error, again.output).toBeUndefined()
    await harness.dispose()
  }, 120_000)

  it('passes the repository\'s own agent study: five scripted trials install, init and lint through the real harness, offline', async () => {
    const work = await mkdtemp(join(fixtures, '.tmp-first-run-'))
    const data = await mkdtemp(join(tmpdir(), 'ui-tests-first-run-'))
    try {
      await copyFile(join(import.meta.dirname, '..', '..', '..', 'apps', 'web', 'ui-tests', 'cli-first-run.ui.test.ts'), join(work, 'cli-first-run.ui.test.ts'))
      await writeFile(join(work, 'ui-tests.config.ts'), "export default { reporters: ['default', 'json'], agents: { model: { provider: 'scripted', name: './agent-script.json' } } }\n")
      const line = (command: string): ScriptedTurn => ({ toolCalls: [{ name: 'run', input: { command } }] })
      await writeFile(join(work, 'agent-script.json'), JSON.stringify([line('npm i -D ui-tests'), line('npx ui-tests init'), line('npx ui-tests lint --out ui-tests-lint.json'), done]))
      let out = '', err = ''
      const io: Io = {
        stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, PATH: process.env.PATH ?? '' },
        // The run disposes of the package it packed; this one is shared with the test above, so it is kept.
        deps: { packLocal: async () => ({ ...local, dispose: () => {} }), signal: new AbortController().signal },
      }
      const code = await main(['--actor', 'agent', '--commit', 'abc'], io)
      vitestExpect(out, err).toContain('pass^k: pass · 5 of 5 verified')
      vitestExpect(code).toBe(0)
      const runId = /Agent run (r_\w+)/.exec(out)![1]
      const report = JSON.parse(await readFile(join(work, '.ui-tests', 'runs', runId!, 'report.json'), 'utf8'))
      vitestExpect(report.tasks[0].trials.map((t: Trial) => [t.state, t.claimedDone])).toEqual(Array(5).fill(['verified', true]))
    } finally {
      await rm(work, { recursive: true, force: true })
      await rm(data, { recursive: true, force: true })
    }
  }, 600_000)
})

describe('ui-tests --actor agent', () => {
  const studySource = (trials: number, cli = 'node ./fake-cli.mjs') => `import { expect, outcome, study, task } from 'ui-tests'

study('first run', { users: 'developers trying ui-tests for the first time', purpose: 'find out whether an agent gets a result', actors: ['agent'], target: { cli: '${cli}' } }, () => {
  task('get a result on the example', { trials: ${trials} }, () => {
    outcome(async ({ workspace }) => {
      expect(workspace.file('.ui-tests/runs/*/report.json')).toExist()
    })
  })
})
`
  async function project(agents: string, script?: unknown, trials = 2, cli?: string) {
    const work = await mkdtemp(join(fixtures, '.tmp-agent-run-'))
    const data = await mkdtemp(join(tmpdir(), 'ui-tests-agent-run-'))
    await copyFile(join(fixtures, 'fake-cli.mjs'), join(work, 'fake-cli.mjs'))
    await writeFile(join(work, 'first-run.ui.test.ts'), studySource(trials, cli))
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { reporters: ['default', 'json'], agents: ${agents} }\n`)
    if (script) await writeFile(join(work, 'agent-script.json'), JSON.stringify(script))
    const cli_ = async (argv: string[], deps: Io['deps'] = {}) => {
      let out = '', err = ''
      const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data, PATH: process.env.PATH ?? '' }, deps: { packLocal: async () => undefined, signal: new AbortController().signal, ...deps } }
      return { code: await main(argv, io), out, err }
    }
    return { work, data, cli: cli_, cleanup: async () => { await rm(work, { recursive: true, force: true }); await rm(data, { recursive: true, force: true }) } }
  }
  const scripted = "{ model: { provider: 'scripted', name: './agent-script.json' } }"
  const passing = [{ toolCalls: [{ name: 'run', input: { command: 'node ./fake-cli.mjs' } }] }, { toolCalls: [{ name: 'done', input: {} }] }]

  it('runs the trials, prints the table under the capability heading, and writes report.json', async () => {
    const p = await project(scripted, passing)
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
      vitestExpect(report.tasks[0]).toMatchObject({ passK: true, passAtK: true })
      const record = JSON.parse((await p.cli(['report', runId, '--json'])).out)
      vitestExpect(record).toMatchObject({ actor: 'agent', passK: true, evidence: [], handle: { result: 'none-found' } })
      vitestExpect(report.tasks[0].trials.map((t: Trial) => t.state)).toEqual(['verified', 'verified'])
      const again = await p.cli(['--actor', 'agent', '--commit', 'abc'])
      vitestExpect(again.out).toContain(`Run ${runId} already exists for key`)
      vitestExpect(again.out).not.toContain('trial 1 of')
      vitestExpect(again.code).toBe(0)
    } finally { await p.cleanup() }
  })

  it('delivers the ui-tests (agent) check itself when the run finishes, neutral and without a comment', async () => {
    const p = await project(scripted, passing, 2)
    try {
      const stopped = new AbortController()
      stopped.abort()
      vitestExpect((await p.cli(['--actor', 'agent', '--commit', 'ghi'], { signal: stopped.signal })).code).toBe(3)
      const store = await openStore({ UI_TESTS_DATA_DIR: p.data })
      const github = fakeGitHub()
      try {
        const [row] = await store.listRuns()
        const { id } = await github.createCheck({ owner: 'o', repo: 'r', headSha: 's', name: 'ui-tests (agent)', status: 'in_progress', title: 'Waiting', summary: 'x' })
        vitestExpect(await store.updateRun(row.run, { github: { owner: 'o', repo: 'r', pr: 7, headSha: 's', checkId: id, name: 'ui-tests (agent)' } }, row.revision)).toBe(true)
      } finally { await store.close() }
      const finished = await p.cli(['--actor', 'agent', '--commit', 'ghi'], { github })
      vitestExpect(finished.code).toBe(0)
      const update = github.calls.find(c => c.call === 'updateCheck')!.input as { conclusion: string; title: string }
      vitestExpect(update).toMatchObject({ conclusion: 'neutral', title: 'Capability test passed · 2 of 2 trials verified' })
      vitestExpect(github.calls.some(c => c.call === 'upsertComment')).toBe(false)
    } finally { await p.cleanup() }
  }, 30_000)

  it('finishes an interrupted run on the next invocation, and reads no verdict from fewer than k trials', async () => {
    const p = await project(scripted, passing, 5)
    try {
      const stop = new AbortController()
      let out = ''
      const io: Io = { stdout: { write: t => { out += t; if (t.includes('trial 1 of 5')) stop.abort(); return true } }, stderr: { write: () => true }, cwd: p.work, env: { UI_TESTS_DATA_DIR: join(p.work, 'data'), PATH: process.env.PATH ?? '' }, deps: { signal: stop.signal, packLocal: async () => undefined } }
      vitestExpect(await main(['--actor', 'agent', '--commit', 'def'], io)).toBe(3)
      vitestExpect(out).toContain('pass^k: pending · 1 of 1 verified · 1 of 5 trials run; run the same command again to finish')
      const runId = /Agent run (r_\w+)/.exec(out)![1]
      vitestExpect(JSON.parse(await readFile(join(p.work, '.ui-tests', 'runs', runId, 'report.json'), 'utf8')).tasks[0]).toMatchObject({ result: 'pending', passK: null, passAtK: null })
      out = ''
      const resumed = { ...io, deps: { signal: new AbortController().signal, packLocal: async () => undefined } }
      vitestExpect(await main(['--actor', 'agent', '--commit', 'def'], resumed)).toBe(0)
      vitestExpect(out).toContain('its 1 stored trial is kept')
      vitestExpect(out).toContain('trial 5 of 5: verified')
      vitestExpect(out).toContain('pass^k: pass · 5 of 5 verified')
      vitestExpect(out).toMatch(/\n  1  verified[^\n]*\n  2  verified[^\n]*\n  3  verified[^\n]*\n  4  verified[^\n]*\n  5  verified/)
    } finally { await p.cleanup() }
  }, 30_000)

  it('exits 1 when a trial stops, and 2 without an agent model it can run or a command to run', async () => {
    const p = await project(scripted, [{ toolCalls: [{ name: 'done', input: {} }] }])
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
    const empty = await project(scripted, passing, 2, ' ')
    try {
      const result = await empty.cli(['--actor', 'agent'])
      vitestExpect(result.code).toBe(2)
      vitestExpect(result.err).toContain('The cli target has no command')
    } finally { await empty.cleanup() }
  })
})
