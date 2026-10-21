import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { AddressInfo } from 'node:net'
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib'

/** The paths the ui-tests server answers behind the front door; everything else is the app's. */
export const SERVER_PREFIXES = ['/ui-tests.js', '/ui-tests/', '/api/ui-tests/', '/r/', '/rv/'] as const

/** Whether a path is the ui-tests server's: `/ui-tests.js` itself, or anything under one of the other prefixes. */
export const isServerPath = (pathname: string): boolean => SERVER_PREFIXES.some(prefix => (prefix.endsWith('/') ? pathname.startsWith(prefix) : pathname === prefix))

const SCRIPT_START = /<script(?=[\s/>])(?:\s*[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?|\s*\/)*\s*>/gi
const ATTRIBUTE = /(\s)([^\s"'>/=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'=<>`]+)?/g
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;')

/**
 * Points the page's tag at `origin`: the quoted value of `data-ui-tests` on `<script` start tags, empty or not, keeping its quote.
 * Nothing else in the page changes, an unquoted value included.
 */
export function rewriteTag(html: string, origin: string): string {
  return html.replace(SCRIPT_START, tag => tag.replace(ATTRIBUTE, (whole, space: string, name: string, equals: string, value: string | undefined) => {
    if (name.toLowerCase() !== 'data-ui-tests' || !value || (value[0] !== '"' && value[0] !== "'")) return whole
    return `${space}${name}${equals}${value[0]}${escapeAttribute(origin)}${value[0]}`
  }))
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim() || undefined

/** The origin the browser asked for: the request's `Host`, on the protocol a tunnel in front names (`http` otherwise). */
function askedOrigin(req: IncomingMessage): string | undefined {
  const proto = first(req.headers['x-forwarded-proto'])
  try {
    const url = new URL(`${proto === 'https' ? 'https' : 'http'}://${req.headers.host ?? ''}`)
    return url.host && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash ? url.origin : undefined
  } catch { return undefined }
}

/** The body of an app answer as text, undoing a compression the app used although `identity` was asked for. */
function decoded(body: Buffer, encoding: string | undefined): Buffer {
  switch (encoding?.trim().toLowerCase()) {
    case 'gzip': case 'x-gzip': return gunzipSync(body)
    case 'br': return brotliDecompressSync(body)
    case 'deflate': return inflateSync(body)
    default: return body
  }
}

/** The app's cookies without ours: a `ui-tests-*` cookie is the server's and never reaches the app; undefined when none is left. */
export function appCookies(cookie: string | string[] | undefined): string | undefined {
  const kept = (Array.isArray(cookie) ? cookie.join('; ') : cookie ?? '').split(';').map(part => part.trim()).filter(part => part && !/^ui-tests-/i.test(part))
  return kept.length ? kept.join('; ') : undefined
}

/** Sends `req` to `upstream` with `headers`, and hands the answer to `answer`; a failed upstream is a 502. */
function forward(req: IncomingMessage, res: ServerResponse, upstream: URL, headers: IncomingHttpHeaders, answer: (upstreamRes: IncomingMessage) => void) {
  const send = upstream.protocol === 'https:' ? httpsRequest : request
  const out = send(upstream, { method: req.method ?? 'GET', path: req.url ?? '/', headers }, answer)
  out.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.pipe(out)
}

/**
 * One origin for the app and the ui-tests server, so a tunnel or a LAN name reaches both: the server's paths go to `server`, told the
 * address the browser asked for (`X-Forwarded-Host`, `X-Forwarded-Proto`) so it takes it as its own; everything else goes to `app`
 * with `appHeaders` and without our cookies, and its HTML comes back with the tag pointed at the door. Binds `host` (loopback by default) on `port` (any).
 */
export async function startFrontDoor(input: { app: string; server: string; host?: string; port?: number; appHeaders?: Record<string, string> }): Promise<{ url: string; close(): Promise<void> }> {
  const app = new URL(input.app)
  const server = new URL(input.server)
  const door = createServer((req, res) => {
    const origin = askedOrigin(req)
    if (!origin) { res.writeHead(400).end(); return }
    let pathname: string
    try { pathname = new URL(req.url ?? '/', origin).pathname } catch { res.writeHead(400).end(); return }
    if (isServerPath(pathname)) {
      const headers = { ...req.headers, host: server.host, 'x-forwarded-host': new URL(origin).host, 'x-forwarded-proto': new URL(origin).protocol.slice(0, -1) }
      forward(req, res, server, headers, answer => { res.writeHead(answer.statusCode ?? 502, answer.headers); answer.pipe(res) })
      return
    }
    const { cookie, ...rest } = req.headers
    const kept = appCookies(cookie)
    const headers = { ...rest, ...input.appHeaders, host: app.host, 'accept-encoding': 'identity', ...(kept && { cookie: kept }) }
    forward(req, res, app, headers, answer => {
      const outHeaders = { ...answer.headers }
      // A redirect to the app's own address stays on the door.
      if (outHeaders.location) {
        try {
          const location = new URL(outHeaders.location, app)
          if (location.origin === app.origin && /^[a-z][a-z0-9+.-]*:/i.test(outHeaders.location)) outHeaders.location = `${origin}${location.pathname}${location.search}${location.hash}`
        } catch { /* left as sent */ }
      }
      if (!/^text\/html\b/i.test(first(outHeaders['content-type']) ?? '')) { res.writeHead(answer.statusCode ?? 502, outHeaders); answer.pipe(res); return }
      const chunks: Buffer[] = []
      answer.on('data', (chunk: Buffer) => chunks.push(chunk))
      answer.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
      answer.on('end', () => {
        let page: string
        try { page = rewriteTag(decoded(Buffer.concat(chunks), first(outHeaders['content-encoding'])).toString('utf8'), origin) } catch { res.writeHead(502).end(); return }
        delete outHeaders['content-length']
        delete outHeaders['content-encoding']
        res.writeHead(answer.statusCode ?? 502, outHeaders)
        res.end(req.method === 'HEAD' ? undefined : page)
      })
    })
  })
  const host = input.host ?? '127.0.0.1'
  await new Promise<void>((resolve, reject) => { door.once('error', reject); door.listen(input.port ?? 0, host, resolve) })
  const { port } = door.address() as AddressInfo
  const shown = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host
  let closing: Promise<void> | undefined
  return {
    url: `http://${shown}:${port}`,
    close: () => (closing ??= new Promise<void>(resolve => { door.closeAllConnections(); door.close(() => resolve()) })),
  }
}
