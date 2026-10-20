import type { Reachability } from './hosts.ts'
import type { CompiledStudy } from '../schema/compiled.ts'
import { originOf } from '../server/origins.ts'
import type { RunRow, RunStore } from '../store/types.ts'

export type CreateRunInput = {
  store: RunStore
  compiled: CompiledStudy
  hooksBundle: string
  target: string
  /** Where participants open the app when that is not the target (a tunnel or deployed address); defaults to the target. */
  appUrl?: string
  key: string
  actor: 'human' | 'agent'
  rehearsal: boolean
  commit?: string
  deadlineHours?: number
  /** Whether the target answered when the run was made, and how participants reach it: facts of the run, not of the compiled study. */
  reachability?: { url: string; reachable: boolean; checkedAt: string; mode?: Reachability; /** Set by `recruit --local`: nothing about this run is ever sent off the machine. */ localOnly?: boolean }
}

/** Creates the run for a compiled study, idempotent on `key`: a repeated key returns the existing run with `created: false`. */
export function createRun(input: CreateRunInput): Promise<{ run: RunRow; created: boolean }> {
  const { compiled, target } = input
  const appUrl = input.appUrl ?? target
  const origin = originOf(appUrl)
  return input.store.createRun({
    key: input.key,
    context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
    build: { url: target, commit: input.commit ?? 'local' },
    actor: input.actor,
    compiled,
    hooksBundle: input.hooksBundle,
    rehearsal: input.rehearsal,
    target,
    appUrl,
    ...(origin && { origins: [origin] }),
    ...(input.deadlineHours !== undefined && { deadline: new Date(Date.now() + input.deadlineHours * 3_600_000).toISOString() }),
    ...(input.reachability && { reachability: input.reachability }),
  })
}
