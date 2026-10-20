import { spawn, type ChildProcess } from 'node:child_process'
import type { Tunnel } from './types.ts'

// `api.trycloudflare.com` is cloudflared's own endpoint, named in its failure messages; it is never a tunnel.
const QUICK_TUNNEL_URL = /https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com(?![\w./-])/

/** The quick-tunnel URL in cloudflared's output, or undefined when it has not printed one yet. */
export const parseTunnelUrl = (output: string): string | undefined => QUICK_TUNNEL_URL.exec(output)?.[0]

type Spawn = (bin: string, args: string[]) => ChildProcess

const START_LIMIT_MS = 30_000

/**
 * A quick tunnel through `cloudflared tunnel --url <localUrl>`: waits for the `https://*.trycloudflare.com` line on its output and
 * kills the process on close. A named tunnel (your own hostname) is set up with cloudflared itself and is not run from here.
 */
export function cloudflaredTunnel(bin = 'cloudflared', spawnProcess: Spawn = (b, args) => spawn(b, args, { stdio: ['ignore', 'pipe', 'pipe'] })): Tunnel {
  return {
    open: localUrl => new Promise((resolve, reject) => {
      const child = spawnProcess(bin, ['tunnel', '--url', localUrl])
      let seen = ''
      let settled = false
      const stop = () => { if (!child.killed && child.exitCode === null) child.kill() }
      const fail = (message: string) => { if (settled) return; settled = true; clearTimeout(timer); stop(); reject(new Error(message)) }
      const timer = setTimeout(() => fail(`${bin} printed no tunnel URL within ${START_LIMIT_MS / 1000} seconds`), START_LIMIT_MS)
      const read = (chunk: Buffer | string) => {
        if (settled) return
        seen = (seen + chunk.toString()).slice(-8192)
        const url = parseTunnelUrl(seen)
        if (!url) return
        settled = true
        clearTimeout(timer)
        resolve({ url, close: async () => { stop() } })
      }
      child.stderr?.on('data', read)
      child.stdout?.on('data', read)
      child.once('error', error => fail((error as NodeJS.ErrnoException).code === 'ENOENT'
        ? `${bin} is not installed. Install cloudflared (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and try again.`
        : error.message))
      child.once('exit', code => fail(`${bin} exited with code ${code} before it printed a tunnel URL`))
    }),
  }
}
