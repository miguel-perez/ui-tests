/** A way to reach a build on this machine from outside it, for as long as one run needs. */
export interface Tunnel {
  /** Exposes `localUrl` at a public URL. `close` ends the exposure and is safe to call twice. */
  open(localUrl: string): Promise<{ url: string; close(): Promise<void> }>
}

/** One tunnel URL as recorded on a run (`RunRow.tunnels`) and shown in the trace. */
export type TunnelRecord = { url: string; openedAt: string; closedAt?: string }
