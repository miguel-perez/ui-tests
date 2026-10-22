import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { example } from '../../../apps/web/lib/copy.ts'
import { agentFingerprint, type AgentConfig } from '../src/agents/config.ts'
import { compiledStudySchema, compileStudy } from '../src/compile.ts'
import { main, type Io } from '../src/cli/main.ts'
import { lint } from '../src/lint.ts'
import { idempotencyKey } from '../src/runner/key.ts'
import * as api from '../src/index.ts'
import { stubServer } from './server-stub.ts'
import { draftSnapshots } from './snapshots.ts'

const { getStudies, resetStudies } = api
const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
beforeEach(() => resetStudies())

function evaluate(source: string) {
  new Function('study', 'setup', 'task', 'outcome', 'expect', 'participant', source.replace(/^import .*$/m, ''))(api.study, api.setup, api.task, api.outcome, api.expect, api.participant)
}
function run(source: string, config: Record<string, unknown> = { product: 'ui-tests' }, actor?: 'human' | 'agent') {
  resetStudies()
  evaluate(source)
  const study = getStudies()[0]
  const compiled = compileStudy(study, config)
  return { compiled, findings: lint({ study, compiled, sourceText: source, config, actor }) }
}
const actorFindings = <T extends { rule: string }>(findings: T[]) => findings.filter(f => f.rule === 'actor-admitted')

const cliFirstRun = (actors = "['agent']") => `
study('cli-first-run', { users: 'developers', purpose: 'get a first result from the command line', actors: ${actors}, target: { cli: 'npx ui-tests' } }, () => {
  task('run the first check', { trials: 5 }, () => { outcome(async () => {}) })
})`

describe('actors, targets and trials', () => {
  it('compiles the cli-first-run study for the agent with its target and trials', () => {
    const { compiled, findings } = run(cliFirstRun())
    expect(compiled.actors).toEqual(['agent'])
    expect(compiled.goals[0].agent).toEqual({ target: { kind: 'cli', value: 'npx ui-tests' }, trials: 5, reliability: 'all' })
    expect(actorFindings(findings)).toEqual([])
    expect(compiledStudySchema.parse(JSON.parse(JSON.stringify(compiled)))).toEqual(compiled)
  })

  it('defaults trials to 5 and reliability to all, and reads them from the task', () => {
    const source = `study('s', { users: 'developers', actors: ['agent'], target: { mcp: 'npx server' } }, () => {
  task('a', () => { outcome(async () => {}) })
  task('b', { trials: 3, reliability: 'any' }, () => { outcome(async () => {}) })
})`
    const { compiled } = run(source)
    expect(compiled.goals.map(g => g.agent)).toEqual([
      { target: { kind: 'mcp', value: 'npx server' }, trials: 5, reliability: 'all' },
      { target: { kind: 'mcp', value: 'npx server' }, trials: 3, reliability: 'any' },
    ])
  })

  it('lets a task target replace the study target', () => {
    const source = `study('s', { users: 'developers', actors: ['agent'], target: { cli: 'npx ui-tests' } }, () => {
  task('a', { target: { http: 'https://api.weekboard.app' } }, () => { outcome(async () => {}) })
  task('b', () => { outcome(async () => {}) })
})`
    const { compiled } = run(source)
    expect(compiled.goals[0].agent!.target).toEqual({ kind: 'http', value: 'https://api.weekboard.app' })
    expect(compiled.goals[1].agent!.target).toEqual({ kind: 'cli', value: 'npx ui-tests' })
  })

  it('falls back to the config url as a web target, and carries independent', () => {
    const source = `study('s', { users: 'developers', actors: ['agent'], independent: true }, () => { task('a', () => { outcome(async () => {}) }) })`
    const { compiled } = run(source, { product: 'x', target: { url: 'http://localhost:4000' } })
    expect(compiled.goals[0].agent!.target).toEqual({ kind: 'web', value: 'http://localhost:4000' })
    expect(compiled.independent).toBe(true)
  })

  it('has no agent on a human-only study', () => {
    const { compiled } = run(example)
    expect(compiled.goals.every(g => g.agent === undefined)).toBe(true)
    expect(compiled.agents).toBeUndefined()
  })

  it('pins the agent configuration and fingerprints it', () => {
    const agents: AgentConfig = { model: { provider: 'scripted', name: 'fixture' }, tools: ['shell'] }
    const { compiled } = run(cliFirstRun(), { product: 'x', agents })
    expect(compiled.agents).toEqual({ config: agents, fingerprint: agentFingerprint(agents) })
    expect(compiledStudySchema.parse(JSON.parse(JSON.stringify(compiled)))).toEqual(compiled)
  })

  it('fails actor-admitted when human is listed with a cli, mcp or http target', () => {
    const { findings } = run(cliFirstRun("['human', 'agent']"))
    expect(actorFindings(findings)[0]).toMatchObject({ severity: 'error', source: 'this contract' })
    expect(actorFindings(findings)[0].message).toContain('a human terminal harness is a planned omission')
    const task = `study('s', { users: 'developers', actors: ['human', 'agent'] }, () => { task('a', { target: { http: 'https://x.example' } }, () => { outcome(async () => {}) }) })`
    expect(actorFindings(run(task).findings)).toHaveLength(1)
  })

  it('fails actor-admitted for --actor agent on a human-only study, and passes it when admitted', () => {
    expect(actorFindings(run(example, { product: 'ui-tests' }, 'agent').findings)).toHaveLength(1)
    expect(actorFindings(run(example, { product: 'ui-tests' }, 'human').findings)).toEqual([])
    expect(actorFindings(run(cliFirstRun(), { product: 'x' }, 'agent').findings)).toEqual([])
  })
})

describe('agent fingerprint and key', () => {
  const base: AgentConfig = { model: { provider: 'anthropic', name: 'claude' }, budgets: { tokens: 1000, calls: 5 } }
  it('ignores key order and changes with any field', () => {
    expect(agentFingerprint({ budgets: { calls: 5, tokens: 1000 }, model: { name: 'claude', provider: 'anthropic' } })).toBe(agentFingerprint(base))
    for (const changed of [{ ...base, system: 'be brief' }, { ...base, model: { ...base.model, version: '2' } }, { ...base, tools: ['shell'] }, { ...base, permissions: { network: true } }, { ...base, budgets: { tokens: 999 } }]) {
      expect(agentFingerprint(changed)).not.toBe(agentFingerprint(base))
    }
  })
  it('puts the fingerprint before the actor for an agent', () => {
    const fingerprint = agentFingerprint(base)
    expect(idempotencyKey({ commit: 'abc', contextId: 'c_1', actor: 'agent', fingerprint })).toBe(`abc:c_1:${fingerprint}:agent`)
    expect(idempotencyKey({ pr: 4, contextId: 'c_1', actor: 'agent', fingerprint })).toBe(`pr-4:c_1:${fingerprint}:agent`)
    expect(idempotencyKey({ commit: 'abc', contextId: 'c_1', actor: 'human' })).toBe('abc:c_1:human')
  })
})

describe('the commands', () => {
  let target: Server, work: string, data: string, url: string
  let server: Awaited<ReturnType<typeof stubServer>>
  beforeAll(async () => {
    target = createServer((_req, res) => res.end('ok'))
    await new Promise<void>(resolve => target.listen(0, '127.0.0.1', resolve))
    url = `http://127.0.0.1:${(target.address() as AddressInfo).port}`
    server = await stubServer()
    work = await mkdtemp(join(fixtures, '.tmp-actors-'))
    data = await mkdtemp(join(tmpdir(), 'ui-tests-actors-'))
    await copyFile(join(fixtures, 'cli-dev/dev.ui.test.ts'), join(work, 'dev.ui.test.ts'))
    await writeFile(join(work, 'ui-tests.config.ts'), `export default { server: { url: '${server.url}' }, target: { url: '${url}' }, agents: { model: { provider: 'scripted', name: 'fixture' } } }\n`)
    await draftSnapshots(work)
  })
  afterAll(async () => {
    await server.close()
    target.closeAllConnections()
    await new Promise(resolve => target.close(resolve))
    await rm(work, { recursive: true, force: true })
    await rm(data, { recursive: true, force: true })
  })
  async function cli(argv: string[]) {
    let out = '', err = ''
    const io: Io = { stdout: { write: t => (out += t) }, stderr: { write: t => (err += t) }, cwd: work, env: { UI_TESTS_DATA_DIR: data } }
    const code = await main(argv, io)
    return { code, out, err }
  }

  it('refuses --actor both in dev mode, recruit and check', async () => {
    for (const argv of [['--actor', 'both'], ['recruit', '--actor', 'both'], ['check', '--actor', 'both']]) {
      const result = await cli(argv)
      expect(result.code).toBe(2)
      expect(result.err).toContain('--actor both')
    }
  })

  it('makes an agent run whose key ends in :agent and holds the agent fingerprint', async () => {
    const result = await cli(['recruit', '--json', '--actor', 'agent', '--commit', 'abc123'])
    expect(result.code).toBe(0)
    const handle = JSON.parse(result.out)
    const fingerprint = agentFingerprint({ model: { provider: 'scripted', name: 'fixture' } })
    expect(handle.actor).toBe('agent')
    expect(handle.key).toBe(`abc123:${handle.context.id}:${fingerprint}:agent`)
  })
})
