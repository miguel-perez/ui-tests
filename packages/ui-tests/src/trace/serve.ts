import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import type { AddressInfo } from 'node:net'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { LintFinding } from '../lint.ts'
import type { RunRow, RunStore } from '../store/types.ts'
import { buildRecord } from '../record/build.ts'
import { ReportView } from '../report/view.tsx'
import { buildTrace } from './build.ts'
import { momentLabel } from './reel.ts'
import { RunList, TraceView } from './view.tsx'

const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
/** The browser side of the trace: rrweb-player and the Replay component, bundled once on first request. */
let clientBundle: Promise<string> | undefined
function replayBundle(): Promise<string> {
  clientBundle ??= build({
    stdin: {
      contents: `import css from 'rrweb-player/dist/style.css'\nimport { mountReplays } from './replay.tsx'\nmountReplays(document, css)`,
      resolveDir: fileURLToPath(new URL('.', import.meta.url)),
      loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true, jsx: 'automatic',
    loader: { '.css': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  }).then((result) => result.outputFiles[0]!.text)
  clientBundle.catch(() => { clientBundle = undefined })
  return clientBundle
}

const html = (node: Parameters<typeof renderToString>[0]) => `<!doctype html>${renderToString(node)}`

/**
 * The report as it is shared, for the author on this machine: the same view, with plain links in place of signed ones. A person's page
 * carries the recording when one was kept, opened at the moment `at` names.
 */
async function authorReport(store: RunStore, id: string, person: number | undefined, at: string | null): Promise<string> {
  const record = await buildRecord(store, id)
  const base = `/runs/${encodeURIComponent(id)}/report`
  const link = (path: string) => `${path}/`
  const document = (title: string, body: Parameters<typeof renderToString>[0], script = false) =>
    html(createElement('html', { lang: 'en' }, createElement('head', null, createElement('meta', { charSet: 'utf-8' }), createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }), createElement('title', null, title)), createElement('body', { style: { margin: 0 } }, body, script ? createElement('script', { src: '/replay.js', defer: true }) : null)))
  if (person === undefined) return document(`Report · ${record.compiled.name}`, createElement(ReportView, { record, base, link }))
  const attempt = record.attempts[person - 1]
  if (!attempt) return document('Not found', createElement('p', null, 'No such person.'))
  const item = (await buildTrace(store, id)).attempts[person - 1]
  const startAt = at !== null && at !== '' && Number.isFinite(Number(at)) ? Number(at) : undefined
  const begun = item?.replay?.length ? (item.replay[0]!.data as { timestamp?: number }).timestamp : undefined
  const replay = item?.replay && createElement('div', { 'data-replay': attempt.id },
    createElement('script', { type: 'application/json', dangerouslySetInnerHTML: { __html: JSON.stringify({ events: item.replay.map((e) => e.data), moments: item.reel.map((m) => ({ start: m.start, end: m.end, label: momentLabel(m) })), ...(startAt !== undefined && { startAt }) }).replace(/</g, '\\u003c') } }))
  return document(`Report · ${record.compiled.name}`, createElement(ReportView, { record, base, attemptIndex: person - 1, link, replay, ...(startAt !== undefined && begun !== undefined && { moment: Math.max(0, startAt - begun) }) }), replay !== undefined)
}

/**
 * Serves the trace on this machine only: `/` lists runs, `/runs/<run>/` shows one, `/runs/<run>.json` is the same
 * data. It binds to the loopback address, because the trace is for the author's own session (PRD 06).
 */
export async function serveTrace(options: { store: RunStore; port?: number; host?: string; lint?: LintFinding[] | ((run: RunRow) => LintFinding[]) }): Promise<{ url: string; close(): Promise<void> }> {
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
      if (path === '/replay.js') return send(200, 'text/javascript', await replayBundle())
      if (path === '/') return send(200, 'text/html', html(createElement(RunList, { runs: await store.listRuns() })))
      const shown = /^\/runs\/([^/]+)\/report(?:\/p([1-9]\d{0,5}))?\/?$/.exec(path)
      if (shown) {
        let id: string
        try { id = decodeURIComponent(shown[1]!) } catch { return send(404, 'text/plain', 'Not found') }
        if (!(await store.getRun(id))) return send(404, 'text/plain', 'Not found')
        if (!path.endsWith('/')) {
          res.writeHead(308, { location: `${path}/` })
          return res.end()
        }
        return send(200, 'text/html', await authorReport(store, id, shown[2] === undefined ? undefined : Number(shown[2]), new URL(req.url ?? '/', 'http://localhost').searchParams.get('at')))
      }
      const match = /^\/runs\/([^/]+?)(\.json|\/)?$/.exec(path)
      if (!match) return send(404, 'text/plain', 'Not found')
      let id: string
      try { id = decodeURIComponent(match[1]) } catch { return send(404, 'text/plain', 'Not found') }
      const run = await store.getRun(id)
      if (!run) return send(404, 'text/plain', 'Not found')
      const trace = await buildTrace(store, id, typeof options.lint === 'function' ? options.lint(run) : options.lint)
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
