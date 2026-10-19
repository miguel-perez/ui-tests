import { bundleStudyFile, loadBundle } from '../../packages/ui-tests/src/load.ts'
import { compileStudy } from '../../packages/ui-tests/src/compile.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'

/** Where the `product` project serves `apps/web` in server mode. */
export const PRODUCT_URL = 'http://127.0.0.1:3100'

/**
 * Compiles the study file's first study and stores it as a rehearsal run with one attempt for its first task, in the store
 * `UI_TESTS_DATA_DIR` names (the one the product server reads). Returns the participant's link.
 */
export async function createRehearsalRun(file: string): Promise<{ runId: string; token: string; playerUrl: string }> {
  const { code } = await bundleStudyFile(file)
  const [authored] = await loadBundle(code, file)
  if (!authored) throw new Error(`No study in ${file}`)
  const compiled = compileStudy(authored, {})
  const store = await openStore()
  try {
    const { run } = await store.createRun({
      key: `e2e:${compiled.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
      build: { url: PRODUCT_URL, commit: 'e2e' },
      actor: 'human',
      compiled,
      hooksBundle: code,
      rehearsal: true,
      target: PRODUCT_URL,
    })
    const { token } = await store.createAttempt({ runId: run.run, participant: 'p_e2e', goalIndex: 0, rehearsal: true })
    return { runId: run.run, token, playerUrl: `${PRODUCT_URL}/ui-tests/${run.run}/?t=${encodeURIComponent(token)}` }
  } finally {
    await store.close()
  }
}
