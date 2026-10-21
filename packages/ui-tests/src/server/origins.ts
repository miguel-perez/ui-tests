import type { RunRow, RunStore } from '../store/types.ts'

/** The origin of an http(s) URL, lower-cased; undefined for anything else. */
export function originOf(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : undefined
  } catch {
    return undefined
  }
}

/** Where participants open the app. */
export const appUrlOf = (run: RunRow): string => run.appUrl ?? run.target

/** The other spelling of a loopback origin (`localhost` and `127.0.0.1`), or undefined for any other host. */
function loopbackTwin(origin: string): string | undefined {
  const url = new URL(origin)
  const twin = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname === '127.0.0.1' ? 'localhost' : undefined
  if (!twin) return undefined
  url.hostname = twin
  return url.origin
}

/** The origins the run's pages may call the collector from: those stored, else the app's, plus the target's and each loopback twin. */
export function runOrigins(run: RunRow): string[] {
  const named = run.origins ?? [originOf(appUrlOf(run))]
  const origins = [...named, originOf(run.target)].filter((origin): origin is string => origin !== undefined)
  const all = [...origins, ...origins.map(loopbackTwin)].filter((origin): origin is string => origin !== undefined)
  return [...new Set(all)]
}

/** Records where participants open the app and allows its origin, retrying when the run moved underneath, as tunnels are recorded. */
export async function setRunApp(store: RunStore, runId: string, appUrl: string): Promise<RunRow> {
  const origin = originOf(appUrl)
  if (!origin) throw new Error(`Not an http(s) URL: ${appUrl}`)
  for (let tries = 0; tries < 5; tries++) {
    const run = await store.getRun(runId)
    if (!run) throw new Error(`No such run: ${runId}`)
    const origins = [...new Set([...(run.origins ?? runOrigins(run)), origin])]
    if (await store.updateRun(runId, { appUrl, origins }, run.revision)) return { ...run, appUrl, origins, revision: run.revision + 1 }
  }
  throw new Error(`Run ${runId} kept changing; try again`)
}
