import type { RunStore } from '../store/types.ts'
import type { Transcriber } from '../transcriber.ts'
import { getBundles } from './bundles.ts'
import { createCollector } from './collector.ts'
import { reportResponse } from './report.ts'
import { playerShell } from './shell.ts'
import { reportVideo } from './video.ts'

export type ServerOptions = {
  store: () => Promise<RunStore>
  /** The address people reach this server at (an http(s) origin), when it is behind a proxy or a tunnel. */
  publicUrl?: string
  /** The secret the CLI sends as a Bearer token. */
  cliSecret?: string
  /** Signs shared reports and their videos; without it there are none. */
  shareSecret?: string
  transcriber?: Transcriber
  /** The clock in epoch milliseconds; replaced in tests. */
  now?: () => number
}

/** HTML is never framed, never cached and never names the page it was left from. */
const PAGE_HEADERS = { 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cache-Control': 'no-store' }
/** Scripts load from any page, without credentials. */
const SCRIPT_HEADERS = { 'Content-Type': 'text/javascript; charset=utf-8', 'Access-Control-Allow-Origin': '*' }

const text = (status: number, body: string) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
const notFound = () => text(404, 'Not found')

/** Adds the page headers to an HTML answer, whatever it already carries. */
function asPage(response: Response): Response {
  for (const [name, value] of Object.entries(PAGE_HEADERS)) response.headers.set(name, value)
  return response
}

/** The collector's paths: the participant's view and actions, and the app page's trade of a handoff code. */
const COLLECTOR = new Set(['/api/ui-tests', '/api/ui-tests/', '/api/ui-tests/exchange'])

/**
 * The whole server as one request handler: the collector, `ui-tests.js` and its assets, the player's page, the shared report and its
 * videos, and a health check. Anything else is a 404.
 */
export function createHandler(options: ServerOptions): (request: Request) => Promise<Response> {
  const collector = createCollector({
    store: options.store,
    ...(options.publicUrl && { publicUrl: options.publicUrl }),
    ...(options.cliSecret && { cliSecret: options.cliSecret }),
    ...(options.transcriber && { transcriber: options.transcriber }),
    ...(options.now && { now: options.now }),
  })

  async function route(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    if (COLLECTOR.has(path)) return collector(request)
    if (request.method !== 'GET' && request.method !== 'HEAD') return text(405, 'Method not allowed')
    if (path === '/healthz') return Response.json({ ok: true, name: 'ui-tests' }, { headers: { 'Cache-Control': 'no-store' } })
    if (path === '/ui-tests.js') return new Response((await getBundles()).loader, { headers: { ...SCRIPT_HEADERS, 'Cache-Control': 'no-cache' } })
    const asset = /^\/ui-tests\/assets\/([\w-]+\.js)$/.exec(path)?.[1]
    if (asset) {
      const body = (await getBundles()).assets.get(asset)
      return body === undefined ? notFound() : new Response(body, { headers: { ...SCRIPT_HEADERS, 'Cache-Control': 'public, max-age=31536000, immutable' } })
    }
    const player = /^\/ui-tests\/([^/]+)(\/?)$/.exec(path)
    if (player) {
      if (!player[2]) return new Response(null, { status: 308, headers: { Location: `${path}/` } })
      let id: string
      try { id = decodeURIComponent(player[1]!) } catch { return notFound() }
      const run = await (await options.store()).getRun(id)
      if (!run) return notFound()
      const { player: script } = await getBundles()
      // The title is the product the person is testing; nothing on the page names who serves it.
      const html = playerShell({ runId: id, brand: run.compiled.brand, title: run.compiled.product, script: `/ui-tests/assets/${script}` })
      return asPage(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    }
    if (path.startsWith('/r/')) {
      const store = await options.store()
      const response = await reportResponse(request, { store, bundles: await getBundles(), ...(options.shareSecret && { shareSecret: options.shareSecret }) })
      return response.ok ? asPage(response) : response
    }
    if (path.startsWith('/rv/')) return reportVideo(request, { store: await options.store(), ...(options.shareSecret && { shareSecret: options.shareSecret }) })
    return notFound()
  }

  return async function handler(request) {
    try { return await route(request) } catch (error) {
      // The cause is for the author's log; the person sees only that something failed.
      console.error(`ui-tests: ${request.method} ${new URL(request.url).pathname} failed: ${error instanceof Error ? error.message : String(error)}`)
      return text(500, 'Something went wrong')
    }
  }
}
