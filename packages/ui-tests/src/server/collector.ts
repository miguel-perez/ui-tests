import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { codeImpressionWith } from '../derive/code-impression.ts'
import { screenReport } from '../derive/screener.ts'
import type { TextModel } from '../model.ts'
import { FIRST_LOOK_SHOT } from '../runner/screenshot.ts'
import { fitScore } from '../derive/fit.ts'
import type { AttemptReason, AttemptRow, RecordedEvent, RunRow, RunStore } from '../store/types.ts'
import { MORE_TIME, effectiveTimeout, participantView } from './view.ts'

export type CollectorOptions = {
  store: () => Promise<RunStore>
  /** The secret the CLI sends as a Bearer token to act on an attempt named by `?attempt=`. */
  cliSecret?: string
  /** Codes the first-look answer when given; without it a content-word rule does. */
  model?: TextModel
  /** The clock in epoch milliseconds; replaced in tests. */
  now?: () => number
}

/** Most bytes a body may carry. `end` holds a snapshot of up to 2,000,000 characters, which JSON-escaping can nearly double. */
const END_BYTES = 5_000_000
const BODY_BYTES = 2_100_000
const MAX_EVENTS = 100
const MAX_SNAPSHOT_CHARS = 2_000_000

const snapshot = z.object({ url: z.string().max(2000), dom: z.string().max(MAX_SNAPSHOT_CHARS), truncated: z.boolean().optional(), state: z.unknown().optional() })
const at = z.union([z.number(), z.iso.datetime()]).transform((value) => (typeof value === 'number' ? value : Date.parse(value)))
const event = z.object({
  type: z.enum(['click', 'url', 'scroll', 'input', 'pause', 'step', 'key', 'focus', 'rrweb']),
  at,
  url: z.string().max(2000),
  target: z.string().max(300).optional(),
  changed: z.boolean().optional(),
  duration: z.number().optional(),
  step: z.number().int().nonnegative().optional(),
  data: z.unknown().optional(),
  seq: z.number().int().nonnegative().optional(),
})
const scale = z.number().int().min(1).max(7)
const message = z.discriminatedUnion('action', [
  z.object({ action: z.literal('consent') }),
  z.object({ action: z.literal('begin') }),
  z.object({ action: z.literal('events'), events: z.array(event).max(MAX_EVENTS) }),
  z.object({ action: z.literal('step'), index: z.number().int().nonnegative(), snapshot: snapshot.optional() }),
  z.object({ action: z.literal('end'), reason: z.enum(['done', 'gave up', 'timeout']), snapshot }),
  z.object({
    action: z.literal('answers'),
    screener: z.record(z.string(), z.union([z.string().max(500), z.array(z.string().max(500)).max(50)])).optional(),
    impression: z.string().max(5000).optional(),
    /** Where on the first-look picture the person clicked, as fractions of its width and height. */
    firstClick: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), target: z.string().max(300) }).optional(),
    ease: scale.optional(),
    difficulty: z.string().max(5000).optional(),
    confidence: scale.optional(),
    answer: z.string().max(1000).optional(),
    uxlite: z.record(z.string(), scale).optional(),
    comment: z.string().max(10_000).optional(),
  }),
  z.object({ action: z.literal('more-time') }),
  z.object({ action: z.literal('withdraw') }),
])
type Message = z.infer<typeof message>

const headers = { 'Cache-Control': 'no-store' }
const refuse = (status: number, text: string) => new Response(text, { status, headers })

const cookieValue = (request: Request, name: string) => new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get('cookie') ?? '')?.[1]

/** The usual browser, device and assistive technology a person gave while screening. */
function environmentOf(given: Record<string, unknown>): Record<string, string> | undefined {
  const text = (id: string) => { const v = given[id]; return Array.isArray(v) ? v.join(', ') : typeof v === 'string' ? v : undefined }
  const entries = (['browser', 'device', 'assistive'] as const).flatMap((key) => { const v = text(`screener.${key}`); return v ? [[key, v] as const] : [] })
  return entries.length ? Object.fromEntries(entries) : undefined
}

const first = (value: string | null) => value?.split(',')[0]?.trim() || undefined

/** The origin the browser sees: forwarded host and protocol win over the internal URL behind a proxy or tunnel. */
function publicOrigin(request: Request, url: URL): string {
  const proto = first(request.headers.get('x-forwarded-proto'))
  const host = first(request.headers.get('x-forwarded-host'))
  return `${proto ?? url.protocol.replace(':', '')}://${host ?? url.host}`
}

const isSecure = (request: Request, url: URL) => publicOrigin(request, url).startsWith('https:')

/** Reads the body while counting bytes; undefined once it passes `limit`, without reading the rest. */
async function readBody(request: Request, limit: number): Promise<string | undefined> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      return undefined
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function sameSecret(given: string, secret: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Builds the collector: one handler for `GET` (the participant view) and `POST` (the participant's actions). */
export function createCollector(options: CollectorOptions): (request: Request) => Promise<Response> {
  const now = options.now ?? Date.now

  return async function collector(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const get = request.method === 'GET'
    if (!get && request.method !== 'POST') return refuse(405, 'Method not allowed')
    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > END_BYTES) return refuse(413, 'Request too large')

    const store = await options.store()
    const bearer = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1]
    const cookie = cookieValue(request, 'ui-tests-run')
    const resolved = await authorize(store, url, bearer, cookie, get)
    if (!resolved) return refuse(401, 'Unauthorized')
    const wantedRun = url.searchParams.get('run')
    if (wantedRun && wantedRun !== resolved.run.run) return refuse(401, 'Unauthorized')

    if (get && url.searchParams.get('shot') === 'first-look') return firstLook(store, resolved.attempt)
    if (get) return respond(resolved.run, resolved.attempt)

    // Cookies ride along on cross-site requests, so a write they authorise must come from this origin. Bearer writes (CLI, tests) are not ambient.
    if (resolved.via === 'cookie' && request.headers.get('origin') !== publicOrigin(request, url)) return refuse(403, 'Invalid origin')

    const text = await readBody(request, END_BYTES)
    if (text === undefined) return refuse(413, 'Request too large')
    let raw: unknown
    try { raw = JSON.parse(text) } catch { return refuse(400, 'Body is not JSON') }
    const action = (raw as { action?: unknown } | null)?.action
    if (action !== 'end' && Buffer.byteLength(text) > BODY_BYTES) return refuse(413, 'Request too large')
    const parsed = message.safeParse(raw)
    if (!parsed.success) return refuse(400, parsed.error.message)

    return act(store, resolved.run, resolved.attempt, parsed.data, 'token' in resolved ? resolved.token : undefined, isSecure(request, url))
  }

  /** Who is asking: the CLI secret naming an attempt, or a participant token from `?t=` (GET only), then Bearer, then the cookie. */
  async function authorize(store: RunStore, url: URL, bearer: string | undefined, cookie: string | undefined, get: boolean) {
    if (bearer && options.cliSecret && sameSecret(bearer, options.cliSecret)) {
      const attempt = await store.getAttempt(url.searchParams.get('attempt') ?? '')
      const run = attempt && (await store.getRun(attempt.runId))
      return run && attempt ? { run, attempt, via: 'cli' as const } : undefined
    }
    const query = get ? (url.searchParams.get('t') ?? undefined) : undefined
    const via = query ? ('query' as const) : bearer ? ('bearer' as const) : cookie ? ('cookie' as const) : undefined
    const token = query ?? bearer ?? cookie
    const found = token ? await store.authorize(token) : undefined
    return found && via && token ? { ...found, via, token } : undefined
  }

  /** The picture of the page for this attempt's first look; only its owner can ask. */
  async function firstLook(store: RunStore, attempt: AttemptRow): Promise<Response> {
    const id = attempt.answers[FIRST_LOOK_SHOT]
    const blob = typeof id === 'string' ? await store.getBlob(id) : undefined
    if (!blob) return refuse(404, 'No picture')
    return new Response(Buffer.from(blob.bytes), { headers: { ...headers, 'Content-Type': blob.contentType } })
  }

  async function respond(run: RunRow, attempt: AttemptRow, extra?: Headers): Promise<Response> {
    const response = Response.json(participantView(run, attempt), { headers })
    extra?.forEach((value, key) => response.headers.append(key, value))
    return response
  }

  async function act(store: RunStore, run: RunRow, attempt: AttemptRow, body: Message, token: string | undefined, secure: boolean): Promise<Response> {
    const goal = run.compiled.goals[attempt.goalIndex]!
    const reload = async (extra?: Headers) => respond(run, (await store.getAttempt(attempt.id)) ?? attempt, extra)
    const conflict = (text: string) => refuse(409, text)
    // The first look is coded before the transaction opens, so a model call never holds a connection.
    const coded = body.action === 'answers' && body.impression !== undefined ? await codeImpressionWith(body.impression, run.compiled.purpose, options.model) : undefined

    // After the run's deadline nobody new starts: consent and begin are refused. Attempts already under way finish.
    if ((body.action === 'consent' || body.action === 'begin') && now() >= Date.parse(run.deadline)) return conflict('This study has closed')
    switch (body.action) {
      case 'consent': {
        if (attempt.status === 'created') {
          const moved = await store.updateAttempt(attempt.id, { status: 'consented', purposes: run.compiled.consent.purposes }, 'created')
          if (!moved && (await store.getAttempt(attempt.id))?.status !== 'consented') return conflict('Consent was already given or the attempt moved on')
        } else if (attempt.status !== 'consented') return conflict('Consent was already given or the attempt moved on')
        // A CLI-secret request has no participant token, so it sets no cookie: the secret never goes into one.
        if (!token) return reload()
        const flag = secure ? '; Secure' : ''
        const cookies = new Headers()
        cookies.append('Set-Cookie', `ui-tests-run=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7200${flag}`)
        cookies.append('Set-Cookie', `ui-tests-active=1; Path=/; SameSite=Lax; Max-Age=7200${flag}`)
        return reload(cookies)
      }
      case 'begin': {
        const moved = await store.updateAttempt(attempt.id, { status: 'active', startedAt: new Date(now()).toISOString() }, 'consented')
        return moved ? reload() : conflict('Consent is required before beginning')
      }
      case 'events': {
        if ((await store.getAttempt(attempt.id))?.status !== 'active') return conflict('Attempt is not active')
        await store.appendEvents(attempt.id, body.events as RecordedEvent[])
        return reload()
      }
      case 'step': {
        if ((await store.getAttempt(attempt.id))?.status !== 'active') return conflict('Attempt is not active')
        await store.appendEvents(attempt.id, [{ type: 'step', at: now(), url: body.snapshot?.url ?? '', step: body.index }])
        if (body.snapshot) await store.putSnapshot(attempt.id, `step-${body.index}`, body.snapshot)
        return reload()
      }
      case 'end': {
        const current = await store.getAttempt(attempt.id)
        if (current?.status !== 'active') return conflict('Attempt is not active')
        const started = current.startedAt ? Date.parse(current.startedAt) : now()
        const late = now() >= started + effectiveTimeout(goal.timeout.seconds, current) * 1000
        const reason: AttemptReason = late ? 'timeout' : body.reason
        // The status check inside updateAttempt is what makes the first end the only end.
        const moved = await store.transaction(async (tx) => {
          if (!(await tx.updateAttempt(attempt.id, { status: 'questions', reason, endedAt: new Date(now()).toISOString() }, 'active'))) return false
          await tx.putSnapshot(attempt.id, 'end', body.snapshot)
          return true
        })
        if (!moved) return conflict('Attempt is not active')
        return reload()
      }
      case 'more-time': {
        const result = await store.transaction(async (tx) => {
          const current = await tx.getAttempt(attempt.id)
          if (current?.status !== 'active') return 'Attempt is not active'
          if (current.answers[MORE_TIME]) return 'More time was already given'
          await tx.updateAttempt(attempt.id, { answers: { ...current.answers, [MORE_TIME]: true } }, 'active')
          return undefined
        })
        return result ? conflict(result) : reload()
      }
      case 'answers': {
        const result = await store.transaction(async (tx) => {
          const current = await tx.getAttempt(attempt.id)
          if (!current) return { status: 409, text: 'Consent is required before answering' }
          // A screener comes before consent (it decides who is asked to agree); nothing else may be answered until consent is given.
          const onlyScreener = Object.entries(body).every(([key, value]) => key === 'action' || key === 'screener' || value === undefined)
          if (current.status === 'created' && !(onlyScreener && body.screener)) return { status: 409, text: 'Consent is required before answering' }
          if (current.status === 'finished') return { status: 409, text: 'The attempt is finished' }
          if (body.answer !== undefined && !goal.answer) return { status: 400, text: 'This task asks no question to answer' }
          const given: Record<string, unknown> = {}
          const prefix = `goal${goal.index}`
          // Screener answers add up as the person goes.
          if (body.screener) given.screener = { ...(current.answers.screener as Record<string, unknown> | undefined), ...body.screener }
          // On a link nothing is filtered: the answers are read against the rules and the result kept for the author, and the person goes on to consent.
          if (body.screener && current.status === 'created') {
            const report = screenReport(given.screener as Record<string, unknown>, run.compiled.screener)
            given.screenerResult = { matches: report.result === 'accept', outside: report.outside, fit: fitScore(given.screener as Record<string, unknown>) }
          }
          if (body.impression !== undefined && coded) given.impression = { text: body.impression, code: coded.code, codedBy: coded.codedBy }
          if (body.firstClick) {
            const said = current.answers.impression as Record<string, unknown> | undefined
            if (!said || typeof said.text !== 'string') return { status: 409, text: 'Answer the question before clicking' }
            given.impression = { ...said, ...(given.impression as object | undefined), firstClick: body.firstClick }
          }
          if (body.ease !== undefined) given[`${prefix}.ease`] = body.ease
          if (body.difficulty !== undefined) given[`${prefix}.difficulty`] = body.difficulty
          if (body.confidence !== undefined) given[`${prefix}.confidence`] = body.confidence
          if (body.answer !== undefined && goal.answer) given[goal.answer.question] = body.answer
          for (const [id, value] of Object.entries(body.uxlite ?? {})) {
            if (!run.compiled.questions.some((q) => q.id === id && q.type === 'scale')) return { status: 400, text: `Unknown question ${id}` }
            given[id] = value
          }
          if (body.comment !== undefined) given.anything = body.comment
          const answers = { ...current.answers, ...given }
          const view = participantView(run, { ...current, answers })
          const answered = (id: string) => answers[id] !== undefined
          const complete =
            view.questions.every((q) => (q.askIf && !(typeof answers[q.askIf.id] === 'number' && (answers[q.askIf.id] as number) <= q.askIf.atOrBelow)) || answered(q.id)) &&
            (!goal.answer || answered(goal.answer.question))
          const finish = current.status === 'questions' && complete
          const environment = body.screener ? environmentOf(given.screener as Record<string, unknown>) : undefined
          const ok = await tx.updateAttempt(attempt.id, {
            answers,
            ...(finish && { status: 'finished' as const }),
            ...(environment && { environment }),
          }, current.status)
          return ok ? undefined : { status: 409, text: 'The attempt moved on; try again' }
        })
        return result ? refuse(result.status, result.text) : reload()
      }
      case 'withdraw': {
        // Allowed from any status until withdrawn, even after finishing: the reason becomes `withdrew`, which verification and counting skip.
        const result = await store.transaction(async (tx) => {
          const current = await tx.getAttempt(attempt.id)
          if (!current) return 'Attempt not found'
          if (current.reason !== 'withdrew') {
            const moved = await tx.updateAttempt(attempt.id, { status: 'finished', reason: 'withdrew', endedAt: new Date(now()).toISOString() }, current.status)
            if (!moved) return 'The attempt moved on; try again'
          }
          await tx.deleteBlobs(attempt.id)
          await tx.deleteEvents(attempt.id)
          await tx.deleteSnapshots(attempt.id)
          return undefined
        })
        return result ? conflict(result) : reload()
      }
    }
  }
}
