import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { main } from '../src/cli/main.ts'
import { newId, newRunId, newToken } from '../src/ids.ts'
import { dataDirectory, openStore } from '../src/store/open.ts'
import { sqliteMigrations } from '../src/store/migrations.ts'
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

describe('SqliteStore across connections', () => {
  it('stays usable after BEGIN fails because another connection holds the write lock', async () => {
    const file = tempFile()
    const store = new SqliteStore(file, undefined, 0)
    const other = new DatabaseSync(file)
    other.exec('BEGIN IMMEDIATE')
    await expect(store.transaction(async (tx) => tx.listRuns())).rejects.toThrow(/locked|busy/i)
    other.exec('ROLLBACK')
    other.close()
    expect(await store.transaction(async (tx) => (await tx.createRun(newRun('k1'))).created)).toBe(true)
    expect(await store.listRuns()).toHaveLength(1)
    await store.close()
  })

  it('answers created: false, never a unique-key error, when two connections race one key', async () => {
    const file = tempFile()
    const stores = [new SqliteStore(file), new SqliteStore(file), new SqliteStore(file)]
    const results = await Promise.all(stores.flatMap((s) => [s.createRun(newRun('same')), s.createRun(newRun('same'))]))
    expect(results.filter((r) => r.created)).toHaveLength(1)
    expect(new Set(results.map((r) => r.run.run)).size).toBe(1)
    await Promise.all(stores.map((s) => s.close()))
  })

  it('keeps patches from two connections to different attempt fields', async () => {
    const file = tempFile()
    const a = new SqliteStore(file)
    const b = new SqliteStore(file)
    const { run } = await a.createRun(newRun('k1'))
    const { attempt } = await a.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
    await Promise.all([
      ...Array.from({ length: 20 }, (_, i) => a.updateAttempt(attempt.id, { answers: { ...{}, q: i } })),
      b.updateAttempt(attempt.id, { flags: ['dead click'] }),
      a.updateAttempt(attempt.id, { startedAt: '2026-10-19T00:00:00.000Z' }),
      b.updateAttempt(attempt.id, { purposes: ['usability'] }),
    ])
    expect(await a.getAttempt(attempt.id)).toMatchObject({ flags: ['dead click'], startedAt: '2026-10-19T00:00:00.000Z', purposes: ['usability'] })
    await a.close()
    await b.close()
  })

  it('does not let explicit undefined in a new run wipe the defaults', async () => {
    const store = new SqliteStore(':memory:')
    const { run } = await store.createRun(newRun('k1', { states: undefined, result: undefined, deadline: undefined }))
    expect(run.result).toBe('pending')
    expect(run.states.recruitment).toBe('open')
    expect(run.deadline).toBeTruthy()
    await store.close()
  })
})

describe('SqliteStore migrations', () => {
  it('opens a file at migration 2 and keeps its tokens authorising', async () => {
    const file = tempFile()
    const store = new SqliteStore(file)
    const { run } = await store.createRun(newRun('k1'))
    const { attempt, token } = await store.createAttempt({ runId: run.run, participant: 'p_1', goalIndex: 0, rehearsal: false })
    await store.close()
    // Take the file back to migration 2: tokens without kind or expires_at.
    const db = new DatabaseSync(file)
    db.exec('ALTER TABLE tokens DROP COLUMN kind; ALTER TABLE tokens DROP COLUMN expires_at; PRAGMA user_version = 2')
    db.close()
    expect(sqliteMigrations).toHaveLength(3)
    const reopened = new SqliteStore(file)
    expect((await reopened.authorize(token))?.attempt.id).toBe(attempt.id)
    await reopened.close()
  })
})

/** Writes a database the way the store before schema versioning did: five tables, WAL, `user_version` left at 0, one run. */
const legacyDatabase = (file: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  const db = new DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(`CREATE TABLE runs (id TEXT PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE attempts (run_id TEXT PRIMARY KEY REFERENCES runs(id), rehearsal INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL);
    CREATE TABLE events (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
    CREATE TABLE snapshots (run_id TEXT PRIMARY KEY REFERENCES runs(id), url TEXT NOT NULL, dom TEXT NOT NULL);
    CREATE TABLE recordings (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), mime TEXT NOT NULL, audio BLOB NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX recordings_run ON recordings(run_id);
    CREATE INDEX recordings_created ON recordings(created_at);`)
  db.prepare('INSERT INTO runs VALUES (?, ?, ?)').run('old-run', 'old-token', '{"status":"finished"}')
  db.close()
}
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex')

describe('SqliteStore on a database from before schema versioning', () => {
  it('refuses to open it, names the file and leaves it unchanged', () => {
    const file = tempFile()
    legacyDatabase(file)
    const before = digest(file)
    expect(() => new SqliteStore(file)).toThrow(`${file} predates schema versioning`)
    expect(() => new SqliteStore(file)).toThrow(/move it aside/)
    expect(digest(file)).toBe(before)
    expect(readdirSync(path.dirname(file))).toEqual(['dev.sqlite'])
    const db = new DatabaseSync(file, { readOnly: true })
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 })
    expect(db.prepare('SELECT id FROM runs').all()).toEqual([{ id: 'old-run' }])
    db.close()
  })

  it('leaves a WAL retained by an unclean shutdown unchanged', () => {
    const live = tempFile()
    legacyDatabase(live)
    const writer = new DatabaseSync(live)
    writer.exec('PRAGMA wal_autocheckpoint = 0')
    writer.prepare('INSERT INTO runs VALUES (?, ?, ?)').run('wal-run', 'wal-token', '{"status":"finished"}')
    const file = tempFile()
    mkdirSync(path.dirname(file), { recursive: true })
    for (const suffix of ['', '-wal', '-shm']) copyFileSync(live + suffix, file + suffix)
    writer.close()
    const before = digest(file)
    const wal = digest(`${file}-wal`)
    expect(() => new SqliteStore(file)).toThrow(`${file} predates schema versioning`)
    expect(digest(file)).toBe(before)
    expect(digest(`${file}-wal`)).toBe(wal)
  })

  it('makes a command exit 2 with that message instead of "table runs already exists"', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ui-tests-legacy-'))
    dirs.push(dir)
    const file = path.join(dir, 'dev.sqlite')
    legacyDatabase(file)
    const before = digest(file)
    let stderr = ''
    const io = { stdout: { write: () => true }, stderr: { write: (text: string) => (stderr += text) }, cwd: dir, env: { UI_TESTS_DATA_DIR: dir } }
    expect(await main(['status', 'r_missing'], io)).toBe(2)
    expect(stderr).toContain(`${file} predates schema versioning`)
    expect(stderr).toContain('move it aside')
    expect(stderr).not.toContain('already exists')
    expect(digest(file)).toBe(before)
    expect(existsSync(file)).toBe(true)
  })
})

describe('ids and opening', () => {
  it('makes prefixed ULIDs and 64-hex tokens', () => {
    expect(newRunId()).toMatch(/^r_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(newId('a')).toMatch(/^a_[0-9A-Z]{26}$/)
    expect(newToken()).toMatch(/^[0-9a-f]{64}$/)
    expect(newToken()).not.toBe(newToken())
  })

  it('opens SQLite at dev.sqlite in the data directory', async () => {
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
  })
})
