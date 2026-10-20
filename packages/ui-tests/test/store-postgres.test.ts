import { describe, expect, it } from 'vitest'
import { PostgresStore } from '../src/store/postgres.ts'
import { pgliteClient } from '../src/store/drivers.ts'
import type { SqlClient } from '../src/store/sql.ts'
import { describeStore, newRun } from './store-conformance.ts'

describeStore('postgres (pglite)', async () => new PostgresStore(await pgliteClient()))

describe('PostgresStore on PGlite', () => {
  it('shares migrations between two adapters on one connection', async () => {
    const client = await pgliteClient()
    const a = new PostgresStore(client)
    await a.createRun(newRun('k1'))
    const b = new PostgresStore(client)
    expect((await b.createRun(newRun('k1'))).created).toBe(false)
    await a.close()
  })

  it('lists runs and attempts in creation order', async () => {
    const store = new PostgresStore(await pgliteClient())
    const keys = Array.from({ length: 8 }, (_, i) => `k${i}`)
    for (const key of keys) await store.createRun(newRun(key))
    expect((await store.listRuns()).map((r) => r.key)).toEqual(keys)
    const { run } = await store.createRun(newRun('with-attempts'))
    const made: string[] = []
    for (let i = 0; i < 8; i++) made.push((await store.createAttempt({ runId: run.run, participant: `p_${i}`, goalIndex: i, rehearsal: false })).attempt.id)
    expect((await store.listAttempts(run.run)).map((a) => a.id)).toEqual(made)
    await store.close()
  })

  it('numbers concurrent revisions distinctly', async () => {
    const store = new PostgresStore(await pgliteClient())
    const { run } = await store.createRun(newRun('k1'))
    const numbers = await Promise.all([1, 2, 3, 4].map((i) => store.addRevision(run.run, { at: `t${i}` })))
    expect([...numbers].sort()).toEqual([1, 2, 3, 4])
    await store.close()
  })

  it('retries a failed migration on the next call, in or out of a transaction', async () => {
    const real = await pgliteClient()
    let failures = 1
    const flaky: SqlClient = { ...real, transaction: (fn) => (failures-- > 0 ? Promise.reject(new Error('cold start')) : real.transaction(fn)) }
    const store = new PostgresStore(flaky)
    await expect(store.listRuns()).rejects.toThrow('cold start')
    expect(await store.listRuns()).toEqual([])

    failures = 0
    const second = new PostgresStore({ ...real, transaction: (fn) => (failures++ === 0 ? Promise.reject(new Error('again')) : real.transaction(fn)) })
    await expect(second.transaction(async (tx) => tx.listRuns())).rejects.toThrow('again')
    expect(await second.transaction(async (tx) => tx.listRuns())).toEqual([])
    await store.close()
  })
})
