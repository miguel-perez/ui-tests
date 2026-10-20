import type { AuthoredStudy } from '../authoring.ts'
import type { RunRow, RunStore } from '../store/types.ts'
import { runSetup } from './setup.ts'

export const BYPASS_HEADER = 'x-vercel-protection-bypass'

/** The invite link for a participant token. With a protection-bypass secret it carries the query parameters that let the first visit through and set the bypass cookie. */
export function inviteLink(target: string, run: string, token: string, bypass?: string): string {
  const base = `${target.replace(/\/$/, '')}/ui-tests/${run}/?t=${encodeURIComponent(token)}`
  return bypass ? `${base}&x-vercel-protection-bypass=${encodeURIComponent(bypass)}&x-vercel-set-bypass-cookie=samesitenone` : base
}

/**
 * Makes `count` invite slots for a run: each runs the study's `setup` once, so its values are its own, and gets its own participant
 * token. Returns the links in slot order. `setup` requests carry the bypass header when a secret is given.
 */
export async function createInvites(input: { store: RunStore; run: RunRow; study: AuthoredStudy; count: number; target: string; bypass?: string; firstSlot?: number }): Promise<string[]> {
  const { store, run, study, count, target, bypass, firstSlot = 1 } = input
  const goalIndex = Math.max(0, run.compiled.goals.findIndex(g => g.primary))
  const links: string[] = []
  for (let slot = firstSlot; slot < firstSlot + count; slot++) {
    const setupValues = await runSetup(study, target, bypass ? { [BYPASS_HEADER]: bypass } : {})
    const { token } = await store.createAttempt({ runId: run.run, participant: `invite-${slot}`, goalIndex, rehearsal: false, setupValues })
    links.push(inviteLink(target, run.run, token, bypass))
  }
  return links
}
