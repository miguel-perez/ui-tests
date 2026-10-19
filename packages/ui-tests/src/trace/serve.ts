import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { RunStore } from '../store/types.ts'
import { buildTrace } from './build.ts'
import { RunList, TraceView } from './view.tsx'

const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const html = (node: Parameters<typeof renderToString>[0]) => `<!doctype html>${renderToString(node)}`

/**
 * Serves the trace on this machine only: `/` lists runs, `/runs/<run>/` shows one, `/runs/<run>.json` is the same
 * data. It binds to the loopback address, because the trace is for the author's own session (PRD 06).
 */
export async function serveTrace(options: { store: RunStore; port?: number; host?: string }): Promise<{ url: string; close(): Promise<void> }> {
  const host = options.host ?? '127.0.0.1'
  if (!loopback.has(host)) throw new Error(`The trace is served on this machine only; refusing to bind ${host}`)
  const { store } = options
  const server = createServer(async (req, res) => {
    const send = (status: number, type: string, body: string) => {
      res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' })
      res.end(body)
    }
    try {
      const hostName = (req.headers.host ?? '').replace(/:\d+$/, '')
      if (!loopback.has(hostName)) return send(403, 'text/plain', 'Forbidden')
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed')
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      if (path === '/') return send(200, 'text/html', html(createElement(RunList, { runs: await store.listRuns() })))
      const match = /^\/runs\/([^/]+?)(\.json|\/)?$/.exec(path)
      if (!match) return send(404, 'text/plain', 'Not found')
      let id: string
      try { id = decodeURIComponent(match[1]) } catch { return send(404, 'text/plain', 'Not found') }
      if (!(await store.getRun(id))) return send(404, 'text/plain', 'Not found')
      const trace = await buildTrace(store, id)
      if (match[2] === '.json') return send(200, 'application/json', JSON.stringify(trace))
      if (match[2] === undefined) {
        res.writeHead(308, { location: `/runs/${encodeURIComponent(id)}/` })
        return res.end()
      }
      return send(200, 'text/html', html(createElement(TraceView, { trace })))
    } catch (error) {
      send(500, 'text/plain', error instanceof Error ? error.message : 'Error')
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 4400, host, resolve)
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
    close: () => new Promise<void>((resolve, reject) => { server.closeAllConnections(); server.close(error => (error ? reject(error) : resolve())) }),
  }
}
