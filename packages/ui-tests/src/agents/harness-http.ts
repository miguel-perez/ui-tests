import type { Harness, ToolSpec } from './model.ts'

/** How long one request may take. */
export const HTTP_TIMEOUT_MS = 30_000
/** How much of a response body the agent is shown. */
export const HTTP_OUTPUT_CAP = 64 * 1024

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const DROPPED_HEADERS = new Set(['host', 'connection', 'content-length', 'transfer-encoding'])

export type HttpHarnessOptions = { timeoutMs?: number; outputCap?: number; fetch?: typeof fetch }

/** Reads at most `cap` characters of the body and cancels the rest, so a large answer is never held whole. */
async function readCapped(response: Response, cap: number): Promise<{ text: string; cut: boolean }> {
  if (!response.body) return { text: '', cut: false }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { text: text + decoder.decode(), cut: false }
      text += decoder.decode(value, { stream: true })
      if (text.length > cap) { await reader.cancel(); return { text: text.slice(0, cap), cut: true } }
    }
  } catch { return { text, cut: false } }
}

type RequestInput = { method?: unknown; path?: unknown; body?: unknown; headers?: unknown }

/**
 * The http harness: the agent gets the scenario, the base URL and the API's description, and one tool, `request`, that
 * calls a path on that origin. Nothing else is reachable: absolute URLs to other origins are refused and redirects are
 * not followed. A 404 reads "called POST /invites, which does not exist"; other errors name the status.
 */
export function httpHarness(baseUrl: string, description?: string, options: HttpHarnessOptions = {}): Harness {
  const base = new URL(baseUrl)
  const timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS
  const cap = options.outputCap ?? HTTP_OUTPUT_CAP
  const doFetch = options.fetch ?? fetch
  let effects: string[] = []

  const tools: ToolSpec[] = [{
    name: 'request',
    description: [`Sends one HTTP request to the API at ${base.origin}${base.pathname === '/' ? '' : base.pathname} and returns the status, content type and body.`, description && `About the API: ${description}`, 'Only paths on this origin can be called.'].filter(Boolean).join('\n'),
    input: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: METHODS },
        path: { type: 'string', description: 'The path and query, starting with /' },
        body: { description: 'A JSON value, or a string sent as is' },
        headers: { type: 'object', additionalProperties: { type: 'string' } },
      },
      required: ['method', 'path'],
    },
  }]

  async function request(input: RequestInput): Promise<{ output: string; error?: string }> {
    const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET'
    if (!METHODS.includes(method)) return { output: '', error: `called ${String(input.method)}, which is not an HTTP method here` }
    const path = typeof input.path === 'string' ? input.path : ''
    if (!path.startsWith('/') || path.startsWith('//')) return { output: '', error: `called ${method} ${path || '(no path)'}, but only paths on ${base.origin} starting with / can be called` }
    const prefix = base.pathname.replace(/\/$/, '')
    const url = new URL(path.startsWith(`${prefix}/`) || !prefix ? path : `${prefix}${path}`, base.origin)
    if (url.origin !== base.origin) return { output: '', error: `called ${method} ${path}, which is not on ${base.origin}` }
    if (prefix && url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return { output: '', error: `called ${method} ${path}, which is outside ${base.origin}${prefix}` }
    const headers: Record<string, string> = {}
    if (input.headers && typeof input.headers === 'object') {
      for (const [name, value] of Object.entries(input.headers)) if (typeof value === 'string' && !DROPPED_HEADERS.has(name.toLowerCase())) headers[name] = value
    }
    let body: string | undefined
    if (input.body !== undefined && input.body !== null && !SAFE.has(method)) {
      body = typeof input.body === 'string' ? input.body : JSON.stringify(input.body)
      if (typeof input.body !== 'string' && !Object.keys(headers).some(h => h.toLowerCase() === 'content-type')) headers['content-type'] = 'application/json'
    }
    const called = `${method} ${path}`
    let response: Response
    try {
      response = await doFetch(url, { method, headers, ...(body !== undefined && { body }), redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError'
      return { output: '', error: timedOut ? `called ${called}, which took longer than ${Math.round(timeoutMs / 1000)} s` : `called ${called}, which could not be reached` }
    }
    const { text, cut } = method === 'HEAD' ? { text: '', cut: false } : await readCapped(response, cap)
    const shown = cut ? `${text}\n[body cut at ${cap} characters]` : text
    const output = `${response.status} ${response.statusText}\ncontent-type: ${response.headers.get('content-type') ?? ''}${response.headers.get('location') ? `\nlocation: ${response.headers.get('location')}` : ''}\n\n${shown}`
    if (!SAFE.has(method) && response.status < 400) effects.push(`${called} answered ${response.status}`)
    if (response.status === 404) return { output, error: `called ${called}, which does not exist` }
    if (response.status >= 400) return { output, error: `called ${called}, which answered ${response.status}` }
    return { output }
  }

  return {
    tools: () => tools,
    async call(name, input) {
      if (name !== 'request') return { output: '', error: `called ${name}, which is not a tool here` }
      return request((input ?? {}) as RequestInput)
    },
    async endState() { return { sideEffects: [...effects] } },
    async reset() { effects = [] },
    async dispose() { effects = [] },
  }
}
