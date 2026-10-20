import { request as playwrightRequest } from 'playwright-core'
import type { AuthoredStudy } from '../authoring.ts'

/** Runs the study's `setup` in the runner against the target and returns its values; a study without `setup` has none, so the task's own start applies. */
export async function runSetup(study: AuthoredStudy, target: string, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  if (!study.setup) return {}
  const request = await playwrightRequest.newContext({ baseURL: target, extraHTTPHeaders: headers })
  try { return { ...await study.setup({ request }) } } finally { await request.dispose() }
}

/**
 * Whether anything answers at `url`; any HTTP response counts, a refused connection does not. A dev server compiles its first page
 * on the first request, which can take longer than a few seconds, so a request that only timed out gets one longer try.
 */
export async function checkReachable(url: string, fetchImpl: typeof fetch = fetch, timeouts: number[] = [3000, 30000]): Promise<boolean> {
  for (const ms of timeouts) {
    try {
      await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(ms) })
      return true
    } catch (error) {
      if (!(error instanceof Error && error.name === 'TimeoutError')) return false
    }
  }
  return false
}
