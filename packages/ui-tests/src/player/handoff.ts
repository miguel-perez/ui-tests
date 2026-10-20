import type { ParticipantView } from '../server/view.ts'

/**
 * Begins the task when it has not begun, then hands the person over. The begun view is passed on before the handoff, so a retry after a
 * failed handoff only hands off again: a second `begin` would be refused.
 */
export async function beginAndHandOff(view: ParticipantView, steps: { begin(): Promise<ParticipantView>; begun(view: ParticipantView): void; handoff(): Promise<void> }): Promise<void> {
  if (view.status === 'consented') steps.begun(await steps.begin())
  await steps.handoff()
}

/** The invite's query parameter that carries a Vercel protection bypass, and where the player keeps it for its run. */
const BYPASS_PARAM = 'bypass'
const bypassKey = (run: string) => `ui-tests-bypass:${run}`

/**
 * The address the person continues at, with the protection bypass on its query (before the fragment, which holds the handoff code), so
 * a protected preview lets them in and sets its cookie for the pages after. Without a secret the address is left as it is.
 */
export function withBypass(url: string, bypass?: string): string {
  if (!bypass) return url
  const next = new URL(url)
  next.searchParams.set('x-vercel-protection-bypass', bypass)
  next.searchParams.set('x-vercel-set-bypass-cookie', 'samesitenone')
  return next.href
}

/** `sessionStorage` throws in some sandboxed and privacy modes; the bypass then lasts until the query leaves the address bar. */
function session(): Storage | undefined {
  try { return globalThis.sessionStorage } catch { return undefined }
}

/** The invite's bypass for this run: read from the query while it is there and kept for the tab, since consent takes the query away. */
export function rememberBypass(run: string, search: string, storage: Storage | undefined = session()): string | undefined {
  const given = new URLSearchParams(search).get(BYPASS_PARAM)
  try {
    if (given) storage?.setItem(bypassKey(run), given)
    return given || (storage?.getItem(bypassKey(run)) ?? undefined)
  } catch {
    return given || undefined
  }
}
