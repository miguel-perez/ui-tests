import { getStudies, resetStudies, study, task } from '../src/authoring.ts'
import { compileStudy } from '../src/compile.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { RunRow } from '../src/store/types.ts'
import type { Hook, Target } from '../src/types.ts'
import { outcome } from '../src/authoring.ts'
import { newRun } from './store-conformance.ts'

/** Authors a one-task agent study on `target`, compiles it with a scripted agent, and makes its run in a fresh store. */
export async function agentStudy(input: { target: Target; hook: Hook; trials?: number; scenario?: string; runTarget?: string }) {
  resetStudies()
  study('agent study', { users: 'developers', purpose: 'find out whether an agent gets through', actors: ['agent'], target: input.target }, () => {
    task('get a result', { trials: input.trials ?? 5, scenario: input.scenario ?? 'Get a first result from the tool.' }, () => { outcome(input.hook) })
  })
  const authored = getStudies()[0]
  const compiled = compileStudy(authored, { product: 'weekboard', agents: { model: { provider: 'scripted', name: 'fixture' } } })
  const store = new SqliteStore(':memory:')
  const { run } = await store.createRun(newRun(`k-${Math.random()}`, { compiled, actor: 'agent', target: input.runTarget ?? 'http://127.0.0.1:9' }))
  return { study: authored, compiled, goal: compiled.goals[0], store, run: run as RunRow }
}
