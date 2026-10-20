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

/**
 * Opens the tunnel to `localUrl` for a run and appends it to the run's `tunnels`. The returned `close` ends it and stamps `closedAt`;
 * calling it twice does the second time nothing.
 */
export async function openRunTunnel(input: { store: RunStore; runId: string; tunnel: Tunnel; localUrl: string; now: () => Date }): Promise<{ url: string; close(): Promise<void> }> {
  const { store, runId, tunnel, localUrl, now } = input
  const opened = await tunnel.open(localUrl)
  const openedAt = now().toISOString()
  try { await updateTunnels(store, runId, list => [...list, { url: opened.url, openedAt }]) } catch (error) { await opened.close(); throw error }
  let closing: Promise<void> | undefined
  return {
    url: opened.url,
    close: () => (closing ??= (async () => {
      await opened.close()
      await updateTunnels(store, runId, list => list.map(t => (t.url === opened.url && t.openedAt === openedAt && !t.closedAt ? { ...t, closedAt: now().toISOString() } : t)))
    })()),
  }
}
