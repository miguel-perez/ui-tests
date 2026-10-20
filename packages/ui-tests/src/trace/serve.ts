import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import type { AddressInfo } from 'node:net'
import { userInfo } from 'node:os'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import type { LintFinding } from '../lint.ts'
import type { IncomingMessage } from 'node:http'
import type { RunRow, RunStore } from '../store/types.ts'
import { buildRecord } from '../record/build.ts'
import { mayShow, ReportView } from '../report/view.tsx'
import type { ResultHook } from '../runner/progress.ts'
import { buildTrace } from './build.ts'
import { recordRevision, RevisionRefused, type RevisionRequest } from './revise.ts'
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

const MAX_FORM = 64 * 1024

/** The form body, read up to a limit. */
async function readForm(req: IncomingMessage): Promise<URLSearchParams | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_FORM) return undefined
    chunks.push(chunk as Buffer)
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

/**
 * Whether a write came from a page this viewer served. A browser sends `Origin` on every form post, so a post without one, or from another
 * origin (including a page on a rebound name), is refused; `Sec-Fetch-Site` must agree when it is sent.
 */
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin !== `http://${req.headers.host}`) return false
  const site = req.headers['sec-fetch-site']
  return site === undefined || site === 'same-origin'
}

const text = (form: URLSearchParams, key: string) => form.get(key)?.trim() || undefined
const whole = (value: string | undefined) => (value !== undefined && /^\d{1,9}$/.test(value) ? Number(value) : NaN)

/** The revision a posted form asks for. The attempt a person is called in the trace ("Attempt 3") is the third of the run. */
function requestFrom(form: URLSearchParams, attemptIds: string[]): RevisionRequest {
  const kind = text(form, 'kind')
  const attempt = text(form, 'attempt')
  const goalIndex = whole(text(form, 'goalIndex'))
  switch (kind) {
    case 'exclude': return { kind, attempt: attempt!, reason: text(form, 'reason')! }
    case 'incentive': return { kind, ...(attempt && { attempt }), amount: { minor: whole(text(form, 'minor')), currency: (text(form, 'currency') ?? '').toUpperCase() } }
    case 'issue-edit': return { kind, issue: text(form, 'issue')!, ...(text(form, 'title') && { title: text(form, 'title')! }), ...(text(form, 'suggestedChange') && { suggestedChange: text(form, 'suggestedChange')! }) }
    case 'issue-merge': return { kind, issues: form.getAll('issue') }
    case 'issue-split': {
      const groups = (form.get('groups') ?? '').split('\n').map(line => line.split(/[,\s]+/).filter(Boolean).map(n => attemptIds[Number(n) - 1] ?? `attempt ${n}`)).filter(g => g.length > 0)
      return { kind, issue: text(form, 'issue')!, moments: groups }
    }
    case 'scenario': return { kind, goalIndex, text: text(form, 'text')! }
    case 'promote-path': return { kind, goalIndex, path: (form.get('path') ?? '').split('\n').map(p => p.trim()).filter(Boolean) }
    case 'code-impression': return { kind, attempt: attempt!, code: text(form, 'code') as 'no answer' }
    case 'undo': return { kind, revision: whole(text(form, 'revision')) }
    default: throw new RevisionRefused('Unknown revision')
  }
}

const html = (node: Parameters<typeof renderToString>[0]) => `<!doctype html>${renderToString(node)}`

/**
 * The report as it is shared, for the author on this machine: the same view, with plain links in place of signed ones. A person's page
 * carries the recording when one was kept, opened at the moment `at` names.
 */
async function authorReport(store: RunStore, id: string, person: number | undefined, at: string | null): Promise<string | undefined> {
  const record = await buildRecord(store, id)
  const base = `/runs/${encodeURIComponent(id)}/report`
  const link = (path: string) => `${path}/`
  const document = (title: string, body: Parameters<typeof renderToString>[0], script = false) =>
    html(createElement('html', { lang: 'en' }, createElement('head', null, createElement('meta', { charSet: 'utf-8' }), createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }), createElement('title', null, title)), createElement('body', { style: { margin: 0 } }, body, script ? createElement('script', { src: '/replay.js', defer: true }) : null)))
  if (person === undefined) return document(`Report · ${record.compiled.name}`, createElement(ReportView, { record, base, link }))
  const attempt = record.attempts[person - 1]
  if (!attempt) return undefined
  const item = (await buildTrace(store, id)).attempts[person - 1]
  const startAt = at !== null && at !== '' && Number.isFinite(Number(at)) ? Number(at) : undefined
  const begun = item?.replay?.length ? (item.replay[0]!.data as { timestamp?: number }).timestamp : undefined
  const replay = item?.replay && mayShow(attempt) && createElement('div', { 'data-replay': attempt.id },
    createElement('script', { type: 'application/json', dangerouslySetInnerHTML: { __html: JSON.stringify({ events: item.replay.map((e) => e.data), moments: item.reel.map((m) => ({ start: m.start, end: m.end, label: momentLabel(m) })), ...(startAt !== undefined && { startAt }) }).replace(/</g, '\\u003c') } }))
  return document(`Report · ${record.compiled.name}`, createElement(ReportView, { record, base, attemptIndex: person - 1, link, replay: replay || undefined, ...(startAt !== undefined && begun !== undefined && { moment: Math.max(0, startAt - begun) }) }), Boolean(replay))
}

/**
 * Serves the trace on this machine only: `/` lists runs, `/runs/<run>/` shows one, `/runs/<run>.json` is the same
 * data. It binds to the loopback address, because the trace is for the author's own session (PRD 06).
 */
export async function serveTrace(options: { store: RunStore; port?: number; host?: string; lint?: LintFinding[] | ((run: RunRow) => LintFinding[]); author?: string; now?: () => Date; onResult?: ResultHook }): Promise<{ url: string; close(): Promise<void> }> {
  const host = options.host ?? '127.0.0.1'
  if (!loopback.has(host)) throw new Error(`The trace is served on this machine only; refusing to bind ${host}`)
  const { store } = options
  const author = options.author ?? (process.env.USER || userInfo().username)
  const server = createServer(async (req, res) => {
    const send = (status: number, type: string, body: string) => {
      res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' })
      res.end(body)
    }
    try {
      const hostName = (req.headers.host ?? '').replace(/:\d+$/, '')
      if (!loopback.has(hostName)) return send(403, 'text/plain', 'Forbidden')
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      if (req.method === 'POST') {
        // The only write: a revision, from a form on this viewer's own page.
        const target = /^\/runs\/([^/]+)\/revisions\/?$/.exec(path)
        if (!target) return send(404, 'text/plain', 'Not found')
        if (!sameOrigin(req)) return send(403, 'text/plain', 'Forbidden')
        let id: string
        try { id = decodeURIComponent(target[1]!) } catch { return send(404, 'text/plain', 'Not found') }
        if (!(await store.getRun(id))) return send(404, 'text/plain', 'Not found')
        const form = await readForm(req)
        if (!form) return send(413, 'text/plain', 'Too large')
        try {
          const ids = (await store.listAttempts(id)).map(a => a.id)
          await recordRevision(store, id, requestFrom(form, ids), { by: author, ...(options.now && { now: options.now }), ...(options.onResult && { onResult: options.onResult }) })
        } catch (error) {
          if (error instanceof RevisionRefused) return send(400, 'text/plain', error.message)
          throw error
        }
        res.writeHead(303, { location: `/runs/${encodeURIComponent(id)}/#revisions` })
        return res.end()
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed')
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
        const page = await authorReport(store, id, shown[2] === undefined ? undefined : Number(shown[2]), new URL(req.url ?? '/', 'http://localhost').searchParams.get('at'))
        return page === undefined ? send(404, 'text/plain', 'Not found') : send(200, 'text/html', page)
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
      const record = await buildRecord(store, id)
      return send(200, 'text/html', html(createElement(TraceView, { trace, issues: record.issues, exclusions: record.exclusions, author })))
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
