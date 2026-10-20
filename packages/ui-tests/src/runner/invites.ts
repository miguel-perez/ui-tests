import type { AuthoredStudy } from '../authoring.ts'
import type { AttemptRow, RunRow, RunStore } from '../store/types.ts'
import { isAgentTrial } from '../agents/result.ts'
import { runSetup } from './setup.ts'
import { GOAL_ORDER, goalOrderFor, storedOrder } from './sequence.ts'

export const BYPASS_HEADER = 'x-vercel-protection-bypass'

/**
 * The invite link for a participant token: the player of the run on the ui-tests server. With a protection-bypass secret it carries
 * `bypass`, which the player puts on the address it hands the person to, so the first visit to the protected app gets through.
 */
export function inviteLink(server: string, run: string, token: string, bypass?: string): string {
  const base = `${server.replace(/\/$/, '')}/ui-tests/${run}/?t=${encodeURIComponent(token)}`
  return bypass ? `${base}&bypass=${encodeURIComponent(bypass)}` : base
}

/**
 * Makes the first attempt of a link participant: the first goal of their order (declared, or shuffled per person when the study is
 * `independent`), with the order stored on it. Later goals get their own attempts as the person finishes each one (`server/collector.ts`).
 */
export async function createParticipant(store: RunStore, input: { run: RunRow; participant: string; setupValues?: Record<string, unknown>; rehearsal?: boolean }): Promise<{ attempt: AttemptRow; token: string }> {
  const order = goalOrderFor(input.run.compiled, `${input.run.run}:${input.participant}`)
  // One transaction, so a failed second write cannot leave a slot that has only its first goal.
  const { made, answers } = await store.transaction(async tx => {
    const made = await tx.createAttempt({ runId: input.run.run, participant: input.participant, goalIndex: order[0] ?? 0, rehearsal: input.rehearsal ?? false, setupValues: input.setupValues ?? {} })
    const answers = { ...made.attempt.answers, [GOAL_ORDER]: order }
    await tx.updateAttempt(made.attempt.id, { answers }, 'created')
    return { made, answers }
  })
  return { attempt: { ...made.attempt, answers }, token: made.token }
}

/**
 * Makes `count` invite slots for a run: each runs the study's `setup` once against `target`, so its values are its own, and gets its
 * own participant token. Returns the links, on the server at `linkBase`, in slot order. `setup` requests carry the bypass header when
 * a secret is given.
 */
export async function createInvites(input: { store: RunStore; run: RunRow; study: AuthoredStudy; count: number; target: string; linkBase: string; bypass?: string; firstSlot?: number }): Promise<string[]> {
  const { store, run, study, count, target, bypass, firstSlot = 1, linkBase } = input
  const links: string[] = []
  for (let slot = firstSlot; slot < firstSlot + count; slot++) {
    const setupValues = await runSetup(study, target, bypass ? { [BYPASS_HEADER]: bypass } : {})
    const { token } = await createParticipant(store, { run, participant: `invite-${slot}`, setupValues })
    links.push(inviteLink(linkBase, run.run, token, bypass))
  }
  return links
}

/** The flag on an attempt that `reissueInvites` replaced: its token is revoked and it is not a slot. It is not a participant's reason to stop. */
export const RETIRED = 'retired'

/** A slot nobody has opened: made as an invite and not yet consented to. */
const unclaimed = (a: AttemptRow) => !a.rehearsal && a.status === 'created' && !a.flags.includes(RETIRED)

/**
 * Gives every unclaimed slot of a run a link on the server at `linkBase`. A token is stored only as a hash, so a slot's old link cannot be
 * rebuilt for a new address: each slot is retired (flagged and its token revoked, so the old link opens nothing) and replaced by a new
 * attempt with the same participant, goal and setup values. A slot someone opened in the meantime is left alone. Returns the links in slot order.
 */
export async function reissueInvites(input: { store: RunStore; run: RunRow; linkBase: string; bypass?: string }): Promise<string[]> {
  const { store, run, linkBase, bypass } = input
  const links: string[] = []
  for (const slot of (await store.listAttempts(run.run)).filter(unclaimed)) {
    if (!(await store.updateAttempt(slot.id, { flags: [...slot.flags, RETIRED] }, 'created'))) continue
    await store.revokeTokens(slot.id)
    const { attempt, token } = await store.createAttempt({ runId: run.run, participant: slot.participant, goalIndex: slot.goalIndex, rehearsal: false, setupValues: slot.setupValues })
    const order = storedOrder(slot)
    if (order) await store.updateAttempt(attempt.id, { answers: { ...attempt.answers, [GOAL_ORDER]: order } }, 'created')
    links.push(inviteLink(linkBase, run.run, token, bypass))
  }
  return links
}

/** A slot that counts toward the run's planned invites: not a rehearsal, not one `reissueInvites` retired, and never an agent's trial attempt. */
export const isSlot = (a: AttemptRow) => !a.rehearsal && !a.flags.includes(RETIRED) && !isAgentTrial(a.participant)

/** How many invite slots a run has made: people, not attempts, since each person has one attempt for every goal they reach. */
export const slotCount = (attempts: AttemptRow[]): number => new Set(attempts.filter(isSlot).map(a => a.participant)).size
