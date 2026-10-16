import { z } from 'zod'
import { SQLiteAdapter, recordingRetentionMs, type Run, type StorageAdapter } from './storage.ts'

/** Projects a run onto what the participant may see. An explicit allowlist: no compiler data, answers, hooks, trace or happy paths cross this boundary. */
export function participantView(run: Run) {
  const goal = run.context.goals[run.goalIndex]
  const pending = (run.result as { question?: { question: string; choices: string[] } } | undefined)?.question
  const neutral = (text: string) => text.replace(/ui-tests/gi, 'this tool')
  const sequence = run.sequence ?? { index: 1, total: 1 }
  // Confidence is asked only when the outcome cannot be verified by the end state or a validation question (MeasuringU: self-reported completion is never a success rate).
  return { id: run.id, author: neutral(run.context.author), purpose: neutral(run.context.purpose), status: run.status, scenario: neutral(goal.scenario.text), tasks: goal.tasks.map(t => neutral(t.name)), timeBox: goal.timeBox.seconds + (run.extendedSeconds ?? 0), extended: !!run.extendedSeconds, startedAt: run.startedAt, sequence, askConfidence: !goal.hasOutcome, recording: run.recording ?? { events: true, screen: false, voice: false, webcam: false }, verificationReady: !!run.result, validation: pending ? { question: pending.question, choices: pending.choices } : undefined, accent: run.context.accent }
}
/** Extra time granted once per attempt when the participant asks for it: half the time box, at least a minute. */
export function extension(run: Run) { return Math.max(60, Math.round(run.context.goals[run.goalIndex].timeBox.seconds / 2)) }
/** The largest voice recording accepted, in bytes of audio. */
export const maxAudioBytes = 1_500_000
const snapshot = z.object({ url: z.url(), dom: z.string().max(2_000_000) })
const event = z.object({ type: z.enum(['click', 'url', 'scroll', 'input', 'pause', 'step']), at: z.number(), url: z.url(), target: z.string().max(300).optional(), changed: z.boolean().optional(), stoppedMs: z.number().optional(), step: z.number().int().nonnegative().optional(), snapshot: snapshot.optional() })
const message = z.discriminatedUnion('action', [
  z.object({ action: z.literal('consent'), id: z.string(), token: z.string() }),
  z.object({ action: z.literal('begin') }),
  z.object({ action: z.literal('events'), events: z.array(event).max(100) }),
  z.object({ action: z.literal('end'), reason: z.enum(['done', "couldn't do this", 'abandoned early', 'ran out of time']), snapshot }),
  z.object({ action: z.literal('extend') }),
  z.object({ action: z.literal('withdraw') }),
  z.object({ action: z.literal('voice'), question: z.enum(['difficulty', 'words']), mime: z.string().regex(/^audio\/[\w.+-]+(;[\w=.,+ -]*)?$/).max(100), audio: z.base64().max(Math.ceil(maxAudioBytes / 3) * 4), transcript: z.string().max(5000), seconds: z.number().nonnegative().max(900) }),
  z.object({ action: z.literal('questions'), seq: z.number().int().min(1).max(7), difficulty: z.string().max(5000).optional(), confidence: z.number().int().min(1).max(7).optional(), afterGoal: z.object({ ease: z.number().int().min(1).max(5), usefulness: z.number().int().min(1).max(5) }).optional(), words: z.string().max(5000).optional(), answers: z.record(z.string(), z.string()).optional() }),
])
/** Reads the run id and token from the `ui-tests-run` cookie. */
function cookie(request: Request) { return /(?:^|;\s*)ui-tests-run=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1]?.split('.') }
/** Builds the `/api/ui-tests` route handler. GET returns the participant view; POST handles consent, begin, events, end, extend, withdraw, voice and questions, validated with Zod and bound to the run's token. */
export function createCollector(getStorage: () => StorageAdapter = () => new SQLiteAdapter()) {
  /** Handles one collector request; storage is opened and closed per request. */
  return async function handler(request: Request) {
    // Collector is deliberately development-only in this slice.
    if (process.env.NODE_ENV === 'production') return new Response('Rehearsals require dev mode', { status: 404 })
    const store = getStorage()
    try {
      // Recordings past the retention default go before anything is read or served.
      store.purgeRecordings(Date.now() - recordingRetentionMs)
      const [id, token] = request.headers.get('authorization')?.replace(/^Bearer /, '').split('.') ?? cookie(request) ?? []
      if (request.method === 'GET') {
        const run = id && token ? store.authorize(id, token) : undefined
        return run ? Response.json(participantView(run), { headers: { 'Cache-Control': 'no-store' } }) : new Response('Unauthorized', { status: 401 })
      }
      if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Invalid origin', { status: 403 })
      if (Number(request.headers.get('content-length') ?? 0) > 2_100_000) return new Response('Request too large', { status: 413 })
      const body = message.parse(await request.json())
      // Read current state after body I/O so an overlapping request cannot restore stale state.
      let run = id && token ? store.authorize(id, token) : undefined
      const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
      if (body.action === 'consent') {
        run = store.authorize(body.id, body.token)
        if (!run || run.status !== 'created') return new Response('Invalid participant token', { status: 401 })
        if (run.withdrawnAt) return new Response('Attempt was withdrawn', { status: 409 })
        run.status = 'consented'
        headers['Set-Cookie'] = `ui-tests-run=${run.id}.${run.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`
      } else {
        if (!run) return new Response('Unauthorized', { status: 401 })
        // Withdrawal is final: nothing else may write to the attempt afterwards, consent included.
        if (run.withdrawnAt && body.action !== 'withdraw') return new Response('Attempt was withdrawn', { status: 409 })
        if (body.action === 'begin') {
          if (run.status !== 'consented') return new Response('Consent is required before beginning', { status: 409 })
          run.status = 'active'; run.startedAt = Date.now()
        } else if (body.action === 'events') {
          if (run.status !== 'active') return new Response('Attempt is not active', { status: 409 })
          store.append(run.id, body.events)
          return Response.json(participantView(run), { headers })
        } else if (body.action === 'end') {
          if (run.status !== 'active') return new Response('Attempt is not active', { status: 409 })
          run.status = 'questions'; run.reason = Date.now() >= run.startedAt + (run.context.goals[run.goalIndex].timeBox.seconds + (run.extendedSeconds ?? 0)) * 1000 ? 'ran out of time' : body.reason; run.snapshot = body.snapshot; run.endedAt = Date.now()
        } else if (body.action === 'extend') {
          if (run.status !== 'active') return new Response('Attempt is not active', { status: 409 })
          if (run.extendedSeconds) return new Response('More time was already given', { status: 409 })
          run.extendedSeconds = extension(run)
        } else if (body.action === 'withdraw') {
          // Withdrawal removes every recording for the run and marks the attempt withdrawn; it is final.
          return Response.json(participantView(store.withdraw(run.id)!), { headers })
        } else if (body.action === 'voice') {
          if (run.status !== 'questions') return new Response('Questions are not available', { status: 409 })
          const audio = Buffer.from(body.audio, 'base64')
          if (!audio.length || audio.length > maxAudioBytes) return new Response('Recording too large', { status: 413 })
          // Choosing to talk is the consent: the player asks for it once before the microphone opens.
          const recording = store.saveRecording(run.id, body.mime, audio)
          const replaced = run.voice?.filter(answer => answer.question === body.question) ?? []
          run.voice = [...(run.voice ?? []).filter(answer => answer.question !== body.question), { question: body.question, transcript: body.transcript, recording, mime: body.mime, seconds: body.seconds }]
          run.recording = { ...(run.recording ?? { events: true, screen: false, webcam: false }), voice: true }
          store.update(run)
          // Recording again replaces the earlier clip: its audio is deleted, not kept unreferenced.
          for (const answer of replaced) store.deleteRecording(answer.recording)
          return Response.json(participantView(run), { headers })
        } else {
          if (run.status !== 'questions' && run.status !== 'finished') return new Response('Questions are not available', { status: 409 })
          run.seq = body.seq; run.difficulty = body.difficulty; run.confidence = body.confidence; run.afterGoal = body.afterGoal; run.words = body.words; run.answers = body.answers; run.status = 'finished'; run.result = undefined
        }
      }
      store.update(run)
      return Response.json(participantView(run), { headers })
    } catch (error) {
      return new Response(error instanceof z.ZodError ? error.message : 'Collector failed', { status: error instanceof z.ZodError ? 400 : 500 })
    } finally { store.close() }
  }
}
