import { request } from 'node:http'
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os'

/** Where participants reach the build from: a preview, a tunnel to this machine, a deploy, inside a network perimeter, or this machine alone. */
export type Reachability = 'preview' | 'tunnel' | 'deploy' | 'perimeter' | 'local'

/** The first IPv4 address of this machine that is not loopback, or undefined when it has none. */
export function lanAddress(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): string | undefined {
  for (const list of Object.values(interfaces)) {
    for (const info of list ?? []) if (info.family === 'IPv4' && !info.internal) return info.address
  }
  return undefined
}

const hostnameOf = (url: string): string | undefined => {
  try { return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `http://${url}`).hostname.replace(/^\[|\]$/g, '').toLowerCase() } catch { return undefined }
}

/** Loopback: `localhost`, `*.localhost`, 127.0.0.0/8 and ::1. */
export const isLoopbackHost = (hostname: string) => hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || /^127\.\d+\.\d+\.\d+$/.test(hostname) || hostname === '0.0.0.0'

/** Private or link-local IPv4 ranges, and names that only resolve inside a network: no dot, `.local`, `.lan`, `.internal`, `.intranet`, `.corp`, `.home.arpa`. */
export function isPerimeterHost(hostname: string): boolean {
  const v4 = hostname.match(/^(\d+)\.(\d+)\.\d+\.\d+$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127)
  }
  if (hostname.includes(':')) return /^(fe80|fc|fd)/.test(hostname)
  return !hostname.includes('.') || /\.(local|lan|internal|intranet|corp|home\.arpa)$/.test(hostname)
}

/** How a target is reached, from its address and the flags the command was given. A tunnel wins; then loopback, a preview host, a network-internal host (or this machine's own LAN address), and otherwise a deploy. */
export function reachabilityOf(target: string, flags: { tunnel?: boolean } = {}, lan: string | undefined = lanAddress()): Reachability {
  if (flags.tunnel) return 'tunnel'
  const hostname = hostnameOf(target)
  if (!hostname) return 'deploy'
  if (isLoopbackHost(hostname)) return 'local'
  if (hostname === 'vercel.app' || hostname.endsWith('.vercel.app')) return 'preview'
  if (isPerimeterHost(hostname) || hostname === lan) return 'perimeter'
  return 'deploy'
}

/**
 * The address invite links are built on when `--host` names the machine participants will use. `host` is a hostname, `hostname:port`
 * or a full origin; a bare hostname keeps the target's scheme and port, since the same server answers on both.
 */
export function linkBaseFor(target: string, host: string): string {
  const given = /^[a-z][a-z0-9+.-]*:\/\//i.test(host) ? host : undefined
  const base = new URL(target)
  const url = new URL(given ?? `${base.protocol}//${host}`)
  if (!given && !/:\d+$/.test(host) && base.port) url.port = base.port
  return url.origin
}

/** Whether anything answers at a loopback `url`, asked over a plain socket to this machine; refuses any other address, so it can never reach outside. */
export function probeLocal(url: string, timeoutMs = 3000): Promise<boolean> {
  return new Promise(resolve => {
    let target: URL
    try { target = new URL(url) } catch { return resolve(false) }
    const hostname = target.hostname.replace(/^\[|\]$/g, '')
    if (target.protocol !== 'http:' || !isLoopbackHost(hostname)) return resolve(false)
    const req = request({ host: hostname, port: target.port || 80, path: '/', method: 'GET', timeout: timeoutMs }, res => { res.resume(); resolve(true) })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
    req.end()
  })
}
