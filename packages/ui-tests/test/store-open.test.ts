import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from '@neondatabase/serverless'
import { describe, expect, it, vi } from 'vitest'
import { pgliteClient } from '../src/store/drivers.ts'
import type { SqlClient } from '../src/store/sql.ts'
import { neonClient } from '../src/store/drivers.ts'
import { openStore } from '../src/store/open.ts'
import { PostgresStore } from '../src/store/postgres.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { newRun } from './store-conformance.ts'

describe('openStore', () => {
  it('opens SQLite when no database URL is set', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-tests-open-'))
    const store = await openStore({ UI_TESTS_DATA_DIR: dir })
    expect(store).toBeInstanceOf(SqliteStore)
    await store.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('opens PGlite in memory for pglite:memory', async () => {
    const store = await openStore({ UI_TESTS_DATABASE_URL: 'pglite:memory' })
    expect(store).toBeInstanceOf(PostgresStore)
    expect((await store.createRun(newRun('k1'))).created).toBe(true)
    await store.close()
  })

  it('persists PGlite under pglite:<dir>', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-tests-pglite-'))
    const env = { UI_TESTS_DATABASE_URL: `pglite:${dir}/db` }
    const first = await openStore(env)
    const { run } = await first.createRun(newRun('k1'))
    await first.close()
    const again = await openStore(env)
    expect((await again.getRun(run.run))?.key).toBe('k1')
    await again.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('builds a Neon store for postgres:// without connecting until the first query', async () => {
    const calls: string[] = []
    const fake: SqlClient = {
      query: async (text) => (calls.push(text), { rows: [] }),
      transaction: async () => {
        calls.push('transaction')
        throw new Error('stop')
      },
      close: async () => {
        calls.push('close')
      },
    }
    const urls: string[] = []
    const store = await openStore(
      { UI_TESTS_DATABASE_URL: 'postgres://user:pass@127.0.0.1:1/db' },
      { neonClient: (url) => (urls.push(url), fake), pgliteClient },
    )
    expect(store).toBeInstanceOf(PostgresStore)
    expect(urls).toEqual(['postgres://user:pass@127.0.0.1:1/db'])
    expect(calls).toEqual([])
    await expect(store.listRuns()).rejects.toThrow('stop')
    expect(calls).toEqual(['transaction'])
    await store.close()
  })

  it('real Neon pool is built without connecting, and an idle pool error is logged once, not thrown', async () => {
    const pool = new Pool({ connectionString: 'postgres://user:pass@127.0.0.1:1/db' })
    const client = neonClient('postgres://user:pass@127.0.0.1:1/db', pool)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => pool.emit('error', new Error('terminated'))).not.toThrow()
    pool.emit('error', new Error('again'))
    expect(log).toHaveBeenCalledTimes(1)
    log.mockRestore()
    await client.close()
  })

  it('refuses an unknown URL scheme', async () => {
    await expect(openStore({ UI_TESTS_DATABASE_URL: 'mysql://x' })).rejects.toThrow(/pglite:memory/)
  })
})
