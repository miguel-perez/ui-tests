import type { AuthoredStudy } from '../authoring.ts'
import type { CompiledGoal, CompiledImpression } from '../schema/compiled.ts'

export const impressionQuestion = 'What was that page for?'
export const impressionCodes = ['named the purpose', 'did not name it', 'no answer']

/** The first look: on at the primary start page unless the start comes from `setup` (without `firstLook: { page }`) or `firstLook: false`. */
export function deriveImpression(study: Pick<AuthoredStudy, 'options' | 'setup' | 'tasks'>, goals: CompiledGoal[]): CompiledImpression {
  const primary = study.tasks.find(t => t.options.primary) ?? study.tasks[0]
  const firstLook = study.options.firstLook ?? primary?.options.firstLook
  const base = { flashMs: 500 as const, question: impressionQuestion, codes: impressionCodes }
  if (firstLook === false) return { on: false, ...base, reason: 'off: firstLook is false' }
  if (firstLook) return { on: true, page: firstLook.page, ...base, reason: `on: firstLook page ${firstLook.page}` }
  if (study.setup) return { on: false, ...base, reason: 'off: the start comes from setup, so there is no page to show before it; add firstLook: { page } to turn it on' }
  const page = goals.find(g => g.primary)?.start ?? '/'
  return { on: true, page, ...base, reason: `on: the primary start page ${page}` }
}
