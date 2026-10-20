import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isLoopbackHost } from '../runner/hosts.ts'
import { startServer } from '../server/http.ts'
import type { RunStore } from '../store/types.ts'
import { moduleTranscriber } from '../transcriber.ts'
import type { Io } from './main.ts'

/** How long the health check waits for an answer. */
const HEALTH_TIMEOUT_MS = 2000
/** A health answer is a few bytes; anything longer is not one. */
const MAX_HEALTH_BYTES = 4096

/** No ui-tests server answers at the address, and none can be started there. */
export class ServerUnreachable extends Error {
  constructor(readonly url: string) {
    super(`ui-tests server not reachable: ${url}`)
    this.name = 'ServerUnreachable'
  }
}

/** The body of a GET, asked over a plain socket rather than `fetch`, so a stubbed or failing `fetch` never decides it; undefined on any failure. */
function get(url: string): Promise<string | undefined> {
  return new Promise(resolve => {
    let target: URL
    try { target = new URL(url) } catch { return resolve(undefined) }
    const request = target.protocol === 'https:' ? httpsRequest : target.protocol === 'http:' ? httpRequest : undefined
    if (!request) return resolve(undefined)
    const req = request(target, { method: 'GET', timeout: HEALTH_TIMEOUT_MS }, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => { body += chunk; if (body.length > MAX_HEALTH_BYTES) req.destroy() })
      res.on('end', () => resolve(res.statusCode === 200 ? body : undefined))
      res.on('error', () => resolve(undefined))
    })
    req.on('timeout', () => req.destroy())
    req.on('error', () => resolve(undefined))
    req.on('close', () => resolve(undefined))
    req.end()
  })
}

/** Whether a ui-tests server answers at `url`: its `/healthz` names it. Another service on the same port does not count. */
export async function answersAsServer(url: string, fetcher?: typeof fetch): Promise<boolean> {
  const health = `${url}/healthz`
  let body: string | undefined
  if (fetcher) {
    try {
      const response = await fetcher(health, { redirect: 'manual', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) })
      body = response.status === 200 ? await response.text() : undefined
    } catch { body = undefined }
  } else body = await get(health)
  try { return (JSON.parse(body ?? '') as { name?: unknown } | null)?.name === 'ui-tests' } catch { return false }
}

/**
 * The ui-tests server at `url`, running for the length of a command. One that answers is used as it is (`started: false`, and
 * `close` leaves it running). Otherwise, for an http address on this machine, one is started there on the command's store, bound to
 * `bind` (loopback by default), and `close` stops it. Anything else throws `ServerUnreachable`: a server elsewhere is never started
 * for you, and a port another service holds is never taken.
 */
export async function ensureServer(input: { url: string; store: RunStore; io: Io; bind?: string; fetch?: typeof fetch }): Promise<{ url: string; started: boolean; close(): Promise<void> }> {
  const url = input.url.replace(/\/+$/, '')
  if (await answersAsServer(url, input.fetch)) return { url, started: false, close: async () => {} }
  let address: URL
  try { address = new URL(url) } catch { throw new ServerUnreachable(url) }
  if (address.protocol !== 'http:' || !isLoopbackHost(address.hostname.replace(/^\[|\]$/g, ''))) throw new ServerUnreachable(url)
  const { env } = input.io
  let server: Awaited<ReturnType<typeof startServer>>
  try {
    server = await startServer({
      store: async () => input.store,
      port: Number(address.port || 80),
      host: input.bind ?? '127.0.0.1',
      publicUrl: url,
      transcriber: moduleTranscriber(() => env.UI_TESTS_TRANSCRIBER),
      ...(env.UI_TESTS_CLI_SECRET && { cliSecret: env.UI_TESTS_CLI_SECRET }),
      ...(env.UI_TESTS_SHARE_SECRET && { shareSecret: env.UI_TESTS_SHARE_SECRET }),
    })
  } catch { throw new ServerUnreachable(url) }
  input.io.stderr.write(`Started the ui-tests server on ${url}\n`)
  return { url, started: true, close: () => server.close() }
}
