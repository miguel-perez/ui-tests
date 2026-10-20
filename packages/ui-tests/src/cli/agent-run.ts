import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { anthropicModel } from '../agents/anthropic.ts'
import { agentFingerprint, type AgentConfig } from '../agents/config.ts'
import { cliHarness } from '../agents/harness-cli.ts'
import { httpHarness } from '../agents/harness-http.ts'
import { runTrials, TRIAL_ANSWER, type Trial } from '../agents/loop.ts'
import type { AgentModel, Harness } from '../agents/model.ts'
import { scriptedModel, type ScriptedTurn } from '../agents/scripted.ts'
import { loadConfig } from '../config.ts'
import { formatFindings, lint } from '../lint.ts'
import { StudyLoadError } from '../load.ts'
import { createRun } from '../runner/create-run.ts'
import { gitCommit, idempotencyKey } from '../runner/key.ts'
import { handleOf } from '../runner/progress.ts'
import { checkReachable } from '../runner/setup.ts'
import type { CompiledGoal } from '../schema/compiled.ts'
import { openStore } from '../store/open.ts'
import type { UiTestsConfig } from '../types.ts'
import { loadStudies, withProduct } from './lint.ts'
import type { Command, Io } from './main.ts'

export const AGENT_HEADING = 'capability test, not usability'

/** The model the configured agent runs on: a script file for `scripted`, Claude for `anthropic` (needs ANTHROPIC_API_KEY). */
async function modelFor(agent: AgentConfig, io: Io): Promise<AgentModel> {
  if (agent.model.provider === 'anthropic') return anthropicModel(agent.model, io.env.ANTHROPIC_API_KEY ?? '')
  const file = resolve(io.cwd, agent.model.name)
  let script: unknown
  try { script = JSON.parse(await readFile(file, 'utf8')) } catch {
    throw new Error(`The scripted agent reads its turns from a JSON file named by model.name; cannot read ${agent.model.name}`)
  }
  if (!Array.isArray(script)) throw new Error(`The script in ${agent.model.name} is not a list of turns`)
  return scriptedModel(script as ScriptedTurn[] | ScriptedTurn[][])
}

/** The harness for a goal's target; the mcp and web harnesses are not here yet. */
function harnessFor(goal: CompiledGoal, io: Io): Harness | string {
  const target = goal.agent?.target
  if (!target) return `The task "${goal.name}" has no agent target`
  if (target.kind === 'cli') return cliHarness(target.value, { cwd: io.cwd, env: io.env })
  if (target.kind === 'http') return httpHarness(target.value)
  return `The ${target.kind} harness is not shipped yet`
}

/** How a goal's trials read under its reliability: `all` (pass^k) needs every trial verified, `any` (pass@k) one. */
function verdict(trials: Trial[], reliability: 'all' | 'any'): 'pass' | 'fail' | 'inconclusive' {
  const count = (state: Trial['state']) => trials.filter(t => t.state === state).length
  if (reliability === 'any') return count('verified') ? 'pass' : count('unknown') ? 'inconclusive' : 'fail'
  return count('stopped') ? 'fail' : count('unknown') ? 'inconclusive' : 'pass'
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
function trialLines(trials: Trial[]): string[] {
  return trials.map(t => `  ${t.index}  ${t.state.padEnd(8)}  ${seconds(t.cost.wallMs).padStart(7)}  ${t.cost.tokens} tokens  ${t.cost.calls} calls${t.claimedDone && t.state === 'stopped' ? '  (said it was done)' : ''}${t.stoppedBy ? `\n     ${t.stoppedBy}` : ''}${t.behaviours.map(b => `\n     ${b}`).join('')}`)
}

/**
 * `ui-tests --actor agent`: runs the study's tasks as agent trials (five by default) with the configured model and the
 * harness for each task's target, verifies each trial's end state with the task's hooks, and prints the per-trial table.
 * The run is idempotent on its key (`${commit}:${contextId}:${fingerprint}:agent`): a repeated key shows the stored trials.
 * With the `json` reporter the report is written to `.ui-tests/runs/<run>/report.json`. Exits 0 pass, 1 fail, 3 inconclusive, 2 error.
 */
export const agentRun: Command = async (args, io) => {
  const json = args.flags.has('json')
  const out = json ? io.stderr : io.stdout
  let config: UiTestsConfig
  let loaded: Awaited<ReturnType<typeof loadStudies>>
  try {
    config = withProduct((await loadConfig(io.cwd)).config)
    loaded = await loadStudies(io.cwd, [], config)
  } catch (error) {
    io.stderr.write(`${error instanceof StudyLoadError ? error.message.replace(error.file, error.file.replace(`${io.cwd}/`, '')) : error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  const wanted = args.flags.get('study')
  const candidates = typeof wanted === 'string' ? loaded.filter(l => l.compiled.name === wanted) : loaded
  if (typeof wanted === 'string' && !candidates.length) { io.stderr.write(`No study named "${wanted}"\n`); return 2 }
  const chosen = candidates.find(l => l.compiled.actors.includes('agent'))
  if (!chosen) { io.stderr.write('No study admits the agent actor\n'); return 2 }
  const findings = lint({ study: chosen.study, compiled: chosen.compiled, sourceText: chosen.sourceText, config, actor: 'agent' })
  if (findings.some(f => f.severity === 'error')) { out.write(`${formatFindings(findings)}\n`); return 1 }
  if (!config.agents) { io.stderr.write('No agent is configured: set agents: { model: { provider, name } } in ui-tests.config.ts\n'); return 2 }

  const taskName = args.flags.get('task')
  const goals = typeof taskName === 'string' ? chosen.compiled.goals.filter(g => g.name === taskName) : chosen.compiled.goals
  if (!goals.length) { io.stderr.write(`No task named "${String(taskName)}" in "${chosen.compiled.name}"\n`); return 2 }
  for (const goal of goals) {
    const harness = harnessFor(goal, io)
    if (typeof harness === 'string') { io.stderr.write(`${harness}\n`); return 2 }
    await harness.dispose()
    if (goal.agent?.target.kind === 'http' && !(await checkReachable(goal.agent.target.value, io.deps?.fetch))) { io.stderr.write(`target not reachable: ${goal.agent.target.value}\n`); return 2 }
  }
  let model: AgentModel
  try { model = await modelFor(config.agents, io) } catch (error) { io.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); return 2 }

  const commitFlag = args.flags.get('commit')
  const commit = typeof commitFlag === 'string' ? commitFlag : await gitCommit(io.cwd)
  const keyFlag = args.flags.get('key')
  const fingerprint = chosen.compiled.agents?.fingerprint ?? agentFingerprint(config.agents)
  const key = typeof keyFlag === 'string' ? keyFlag : idempotencyKey({ commit, contextId: chosen.compiled.id, actor: 'agent', fingerprint })
  const target = config.target?.url ?? 'http://localhost:3000'

  const store = await openStore(io.env)
  try {
    const { run, created } = await createRun({ store, compiled: chosen.compiled, hooksBundle: chosen.code, target, key, commit, actor: 'agent', rehearsal: false })
    out.write(`Agent run ${run.run} · ${AGENT_HEADING}\n${chosen.compiled.name} · model ${config.agents.model.provider}/${config.agents.model.name} · agent ${fingerprint}\n`)
    const stored = (await store.listAttempts(run.run)).filter(a => a.answers[TRIAL_ANSWER] !== undefined)
    if (!created && stored.length) out.write(`Run ${run.run} already exists for key ${key}; showing its trials. Pass --key to run again.\n`)
    const results: { goal: CompiledGoal; trials: Trial[]; verdict: ReturnType<typeof verdict> }[] = []
    for (const goal of goals) {
      const reliability = goal.agent?.reliability ?? 'all'
      const kept = stored.filter(a => a.goalIndex === goal.index).map(a => ({ ...(a.answers[TRIAL_ANSWER] as Omit<Trial, 'transcript'>), transcript: [] }))
      const trials = kept.length ? kept : await runTrials({ store, run, study: chosen.study, goal, model, harness: harnessFor(goal, io) as Harness })
      const read = verdict(trials, reliability)
      results.push({ goal, trials, verdict: read })
      const verified = trials.filter(t => t.state === 'verified').length
      out.write(`\nTask "${goal.name}" · ${goal.agent?.target.kind} ${goal.agent?.target.value}\n${trialLines(trials).join('\n')}\n${reliability === 'all' ? 'pass^k' : 'pass@k'}: ${read} · ${verified} of ${trials.length} verified\n`)
    }
    const latest = (await store.getRun(run.run)) ?? run
    if (latest.states.collection !== 'complete') await store.updateRun(run.run, { states: { ...latest.states, collection: 'complete', verification: 'complete' } }, latest.revision)
    const handle = handleOf((await store.getRun(run.run)) ?? run)
    const report = {
      ...handle,
      actor: 'agent' as const,
      heading: AGENT_HEADING,
      study: chosen.compiled.name,
      agent: { fingerprint, config: config.agents },
      tasks: results.map(({ goal, trials, verdict: read }) => ({ name: goal.name, target: goal.agent?.target, trials: trials.map(({ transcript: _transcript, ...rest }) => rest), reliability: goal.agent?.reliability ?? 'all', result: read })),
    }
    if (config.reporters?.includes('json')) {
      const dir = join(io.cwd, '.ui-tests', 'runs', run.run)
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
      out.write(`\nReport: .ui-tests/runs/${run.run}/report.json\n`)
    }
    if (json) io.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return results.some(r => r.verdict === 'fail') ? 1 : results.some(r => r.verdict === 'inconclusive') ? 3 : 0
  } finally { await store.close() }
}
