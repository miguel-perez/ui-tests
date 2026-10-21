import type { Page } from '@playwright/test'
import { bundleStudyFile, loadBundle } from '../../packages/ui-tests/src/load.ts'
import { compileStudy } from '../../packages/ui-tests/src/compile.ts'
import { attachFirstLook, stubScreenshotter } from '../../packages/ui-tests/src/runner/screenshot.ts'
import { openStore } from '../../packages/ui-tests/src/store/open.ts'
import { createParticipant } from '../../packages/ui-tests/src/runner/invites.ts'

/** This site as it ships: the static export, whose tag points at the server below. */
export const PRODUCT_URL = 'http://127.0.0.1:3000'
/** Where `ui-tests serve` runs: the collector, the player, the shared report and `ui-tests.js`. */
export const SERVER_URL = 'http://127.0.0.1:4300'
/** A plain static site that carries only the tag. */
export const PLAIN_URL = 'http://127.0.0.1:3200'

/** What marks the bar's host: the shadow root the bar lives in hangs from it. */
export const BAR = '[data-ui-tests-root]'

/** The bar on the app's page, by the region it shows: found inside its own host, so nothing else on the page can stand in for it. */
export const barOf = (page: Page, name?: string) => page.locator(BAR).getByRole('region', name === undefined ? {} : { name })

/** Whether `node` has focus, looking through open shadow roots: inside the bar's, `document.activeElement` is only its host. Runs in the page. */
export function hasFocus(node: Element): boolean {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return node === active
}

/** A response to the bar's own collector call (the tag's server, with the attempt key) carrying `action`. */
export function isBarCall(response: { url(): string; request(): { method(): string; postDataJSON(): unknown } }, action: string): boolean {
  if (new URL(response.url()).pathname !== '/api/ui-tests/' || response.request().method() !== 'POST') return false
  return (response.request().postDataJSON() as { action?: unknown } | null)?.action === action
}

/**
 * Compiles the study file's first study and stores it as a rehearsal run with one attempt for its first task, in the store
 * `UI_TESTS_DATA_DIR` names (the one `ui-tests serve` reads). Returns the participant's link.
 */
export async function createRehearsalRun(file: string, options: RunOptions = {}): Promise<{ runId: string; token: string; playerUrl: string }> {
  return createRun(file, true, options)
}

/** The same for a link run: one invite, made as `createInvites` makes one, starting at the study's first task, which meets the screener and the practice screen before the task. */
export async function createLinkRun(file: string, options: RunOptions = {}): Promise<{ runId: string; token: string; playerUrl: string }> {
  return createRun(file, false, options)
}

/** A link run's options: `shot` is the picture the first look shows, standing in for a screenshot of the start page. */
export type RunOptions = {
  shot?: Uint8Array
  /** The name the questions use for the product, as the config's `product` sets it. */
  product?: string
  /** The app the run tests: its target and where participants open it. */
  app?: string
  /** The server whose player the link opens; `ui-tests serve` by default. */
  player?: string
}

async function createRun(file: string, rehearsal: boolean, options: RunOptions = {}): Promise<{ runId: string; token: string; playerUrl: string }> {
  const { code } = await bundleStudyFile(file)
  const [authored] = await loadBundle(code, file)
  if (!authored) throw new Error(`No study in ${file}`)
  const compiled = compileStudy(authored, options.product ? { product: options.product } : {})
  const app = options.app ?? PRODUCT_URL
  const store = await openStore()
  try {
    const { run } = await store.createRun({
      key: `e2e:${compiled.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      context: { users: compiled.users, purpose: compiled.purpose, id: compiled.id },
      build: { url: app, commit: 'e2e' },
      actor: 'human',
      compiled,
      hooksBundle: code,
      rehearsal,
      target: app,
    })
    // A link participant is made as invites make one: their goal order on their first attempt, so they go on to every goal.
    const { token } = rehearsal
      ? await store.createAttempt({ runId: run.run, participant: 'p_e2e', goalIndex: 0, rehearsal })
      : await createParticipant(store, { run, participant: 'p_e2e' })
    if (options.shot) await attachFirstLook({ store, run, target: app, screenshotter: stubScreenshotter(options.shot) })
    return { runId: run.run, token, playerUrl: `${options.player ?? SERVER_URL}/ui-tests/${run.run}/?t=${encodeURIComponent(token)}` }
  } finally {
    await store.close()
  }
}
