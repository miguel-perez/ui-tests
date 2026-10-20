import { beforeEach, afterEach, describe, expect, it } from 'vitest'
import type { CompiledStudy } from '../src/schema/compiled.ts'
import type { NewRun, RunStore } from '../src/store/types.ts'

const compiled = { id: 'invite', name: 'Invite', goals: [] } as unknown as CompiledStudy

/** A run input with a distinct key. */
export function newRun(key: string, extra: Partial<NewRun> = {}): NewRun {
  return {
    key,
    context: { users: { are: 'managers' }, purpose: 'usability', id: 'invite' },
    build: { url: 'http://localhost:3000', commit: 'abc123' },
    actor: 'human',
    compiled,
    hooksBundle: '// hooks',
    rehearsal: false,
    target: 'http://localhost:3000',
    deadline: '2026-10-21T00:00:00.000Z',
    ...extra,
  }
}

/** The conformance suite every RunStore adapter must pass. `open` returns a fresh, empty store each call. */
export function describeStore(name: string, open: () => Promise<RunStore>) {
  describe(`RunStore: ${name}`, () => {
    let store: RunStore
    beforeEach(async () => {
      store = await open()
    })
    afterEach(async () => {
      await store.close()
    })

    it('creates a run once per key and round-trips it', async () => {
      const first = await store.createRun(newRun('k1'))
      const second = await store.createRun(newRun('k1'))
      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      expect(second.run.run).toBe(first.run.run)
      expect(first.run.run).toMatch(/^r_[0-9A-Z]{26}$/)
      expect(first.run).toMatchObject({ revision: 1, result: 'pending', states: { recruitment: 'open', payment: 'none' } })
      expect(await store.getRun(first.run.run)).toEqual(first.run)
      expect(await store.getRun('r_missing')).toBeUndefined()
      const other = await store.createRun(newRun('k2'))
      expect((await store.listRuns()).map((r) => r.run)).toEqual([first.run.run, other.run.run])
    })

    it('updates a run only at the expected revision and bumps it', async () => {
      const { run } = await store.createRun(newRun('k1'))
      expect(await store.updateRun(run.run, { result: 'none-found', tunnels: { a: 1 } }, 0)).toBe(false)
      expect(await store.updateRun(run.run, { result: 'none-found', tunnels: { a: 1 } }, 1)).toBe(true)
      expect(await store.updateRun(run.run, { result: 'inconclusive' }, 1)).toBe(false)
      expect(await store.getRun(run.run)).toMatchObject({ revision: 2, result: 'none-found', tunnels: { a: 1 }, key: 'k1' })
    })

    it('authorizes the issued token and rejects others', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
      expect(token).toMatch(/^[0-9a-f]{64}$/)
      expect(attempt).toMatchObject({ status: 'created', participant: 'p_1', answers: {}, flags: [], purposes: [] })
      const found = await store.authorize(token)
      expect(found?.attempt.id).toBe(attempt.id)
      expect(found?.run.run).toBe(run.run)
      expect(await store.authorize('0'.repeat(64))).toBeUndefined()
      expect(await store.authorize('')).toBeUndefined()
    })

    it('revokes an attempt\'s tokens without touching the others', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const a = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
      const b = await store.createAttempt({ runId: run.run, participant: 'p_2', goalIndex: 0, rehearsal: false })
      await store.revokeTokens(a.attempt.id)
      expect(await store.authorize(a.token)).toBeUndefined()
      expect((await store.authorize(b.token))?.attempt.id).toBe(b.attempt.id)
      expect(await store.getAttempt(a.attempt.id)).toBeDefined()
    })

    it('updates attempts, honouring the expected status', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: true })
      expect(await store.updateAttempt(attempt.id, { status: 'active' }, 'consented')).toBe(false)
      expect(await store.updateAttempt(attempt.id, { status: 'active' }, 'created')).toBe(true)
      expect(await store.updateAttempt(attempt.id, { status: 'finished', reason: 'done', answers: { q: 5 }, verification: { status: 'correct', steps: [] } })).toBe(true)
      expect(await store.getAttempt(attempt.id)).toMatchObject({ status: 'finished', reason: 'done', answers: { q: 5 }, verification: { status: 'correct', steps: [] }, rehearsal: true })
      expect(await store.updateAttempt('a_missing', { status: 'active' })).toBe(false)
      await store.createAttempt({ runId: run.run, participant: 'p_2', goalIndex: 1, rehearsal: false })
      expect((await store.listAttempts(run.run)).map((a) => a.participant)).toEqual(['p_1', 'p_2'])
    })

    it('returns events in insertion order across batches', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
      await store.appendEvents(attempt.id, [{ type: 'click', at: 3, url: '/' }, { type: 'url', at: 1, url: '/a' }])
      await store.appendEvents(attempt.id, [{ type: 'pause', at: 2, url: '/a', duration: 5000 }])
      expect((await store.listEvents(attempt.id)).map((e) => e.type)).toEqual(['click', 'url', 'pause'])
    })

    it('stores an event once when the same sequence number is appended twice', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
      await store.appendEvents(attempt.id, [{ type: 'click', at: 1, url: '/', seq: 1 }, { type: 'click', at: 2, url: '/', seq: 2 }])
      await store.appendEvents(attempt.id, [{ type: 'click', at: 2, url: '/', seq: 2 }, { type: 'click', at: 3, url: '/', seq: 3 }])
      expect((await store.listEvents(attempt.id)).map((e) => e.seq)).toEqual([1, 2, 3])
    })

    it('stores and replaces snapshots by key', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const { attempt } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
      expect(await store.getSnapshot(attempt.id, 'end')).toBeUndefined()
      await store.putSnapshot(attempt.id, 'end', { url: '/', dom: '<p>1</p>' })
      await store.putSnapshot(attempt.id, 'end', { url: '/', dom: '<p>2</p>', truncated: true })
      await store.putSnapshot(attempt.id, 'step-1', { url: '/s', dom: '', state: { a: 1 } })
      expect(await store.getSnapshot(attempt.id, 'end')).toEqual({ url: '/', dom: '<p>2</p>', truncated: true })
      expect(await store.getSnapshot(attempt.id, 'step-1')).toEqual({ url: '/s', dom: '', state: { a: 1 } })
    })

    it('stores blobs and deletes them by attempt and by age', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const a = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
      const b = await store.createAttempt({ runId: run.run, participant: 'p_2', goalIndex: 0, rehearsal: false })
      const bytes = new Uint8Array([0, 1, 2, 255])
      const id1 = await store.putBlob(a.attempt.id, 'video', bytes, 'video/webm')
      const id2 = await store.putBlob(a.attempt.id, 'video', bytes, 'video/webm')
      const id3 = await store.putBlob(b.attempt.id, 'video', bytes, 'video/webm')
      expect(await store.getBlob(id1)).toEqual({ bytes, contentType: 'video/webm' })
      expect(await store.deleteBlobs(a.attempt.id)).toBe(2)
      expect(await store.getBlob(id1)).toBeUndefined()
      expect(await store.getBlob(id2)).toBeUndefined()
      expect(await store.getBlob(id3)).toBeDefined()
      expect(await store.deleteBlobsBefore(new Date(Date.now() - 60_000))).toBe(0)
      expect(await store.deleteBlobsBefore(new Date(Date.now() + 60_000))).toBe(1)
      expect(await store.getBlob(id3)).toBeUndefined()
    })

    it('deletes the events and snapshots of one attempt only', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const a = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
      const b = await store.createAttempt({ runId: run.run, participant: 'p_2', goalIndex: 0, rehearsal: false })
      const event = { type: 'click' as const, at: 1, url: '/' }
      await store.appendEvents(a.attempt.id, [event, event])
      await store.appendEvents(b.attempt.id, [event])
      await store.putSnapshot(a.attempt.id, 'end', { url: '/', dom: '<p/>' })
      await store.putSnapshot(a.attempt.id, 'step-0', { url: '/', dom: '<p/>' })
      await store.putSnapshot(b.attempt.id, 'end', { url: '/', dom: '<p/>' })
      expect(await store.deleteEvents(a.attempt.id)).toBe(2)
      expect(await store.deleteSnapshots(a.attempt.id)).toBe(2)
      expect(await store.listEvents(a.attempt.id)).toEqual([])
      expect(await store.getSnapshot(a.attempt.id, 'end')).toBeUndefined()
      expect(await store.listEvents(b.attempt.id)).toHaveLength(1)
      expect(await store.getSnapshot(b.attempt.id, 'end')).toBeDefined()
    })

    it('keeps revisions in order and numbers them from one', async () => {
      const { run } = await store.createRun(newRun('k1'))
      expect(await store.addRevision(run.run, { at: '2026-10-19T00:00:00.000Z', note: 'one' })).toBe(1)
      expect(await store.addRevision(run.run, { at: '2026-10-19T00:01:00.000Z', note: 'two' })).toBe(2)
      expect((await store.listRevisions(run.run)).map((r) => r.note)).toEqual(['one', 'two'])
    })

    it('reserves up to the cap and refuses beyond it', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const cap = { minor: 1000, currency: 'USD' }
      expect(await store.reserve(run.run, { minor: 600, currency: 'USD' }, cap)).toBe(true)
      expect(await store.reserve(run.run, { minor: 500, currency: 'USD' }, cap)).toBe(false)
      expect(await store.reserve(run.run, { minor: 400, currency: 'USD' }, cap)).toBe(true)
      expect(await store.reserve(run.run, { minor: 1, currency: 'USD' }, cap)).toBe(false)
      expect(await store.reserve(run.run, { minor: 1, currency: 'EUR' }, cap)).toBe(false)
    })

    it('admits exactly one of two concurrent reserves that together exceed the cap', async () => {
      const { run } = await store.createRun(newRun('k1'))
      const cap = { minor: 1000, currency: 'USD' }
      const results = await Promise.all([
        store.reserve(run.run, { minor: 600, currency: 'USD' }, cap),
        store.reserve(run.run, { minor: 600, currency: 'USD' }, cap),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
    })

    it('rolls back everything when a transaction throws, and commits otherwise', async () => {
      await expect(
        store.transaction(async (tx) => {
          await tx.createRun(newRun('rolled'))
          await tx.reserve('x', { minor: 1, currency: 'USD' }, { minor: 5, currency: 'USD' }).catch(() => false)
          throw new Error('boom')
        }),
      ).rejects.toThrow('boom')
      expect(await store.listRuns()).toEqual([])
      const made = await store.transaction(async (tx) => (await tx.createRun(newRun('kept'))).run.run)
      expect((await store.getRun(made))?.key).toBe('kept')
    })

    it('does not let outside calls join an open transaction', async () => {
      let release!: () => void
      const hold = new Promise<void>((resolve) => (release = resolve))
      const tx = store.transaction(async (inner) => {
        await inner.createRun(newRun('inside'))
        await hold
        throw new Error('abort')
      })
      const outside = store.listRuns()
      release()
      await expect(tx).rejects.toThrow('abort')
      expect(await outside).toEqual([])
    })
  })
}
