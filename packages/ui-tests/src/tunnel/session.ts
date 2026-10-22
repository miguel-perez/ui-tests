import { checkReachable, PROBE_TIMEOUTS_MS } from '../runner/setup.ts'
import type { RunStore } from '../store/types.ts'
import { cloudflaredTunnel } from './cloudflared.ts'
import { fakeTunnel } from './fake.ts'
import type { Tunnel, TunnelRecord } from './types.ts'

/** The tunnel a command uses: the one given, else the fake when `UI_TESTS_TUNNEL=fake`, else cloudflared. */
export const chooseTunnel = (env: Record<string, string | undefined>, given?: Tunnel): Tunnel => given ?? (env.UI_TESTS_TUNNEL === 'fake' ? fakeTunnel() : cloudflaredTunnel())

/** Reads the run's recorded tunnels, applies `change`, and stores the result, retrying when the run moved underneath. */
async function updateTunnels(store: RunStore, runId: string, change: (tunnels: TunnelRecord[]) => TunnelRecord[]): Promise<void> {
  for (let tries = 0; tries < 5; tries++) {
    const run = await store.getRun(runId)
    if (!run) throw new Error(`No such run: ${runId}`)
    const tunnels = change(Array.isArray(run.tunnels) ? [...(run.tunnels as TunnelRecord[])] : [])
    if (await store.updateRun(runId, { tunnels }, run.revision)) return
  }
  throw new Error(`Run ${runId} kept changing; try again`)
}

type Opened = { url: string; close(): Promise<void> }

/** How long `recruit --tunnel` waits for a new address to answer: a fresh quick-tunnel name took about 80 seconds to resolve. */
export const TUNNEL_WAIT_MS = 120_000

/**
 * Opens the tunnel to `localUrl` (for `recruit`, the front door, so the app and the ui-tests server share its address) and waits up to
 * `waitMs` until the address answers, so a tunnel that started but serves nothing fails before a run exists. `onWaiting` hears the
 * address once, when its first try finds nothing there.
 */
export async function openReachableTunnel(input: { tunnel: Tunnel; localUrl: string; fetch?: typeof fetch; retryMs?: number; waitMs?: number; onWaiting?: (url: string) => void }): Promise<Opened> {
  const { tunnel, localUrl, retryMs = 500, waitMs = TUNNEL_WAIT_MS } = input
  const opened = await tunnel.open(localUrl)
  const deadline = Date.now() + waitMs
  try {
    for (let waiting = false; ; waiting = true) {
      // No single try runs past the deadline.
      const left = Math.max(1, deadline - Date.now())
      if (await checkReachable(opened.url, input.fetch, PROBE_TIMEOUTS_MS.map(ms => Math.min(ms, left)))) return opened
      if (Date.now() >= deadline) break
      if (!waiting) input.onWaiting?.(opened.url)
      await new Promise(resolve => setTimeout(resolve, Math.min(retryMs, deadline - Date.now())))
    }
    throw new Error(`${opened.url} did not answer within ${waitMs / 1000} seconds`)
  } catch (error) { await opened.close(); throw error }
}

/**
 * Appends an opened tunnel to the run's `tunnels`. The returned `close` ends it and stamps `closedAt`; calling it twice does the
 * second time nothing.
 */
export async function recordTunnel(input: { store: RunStore; runId: string; opened: Opened; now: () => Date }): Promise<Opened> {
  const { store, runId, opened, now } = input
  const openedAt = now().toISOString()
  await updateTunnels(store, runId, list => [...list, { url: opened.url, openedAt }])
  let closing: Promise<void> | undefined
  return {
    url: opened.url,
    close: () => (closing ??= (async () => {
      await opened.close()
      await updateTunnels(store, runId, list => list.map(t => (t.url === opened.url && t.openedAt === openedAt && !t.closedAt ? { ...t, closedAt: now().toISOString() } : t)))
    })()),
  }
}
