import type { CompiledStudy } from '../schema/compiled.ts'
import type { RunRow, RunStore } from '../store/types.ts'

export type CreateRunInput = {
  store: RunStore
  compiled: CompiledStudy
  hooksBundle: string
  target: string
  key: string
  actor: 'human' | 'agent'
  rehearsal: boolean
  commit?: string
  deadlineHours?: number
  /** Whether the target answered when the run was made: a fact of the run, not of the compiled study. */
  reachability?: { url: string; reachable: boolean; checkedAt: string }
}

/** Creates the run for a compiled study, idempotent on `key`: a repeated key returns the existing run with `created: false`. */
export function createRun(input: CreateRunInput): Promise<{ run: RunRow; created: boolean }> {
  const { compiled, target } = input
  return input.store.createRun({
    key: input.key,
    context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
    build: { url: target, commit: input.commit ?? 'local' },
    actor: input.actor,
    compiled,
    hooksBundle: input.hooksBundle,
    rehearsal: input.rehearsal,
    target,
    ...(input.deadlineHours !== undefined && { deadline: new Date(Date.now() + input.deadlineHours * 3_600_000).toISOString() }),
    ...(input.reachability && { reachability: input.reachability }),
  })
}
