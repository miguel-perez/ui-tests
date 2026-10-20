import { bundleStudyFile, loadBundle } from '../../packages/ui-tests/src/load.ts'
import { compileStudy } from '../../packages/ui-tests/src/compile.ts'
import { attachFirstLook, stubScreenshotter } from '../../packages/ui-tests/src/runner/screenshot.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { createParticipant } from '../../packages/ui-tests/src/runner/invites.ts'

/** Where the `product` project serves `apps/web` in server mode. */
export const PRODUCT_URL = 'http://127.0.0.1:3100'

/**
 * Compiles the study file's first study and stores it as a rehearsal run with one attempt for its first task, in the store
 * `UI_TESTS_DATA_DIR` names (the one the product server reads). Returns the participant's link.
 */
export async function createRehearsalRun(file: string, options: RunOptions = {}): Promise<{ runId: string; token: string; playerUrl: string }> {
  return createRun(file, true, options)
}

/** The same for a link run: one invite, made as `createInvites` makes one, starting at the study's first task, which meets the screener and the practice screen before the task. */
export async function createLinkRun(file: string, options: RunOptions = {}): Promise<{ runId: string; token: string; playerUrl: string }> {
  return createRun(file, false, options)
}

/** A link run's options: `shot` is the picture the first look shows, standing in for a screenshot of the start page. */
export type RunOptions = { shot?: Uint8Array; /** The name the questions use for the product, as the config's `product` sets it. */ product?: string }

async function createRun(file: string, rehearsal: boolean, options: RunOptions = {}): Promise<{ runId: string; token: string; playerUrl: string }> {
  const { code } = await bundleStudyFile(file)
  const [authored] = await loadBundle(code, file)
  if (!authored) throw new Error(`No study in ${file}`)
  const compiled = compileStudy(authored, options.product ? { product: options.product } : {})
  const store = await openStore()
  try {
    const { run } = await store.createRun({
      key: `e2e:${compiled.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
      build: { url: PRODUCT_URL, commit: 'e2e' },
      actor: 'human',
      compiled,
      hooksBundle: code,
      rehearsal,
      target: PRODUCT_URL,
    })
    // A link participant is made as invites make one: their goal order on their first attempt, so they go on to every goal.
    const { token } = rehearsal
      ? await store.createAttempt({ runId: run.run, participant: 'p_e2e', goalIndex: 0, rehearsal })
      : await createParticipant(store, { run, participant: 'p_e2e' })
    if (options.shot) await attachFirstLook({ store, run, target: PRODUCT_URL, screenshotter: stubScreenshotter(options.shot) })
    return { runId: run.run, token, playerUrl: `${PRODUCT_URL}/ui-tests/${run.run}/?t=${encodeURIComponent(token)}` }
  } finally {
    await store.close()
  }
}
