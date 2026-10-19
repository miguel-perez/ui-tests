import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { newId, newRunId, newToken } from '../src/ids.ts'
import { dataDirectory, openStore } from '../src/store/open.ts'
import { SqliteStore } from '../src/store/sqlite.ts'
import { describeStore, newRun } from './store-conformance.ts'

const dirs: string[] = []
const tempFile = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ui-tests-store-'))
  dirs.push(dir)
  return path.join(dir, 'nested', 'dev.sqlite')
}
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })))

describeStore('sqlite :memory:', async () => new SqliteStore(':memory:'))
describeStore('sqlite file', async () => new SqliteStore(tempFile()))

describe('SqliteStore on one file opened twice', () => {
  it('shares runs, tokens and reservations between connections', async () => {
    const file = tempFile()
    const cli = new SqliteStore(file)
    const app = new SqliteStore(file)
    const { run } = await cli.createRun(newRun('k1'))
    expect((await app.createRun(newRun('k1'))).created).toBe(false)
    const { token } = await app.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
    expect((await cli.authorize(token))?.run.run).toBe(run.run)
    const cap = { minor: 1000, currency: 'USD' }
    const results = await Promise.all([cli.reserve(run.run, { minor: 600, currency: 'USD' }, cap), app.reserve(run.run, { minor: 600, currency: 'USD' }, cap)])
    expect(results.filter(Boolean)).toHaveLength(1)
    await cli.close()
    await app.close()
  })
})

describe('ids and opening', () => {
  it('makes prefixed ULIDs and 64-hex tokens', () => {
    expect(newRunId()).toMatch(/^r_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(newId('a')).toMatch(/^a_[0-9A-Z]{26}$/)
    expect(newToken()).toMatch(/^[0-9a-f]{64}$/)
    expect(newToken()).not.toBe(newToken())
  })

  it('opens SQLite at dev.sqlite in the data directory, and refuses a database URL until Postgres ships', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-tests-open-'))
    dirs.push(dir)
    const env = { UI_TESTS_DATA_DIR: dir }
    expect(dataDirectory(env)).toBe(dir)
    const store = await openStore(env)
    const { run } = await store.createRun(newRun('k1'))
    await store.close()
    const again = await openStore(env)
    expect((await again.getRun(run.run))?.key).toBe('k1')
    await again.close()
    await expect(openStore({ UI_TESTS_DATABASE_URL: 'postgres://x' })).rejects.toThrow(/Postgres/)
  })
})
