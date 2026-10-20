import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { compileStudy } from '../src/compile.ts'
import { recordingMultiplier } from '../src/derive/incentive.ts'
import { bundleStudyFile, loadBundle } from '../src/load.ts'
import { assembleVideo, videoResponse } from '../src/report/video.ts'
import { createCollector } from '../src/server/collector.ts'
import { applyRetention } from '../src/store/retention.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import type { AttemptRow, RunRow } from '../src/store/types.ts'
import { clipAt, videoChunks, videoSegments } from '../src/video.ts'
import { newRun } from './store-conformance.ts'

const file = join(import.meta.dirname, 'fixtures', 'verify.ui.test.ts')
const origin = 'http://app.test'
const DAY = 86_400_000
let code: string
let studies: Awaited<ReturnType<typeof loadBundle>>
let store: SqliteStore
let run: RunRow
let clock: number
let collect: (request: Request) => Promise<Response>

beforeAll(async () => {
  code = (await bundleStudyFile(file)).code
  studies = await loadBundle(code, file)
})
beforeEach(async () => {
  clock = Date.now()
  store = new SqliteStore(':memory:')
  collect = createCollector({ store: async () => store, now: () => clock })
  run = (await store.createRun(newRun('k', { compiled: { ...compileStudy(studies[0], {}), record: 'video' }, hooksBundle: code }))).run
})

const post = (token: string, body: unknown) =>
  collect(new Request(`${origin}/api/ui-tests/`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }))
const chunk = (segment: number, seq: number, bytes = [1, 2, 3]) => ({ action: 'video', segment, seq, contentType: 'video/webm', data: Buffer.from(bytes).toString('base64') })

async function active(): Promise<{ attempt: AttemptRow; token: string }> {
  const made = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
  expect((await post(made.token, { action: 'consent' })).status).toBe(200)
  expect((await post(made.token, { action: 'begin' })).status).toBe(200)
  return made
}

describe('retention', () => {
  it('deletes blobs older than 90 days and keeps newer ones', async () => {
    const { attempt } = await active()
    const old = await store.putBlob(attempt.id, 'video', new Uint8Array([1]), 'video/webm')
    expect(await applyRetention(store, new Date(clock + 89 * DAY))).toBe(0)
    expect(await store.getBlob(old)).toBeDefined()
    expect(await applyRetention(store, new Date(clock + 91 * DAY))).toBe(1)
    expect(await store.getBlob(old)).toBeUndefined()
  })

  it('expires the events, snapshots and video of an attempt that ended before the cutoff, and only those, and is idempotent', async () => {
    const { attempt, token } = await active()
    await store.appendEvents(attempt.id, [{ type: 'rrweb', at: clock, url: '/', data: { type: 2 } }, { type: 'click', at: clock, url: '/' }])
    expect((await post(token, chunk(clock, 0))).status).toBe(200)
    expect((await post(token, { action: 'end', reason: 'done', snapshot: { url: `${origin}/done`, dom: '<html></html>' } })).status).toBe(200)
    const recent = new Date(clock + 89 * DAY)
    expect(await applyRetention(store, recent)).toBe(0)
    expect(await store.listEvents(attempt.id)).toHaveLength(2)
    expect(await store.getSnapshot(attempt.id, 'end')).toBeDefined()

    const later = new Date(clock + 91 * DAY)
    // events 2, snapshot 1, blob 1 (deleted once, with the attempt's blobs), the reference to the video 1
    expect(await applyRetention(store, later)).toBe(5)
    expect(await store.listEvents(attempt.id)).toEqual([])
    expect(await store.getSnapshot(attempt.id, 'end')).toBeUndefined()
    expect(videoChunks((await store.getAttempt(attempt.id))!.answers)).toEqual([])
    // What the person said and the verdict are not the recording: the attempt itself stays.
    expect((await store.getAttempt(attempt.id))?.reason).toBe('done')
    expect(await applyRetention(store, later)).toBe(0)
  })

  it('honours a shorter window', async () => {
    const { attempt, token } = await active()
    await store.appendEvents(attempt.id, [{ type: 'click', at: clock, url: '/' }])
    await post(token, { action: 'end', reason: 'done', snapshot: { url: `${origin}/done`, dom: '' } })
    expect(await applyRetention(store, new Date(clock + 8 * DAY), 7)).toBeGreaterThan(0)
    expect(await store.listEvents(attempt.id)).toEqual([])
  })
})

describe('video chunks in the collector', () => {
  it('stores a chunk once, keeps the order, and joins one recording', async () => {
    const { attempt, token } = await active()
    expect((await post(token, chunk(1000, 1, [4, 5]))).status).toBe(200)
    expect((await post(token, chunk(1000, 0, [1, 2, 3]))).status).toBe(200)
    expect((await post(token, chunk(1000, 0, [1, 2, 3]))).status).toBe(200)
    expect((await post(token, chunk(9000, 0, [9]))).status).toBe(200)
    const stored = (await store.getAttempt(attempt.id))!
    expect(videoChunks(stored.answers)).toHaveLength(3)
    expect(videoSegments(stored.answers)).toEqual([{ startedAt: 1000, chunks: 2 }, { startedAt: 9000, chunks: 1 }])
    expect(Array.from((await assembleVideo(store, stored))!.bytes)).toEqual([1, 2, 3, 4, 5])
    expect(Array.from((await assembleVideo(store, stored, 9000))!.bytes)).toEqual([9])
    expect(clipAt(videoSegments(stored.answers), 4500)).toEqual({ segment: 1000, seconds: 3.5 })
    expect(clipAt(videoSegments(stored.answers), 500)).toBeUndefined()
  })

  it('takes a chunk of 5 MB and refuses more, with its own limit', async () => {
    const { token } = await active()
    const five = new Uint8Array(5 * 1024 * 1024)
    expect((await post(token, chunk(1, 0, five as unknown as number[]))).status).toBe(200)
    expect((await post(token, { ...chunk(1, 1), data: Buffer.from(new Uint8Array(5 * 1024 * 1024 + 1)).toString('base64') })).status).toBe(413)
    // The same size is refused for the other actions: the limit is the chunk's own.
    expect((await post(token, { action: 'events', events: [], pad: 'x'.repeat(3_000_000) })).status).toBe(413)
  })

  it('refuses video for a study that does not record the screen', async () => {
    const plain = (await store.createRun(newRun('plain', { compiled: { ...compileStudy(studies[0], {}), record: 'events' }, hooksBundle: code }))).run
    const made = await store.createAttempt({ runId: plain.run, participant: 'p_2', goalIndex: 0, rehearsal: false })
    await post(made.token, { action: 'consent' })
    await post(made.token, { action: 'begin' })
    expect((await post(made.token, chunk(1, 0))).status).toBe(409)
    expect((await post(made.token, { action: 'video-declined' })).status).toBe(409)
  })

  it('keeps an attempt that declined, marked, and under way', async () => {
    const { attempt, token } = await active()
    expect((await post(token, { action: 'video-declined' })).status).toBe(200)
    expect((await post(token, { action: 'video-declined' })).status).toBe(200)
    const kept = (await store.getAttempt(attempt.id))!
    expect(kept.flags).toEqual(['video-declined'])
    expect(kept.status).toBe('active')
    expect((await post(token, { action: 'events', events: [] })).status).toBe(200)
    expect((await post(token, { action: 'end', reason: 'done', snapshot: { url: `${origin}/done`, dom: '' } })).status).toBe(200)
    expect((await store.getAttempt(attempt.id))?.reason).toBe('done')
  })

  it('deletes the video when the person withdraws, and takes no more', async () => {
    const { attempt, token } = await active()
    await post(token, chunk(1, 0))
    const blob = videoChunks((await store.getAttempt(attempt.id))!.answers)[0]!.blob
    expect(await store.getBlob(blob)).toBeDefined()
    expect((await post(token, { action: 'withdraw' })).status).toBe(200)
    expect(await store.getBlob(blob)).toBeUndefined()
    expect(videoChunks((await store.getAttempt(attempt.id))!.answers)).toEqual([])
    expect((await post(token, chunk(1, 1))).status).toBe(409)
  })
})

describe('video helpers', () => {
  it('pays 1.5 times for the screen and 1 for events alone', () => {
    expect(recordingMultiplier('video')).toBe(1.5)
    expect(recordingMultiplier('events')).toBe(1)
  })

  it('answers a range request with the bytes asked for', async () => {
    const video = { bytes: new Uint8Array([0, 1, 2, 3, 4, 5]), contentType: 'video/webm' }
    const part = videoResponse(video, 'bytes=2-3')
    expect(part.status).toBe(206)
    expect(part.headers.get('Content-Range')).toBe('bytes 2-3/6')
    expect(Array.from(new Uint8Array(await part.arrayBuffer()))).toEqual([2, 3])
    expect(videoResponse(video, 'bytes=-2').headers.get('Content-Range')).toBe('bytes 4-5/6')
    expect(videoResponse(video, 'bytes=9-').status).toBe(416)
    expect(videoResponse(video, null).status).toBe(200)
  })
})
