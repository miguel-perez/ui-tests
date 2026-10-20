import { isLoopbackHost } from './hosts.ts'
import type { RunRow, RunStore } from '../store/types.ts'

/** Takes a picture of a page. The runner is given one so tests never need a browser. */
export interface Screenshotter {
  capture(url: string, headers?: Record<string, string>): Promise<Uint8Array>
}

/** The first-look image of an attempt is kept as a blob of this kind. */
export const FIRST_LOOK_BLOB = 'first-look'
/** The key in `attempt.answers` that names the attempt's first-look blob; the collector serves it, the participant view only learns that it exists. */
export const FIRST_LOOK_SHOT = 'firstLookShot'
/** The key in `attempt.answers` that says why the first look was not asked: its picture could not be taken. Not an answer, so "never asked" differs from "no answer". */
export const FIRST_LOOK_SKIPPED = 'firstLookSkipped'

/** The page the first look shows: `firstLook.page`, else the primary task's start, as the participant's view says. */
export function firstLookPage(run: RunRow): string {
  const impression = run.compiled.impression
  return impression.page ?? (run.compiled.goals.find(g => g.primary) ?? run.compiled.goals[0])?.start ?? '/'
}

/** Chromium at 1280×800 through `playwright-core`; needs `playwright install chromium`. */
export function playwrightScreenshotter(options: { loopbackOnly?: boolean } = {}): Screenshotter {
  return {
    async capture(url, headers) {
      const { chromium } = await import('playwright-core')
      const browser = await chromium.launch()
      try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
        // The headers (a protection-bypass secret) go to the page's own origin only, never to a third-party script, font or redirect.
        if (headers) {
          const origin = new URL(url).origin
          await context.route('**/*', route => route.continue(new URL(route.request().url()).origin === origin ? { headers: { ...route.request().headers(), ...headers } } : undefined))
        }
        // Local only: the page may reference third-party scripts, fonts or images; none of them is fetched.
        if (options.loopbackOnly) await context.route('**/*', route => (isLoopbackHost(new URL(route.request().url()).hostname.replace(/^\[|\]$/g, '')) || /^(data|blob):/.test(route.request().url()) ? route.fallback() : route.abort()))
        const page = await context.newPage()
        await page.goto(url, { timeout: 15_000, waitUntil: 'load' })
        return new Uint8Array(await page.screenshot({ type: 'png' }))
      } finally { await browser.close() }
    },
  }
}

/** A screenshotter that always returns the same picture, for tests. */
export function stubScreenshotter(png: Uint8Array, seen?: string[]): Screenshotter {
  return { async capture(url) { seen?.push(url); return png } }
}

/**
 * Takes the first-look picture once and gives it to every attempt of the run that has not been started and has none. A run whose
 * first look is off, or whose page cannot be captured, gets no picture, and the participant's page then skips the stage.
 * A capture that fails is written on each of those attempts, so the trace can say the stage was not asked. Returns the reason when a capture was wanted and failed.
 */
export async function attachFirstLook(input: {
  store: RunStore; run: RunRow; target: string; screenshotter: Screenshotter; headers?: Record<string, string>
}): Promise<{ error?: string }> {
  const { store, run, target, screenshotter, headers } = input
  const impression = run.compiled.impression
  if (!impression.on) return {}
  const wanted = (await store.listAttempts(run.run)).filter(a => a.status === 'created' && !a.flags.includes('retired') && a.answers[FIRST_LOOK_SHOT] === undefined)
  if (!wanted.length) return {}
  let png: Uint8Array
  try {
    png = await screenshotter.capture(new URL(firstLookPage(run), target).toString(), headers)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    for (const attempt of wanted) {
      const current = await store.getAttempt(attempt.id)
      if (current) await store.updateAttempt(attempt.id, { answers: { ...current.answers, [FIRST_LOOK_SKIPPED]: reason } }, 'created')
    }
    return { error: `first look skipped: ${reason}` }
  }
  for (const attempt of wanted) {
    const id = await store.putBlob(attempt.id, FIRST_LOOK_BLOB, png, 'image/png')
    const current = await store.getAttempt(attempt.id)
    if (current) {
      const { [FIRST_LOOK_SKIPPED]: _skipped, ...answers } = current.answers
      await store.updateAttempt(attempt.id, { answers: { ...answers, [FIRST_LOOK_SHOT]: id } }, 'created')
    }
  }
  return {}
}
