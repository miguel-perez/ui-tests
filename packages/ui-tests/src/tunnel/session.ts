import { checkReachable } from '../runner/setup.ts'
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

/**
 * Opens the tunnel to `localUrl` (for `recruit`, the front door, so the app and the ui-tests server share its address) and waits until
 * the address answers, so a tunnel that started but serves nothing fails before a run exists.
 */
export async function openReachableTunnel(input: { tunnel: Tunnel; localUrl: string; fetch?: typeof fetch; retryMs?: number; tries?: number }): Promise<Opened> {
  const { tunnel, localUrl, retryMs = 500, tries = 20 } = input
  const opened = await tunnel.open(localUrl)
  try {
    for (let i = 0; i < tries; i++) {
      if (await checkReachable(opened.url, input.fetch)) return opened
      await new Promise(resolve => setTimeout(resolve, retryMs))
    }
    throw new Error(`${opened.url} did not answer`)
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
