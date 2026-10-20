import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { uploadChunk } from '../src/browser/video-upload.ts'
import { videoResponse } from '../src/report/video.ts'
import { createCollector } from '../src/server/collector.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { AttemptRow, RunRow } from '../src/store/types.ts'
import { MAX_VIDEO_BYTES, MAX_VIDEO_CHUNKS, VIDEO_KEY, clipAt, clipOf, videoChunks, videoSegments, type VideoSegments } from '../src/video.ts'
import { newRun } from './store-conformance.ts'

describe('where a moment sits in the video', () => {
  // The share began at 10 s of wall-clock time (after a 3 s picker); the person paused from 20 s to 25 s.
  const segments: VideoSegments = [{ startedAt: 10_000, chunks: 6, pauses: [[20_000, 25_000]], gap: false }]

  it('counts from when the recording began, not from the picker', () => {
    expect(clipAt(segments, 14_000)).toEqual({ segment: 10_000, seconds: 4 })
  })
  it('leaves out the time the recording was paused', () => {
    expect(clipAt(segments, 22_000)).toEqual({ segment: 10_000, seconds: 10 })
    expect(clipAt(segments, 30_000)).toEqual({ segment: 10_000, seconds: 15 })
    expect(clipOf(segments, 28_000, 32_000)).toEqual({ segment: 10_000, from: 13, to: 17 })
  })
  it('finds a segment from its chunks and notes a missing chunk', () => {
    const answers = { [VIDEO_KEY]: { chunks: [{ segment: 1, seq: 0, blob: 'a' }, { segment: 1, seq: 2, blob: 'b' }], pauses: { '1': [[5, 6]] } } }
    expect(videoSegments(answers)).toEqual([{ startedAt: 1, chunks: 2, pauses: [[5, 6]], gap: true }])
  })
})

describe('uploadChunk', () => {
  const info = { startedAt: 5, pauses: [] as [number, number][] }
  const waits: number[] = []
  const wait = async (ms: number) => { waits.push(ms) }
  const reply = (status: number) => new Response(null, { status })

  it('sends a chunk as base64 with its place and pauses', async () => {
    const bodies: Record<string, unknown>[] = []
    expect(await uploadChunk(async (b) => { bodies.push(b as Record<string, unknown>); return reply(200) }, new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' }), 2, info, wait)).toBe(true)
    expect(bodies[0]).toEqual({ action: 'video', segment: 5, seq: 2, pauses: [], contentType: 'video/webm', data: 'AQID' })
  })
  it('tries again after a failed connection and after a server error, waiting longer each time', async () => {
    waits.length = 0
    let calls = 0
    const send = async () => { calls++; if (calls === 1) throw new Error('offline'); return reply(calls === 2 ? 503 : 200) }
    expect(await uploadChunk(send, new Blob(['x']), 0, info, wait)).toBe(true)
    expect(calls).toBe(3)
    expect(waits).toEqual([500, 1000])
  })
  it('gives up after four tries, and at once on a refusal', async () => {
    let calls = 0
    expect(await uploadChunk(async () => { calls++; throw new Error('offline') }, new Blob(['x']), 0, info, wait)).toBe(false)
    expect(calls).toBe(4)
    calls = 0
    expect(await uploadChunk(async () => { calls++; return reply(413) }, new Blob(['x']), 0, info, wait)).toBe(false)
    expect(calls).toBe(1)
  })
})

describe('video in the collector: limits, notes and safety', () => {
  const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
  let code: string
  let studies: Awaited<ReturnType<typeof loadBundle>>
  let store: SqliteStore
  let run: RunRow
  let collect: (request: Request) => Promise<Response>
  beforeAll(async () => { code = (await bundleStudyFile(file)).code; studies = await loadBundle(code, file) })
  beforeEach(async () => {
    store = new SqliteStore(':memory:')
    collect = createCollector({ store: async () => store })
    run = (await store.createRun(newRun('k', { compiled: { ...compileStudy(studies[0], {}), record: 'video' }, hooksBundle: code }))).run
  })
  const post = (token: string, body: unknown) => collect(new Request('http://app.test/api/ui-tests/', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))
  const chunk = (seq: number, extra: Record<string, unknown> = {}) => ({ action: 'video', segment: 1, seq, contentType: 'video/webm', data: 'AQID', ...extra })
  async function active(): Promise<{ attempt: AttemptRow; token: string }> {
    const made = await store.createAttempt({ runId: run.run, participant: 'p', goalIndex: 0, rehearsal: false })
    await post(made.token, { action: 'consent' })
    await post(made.token, { action: 'begin' })
    return made
  }

  it('keeps every reference when chunks arrive together, and the pauses sent with them', async () => {
    const { attempt, token } = await active()
    const replies = await Promise.all([0, 1, 2, 3, 4, 5].map((seq) => post(token, chunk(seq, { pauses: [[100, 200]] }))))
    expect(replies.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200])
    const answers = (await store.getAttempt(attempt.id))!.answers
    expect(videoChunks(answers).map((c) => c.seq).sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(videoSegments(answers)[0]).toMatchObject({ chunks: 6, pauses: [[100, 200]], gap: false })
  })

  it('refuses a chunk past 300 in one attempt, and past the byte total, and a 51st recording', async () => {
    const { attempt, token } = await active()
    const refs = (n: number, size?: number) => Array.from({ length: n }, (_, i) => ({ segment: 1, seq: i, blob: `b${i}`, ...(size && { size }) }))
    await store.updateAttempt(attempt.id, { answers: { [VIDEO_KEY]: { chunks: refs(MAX_VIDEO_CHUNKS - 1, 10) } } })
    expect((await post(token, chunk(MAX_VIDEO_CHUNKS))).status).toBe(200)
    expect((await post(token, chunk(MAX_VIDEO_CHUNKS + 1))).status).toBe(413)
    await store.updateAttempt(attempt.id, { answers: { [VIDEO_KEY]: { chunks: refs(3, MAX_VIDEO_BYTES / 3) } } })
    expect((await post(token, chunk(10))).status).toBe(413)
    await store.updateAttempt(attempt.id, { answers: { [VIDEO_KEY]: { chunks: Array.from({ length: 50 }, (_, i) => ({ segment: i, seq: 0, blob: `s${i}`, size: 1 })) } } })
    expect((await post(token, chunk(0, { segment: 99 }))).status).toBe(413)
    expect((await post(token, chunk(1, { segment: 3 }))).status).toBe(200)
  })

  it('notes a gap and a share ended from the browser on the attempt, once', async () => {
    const { attempt, token } = await active()
    for (const note of ['gap', 'gap', 'stopped']) expect((await post(token, { action: 'video-note', note })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))!.flags).toEqual(['video-gap', 'video-stopped'])
    expect((await post(token, { action: 'video-note', note: 'other' })).status).toBe(400)
  })

  it('takes only a plain video type, with codecs', async () => {
    const { token } = await active()
    expect((await post(token, chunk(0, { contentType: 'video/webm;codecs=vp9,opus' }))).status).toBe(200)
    for (const contentType of ['video/webm<script>', 'video/webm\r\nX: y', 'video/webm; charset=x', 'text/html']) expect((await post(token, chunk(1, { contentType }))).status).toBe(400)
  })

  it('sends video with nosniff', () => {
    expect(videoResponse({ bytes: new Uint8Array([1]), contentType: 'video/webm' }, null).headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})
