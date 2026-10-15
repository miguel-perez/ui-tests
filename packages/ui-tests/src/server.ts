import { z } from 'zod'
import { SQLiteAdapter, type Run, type StorageAdapter } from './storage.ts'

// An explicit allowlist: no compiler data, answers, hooks, trace or happy paths cross this boundary.
export function participantView(run: Run) {
  const goal = run.context.goals[run.goalIndex]
  const pending = (run.result as { question?: { question: string; choices: string[] } } | undefined)?.question
  const neutral = (text: string) => text.replace(/ui-tests/gi, 'this tool')
  return { id: run.id, author: neutral(run.context.author), purpose: neutral(run.context.purpose), status: run.status, scenario: neutral(goal.scenario.text), tasks: goal.tasks.map(t => neutral(t.name)), timeout: goal.timeout.seconds, startedAt: run.startedAt, verificationReady: !!run.result, validation: pending ? { question: pending.question, choices: pending.choices } : undefined }
}
const snapshot = z.object({ url: z.url(), dom: z.string().max(2_000_000) })
const event = z.object({ type: z.enum(['click', 'url', 'scroll', 'input', 'pause', 'step']), at: z.number(), url: z.url(), target: z.string().max(300).optional(), changed: z.boolean().optional(), duration: z.number().optional(), step: z.number().int().nonnegative().optional(), snapshot: snapshot.optional() })
const message = z.discriminatedUnion('action', [
  z.object({ action: z.literal('consent'), id: z.string(), token: z.string() }),
  z.object({ action: z.literal('begin') }),
  z.object({ action: z.literal('events'), events: z.array(event).max(100) }),
  z.object({ action: z.literal('end'), reason: z.enum(['done', 'gave up', 'timed out']), snapshot }),
  z.object({ action: z.literal('questions'), seq: z.number().int().min(1).max(7), confidence: z.number().int().min(1).max(5), answers: z.record(z.string(), z.string()).optional() }),
])
function cookie(request: Request) { return /(?:^|;\s*)ui-tests-run=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]?.split('.') }
export function createCollector(getStorage: () => StorageAdapter = () => new SQLiteAdapter()) {
  return async function handler(request: Request) {
    // Collector is deliberately development-only in this slice.
    if (process.env.NODE_ENV === 'production') return new Response('Rehearsals require dev mode', { status: 404 })
    const store = getStorage()
    try {
      const [id, token] = request.headers.get('authorization')?.replace(/^Bearer /, '').split('.') ?? cookie(request) ?? []
      let run = id && token ? store.authorize(id, token) : undefined
      if (request.method === 'GET') return run ? Response.json(participantView(run), { headers: { 'Cache-Control': 'no-store' } }) : new Response('Unauthorized', { status: 401 })
      if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Invalid origin', { status: 403 })
      if (Number(request.headers.get('content-length') ?? 0) > 2_100_000) return new Response('Request too large', { status: 413 })
      const body = message.parse(await request.json())
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
      if (body.action === 'consent') {
        run = store.authorize(body.id, body.token)
        if (!run || run.status !== 'created') return new Response('Invalid participant token', { status: 401 })
        run.status = 'consented'
        headers['Set-Cookie'] = `ui-tests-run=${run.id}.${run.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
      } else {
        if (!run) return new Response('Unauthorized', { status: 401 })
        if (body.action === 'begin') {
          if (run.status !== 'consented') return new Response('Consent is required before beginning', { status: 409 })
          run.status = 'active'; run.startedAt = Date.now()
        } else if (body.action === 'events') {
          if (run.status !== 'active') return new Response('Attempt is not active', { status: 409 })
          store.append(run.id, body.events)
        } else if (body.action === 'end') {
          if (run.status !== 'active') return new Response('Attempt is not active', { status: 409 })
          run.status = 'questions'; run.reason = Date.now() >= run.startedAt + run.context.goals[run.goalIndex].timeout.seconds * 1000 ? 'timed out' : body.reason; run.snapshot = body.snapshot; run.endedAt = Date.now()
        } else {
          if (run.status !== 'questions' && run.status !== 'finished') return new Response('Questions are not available', { status: 409 })
          run.seq = body.seq; run.confidence = body.confidence; run.answers = body.answers; run.status = 'finished'; run.result = undefined
        }
      }
      store.update(run)
      return Response.json(participantView(run), { headers })
    } catch (error) {
      return new Response(error instanceof z.ZodError ? error.message : 'Collector failed', { status: error instanceof z.ZodError ? 400 : 500 })
    } finally { store.close() }
  }
}
