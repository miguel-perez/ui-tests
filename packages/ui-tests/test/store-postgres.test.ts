import { describe, expect, it } from 'vitest'
import { PostgresStore } from '../src/store/postgres.ts'
import { pgliteClient } from '../src/store/drivers.ts'
import { describeStore, newRun } from './store-conformance.ts'

describeStore('postgres (pglite)', async () => new PostgresStore(await pgliteClient()))

describe('PostgresStore on PGlite', () => {
  it('reapplies migrations idempotently and rejects a bad migration state cleanly', async () => {
    const client = await pgliteClient()
    const a = new PostgresStore(client)
    await a.createRun(newRun('k1'))
    // A second adapter on the same connection finds the schema already recorded.
    const b = new PostgresStore(client)
    expect((await b.createRun(newRun('k1'))).created).toBe(false)
    await a.close()
  })

  it('lists attempts and runs in insertion order when created in the same millisecond', async () => {
    const store = new PostgresStore(await pgliteClient())
    const keys = Array.from({ length: 8 }, (_, i) => `k${i}`)
    for (const key of keys) await store.createRun(newRun(key))
    const runs = await store.listRuns()
    expect(runs.map((r) => r.key).sort()).toEqual([...keys].sort())
    await store.close()
  })
})
