import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { createHandler, type ServerOptions } from './handler.ts'

/** The request as the handler reads it. Headers pass through as sent, `X-Forwarded-Host` and `-Proto` included; the body streams. */
function toRequest(req: IncomingMessage): Request {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one)
  }
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const body = method === 'GET' || method === 'HEAD' ? undefined : (Readable.toWeb(req) as ReadableStream<Uint8Array>)
  return new Request(url, { method, headers, ...(body && { body, duplex: 'half' }) })
}

/** Writes the handler's answer, streaming its body; a `HEAD` gets the headers only. */
async function send(response: Response, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  for (const [name, value] of response.headers) if (name !== 'set-cookie') headers[name] = value
  const cookies = response.headers.getSetCookie()
  if (cookies.length) headers['set-cookie'] = cookies
  res.writeHead(response.status, headers)
  if (!response.body || req.method === 'HEAD') { res.end(); return }
  await pipeline(Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>), res)
}

/** `createHandler` on a `node:http` server. `url` is where it listens, with `localhost` for an address that takes every interface. */
export async function startServer(options: ServerOptions & { port?: number; host?: string }): Promise<{ url: string; close(): Promise<void> }> {
  const { port: wanted, host = '0.0.0.0', ...serverOptions } = options
  const handle = createHandler(serverOptions)
  const server = createServer((req, res) => {
    void (async () => {
      let request: Request
      try { request = toRequest(req) } catch { res.writeHead(400).end(); return }
      await send(await handle(request), req, res)
    })().catch(() => { if (!res.headersSent) res.writeHead(500); res.end() })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(wanted ?? 4300, host, resolve)
  })
  // Once listening, a server error (a socket failing under it) is logged; it does not end the process.
  server.on('error', (error) => console.error(`ui-tests: server error: ${error.message}`))
  const { port } = server.address() as AddressInfo
  const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host
  return {
    url: `http://${shown}:${port}`,
    close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close((error) => (error ? reject(error) : resolve())) }),
  }
}
