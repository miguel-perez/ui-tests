import type { AuthoredStudy } from '../authoring.ts'
import type { AttemptRow, RunRow, RunStore } from '../store/types.ts'
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
export async function createInvites(input: { store: RunStore; run: RunRow; study: AuthoredStudy; count: number; target: string; bypass?: string; firstSlot?: number; linkBase?: string }): Promise<string[]> {
  const { store, run, study, count, target, bypass, firstSlot = 1, linkBase = target } = input
  const goalIndex = Math.max(0, run.compiled.goals.findIndex(g => g.primary))
  const links: string[] = []
  for (let slot = firstSlot; slot < firstSlot + count; slot++) {
    const setupValues = await runSetup(study, target, bypass ? { [BYPASS_HEADER]: bypass } : {})
    const { token } = await store.createAttempt({ runId: run.run, participant: `invite-${slot}`, goalIndex, rehearsal: false, setupValues })
    links.push(inviteLink(linkBase, run.run, token, bypass))
  }
  return links
}

/** The flag on an attempt that `reissueInvites` replaced: its token is revoked and it is not a slot. It is not a participant's reason to stop. */
export const RETIRED = 'retired'

/** A slot nobody has opened: made as an invite and not yet consented to. */
const unclaimed = (a: AttemptRow) => !a.rehearsal && a.status === 'created' && !a.flags.includes(RETIRED)

/**
 * Gives every unclaimed slot of a run a link under `linkBase`. A token is stored only as a hash, so a slot's old link cannot be
 * rebuilt for a new address: each slot is retired (flagged and its token revoked, so the old link opens nothing) and replaced by a new
 * attempt with the same participant, goal and setup values. A slot someone opened in the meantime is left alone. Returns the links in slot order.
 */
export async function reissueInvites(input: { store: RunStore; run: RunRow; linkBase: string; bypass?: string }): Promise<string[]> {
  const { store, run, linkBase, bypass } = input
  const links: string[] = []
  for (const slot of (await store.listAttempts(run.run)).filter(unclaimed)) {
    if (!(await store.updateAttempt(slot.id, { flags: [...slot.flags, RETIRED] }, 'created'))) continue
    await store.revokeTokens(slot.id)
    const { token } = await store.createAttempt({ runId: run.run, participant: slot.participant, goalIndex: slot.goalIndex, rehearsal: false, setupValues: slot.setupValues })
    links.push(inviteLink(linkBase, run.run, token, bypass))
  }
  return links
}

/** A slot that counts toward the run's planned invites: not a rehearsal, and not one `reissueInvites` retired. */
export const isSlot = (a: AttemptRow) => !a.rehearsal && !a.flags.includes(RETIRED)
