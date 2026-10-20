import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { newId, newRunId, newToken } from '../ids.ts'
import { sqliteMigrations } from './migrations.ts'
import type {
  AttemptRow, AttemptStatus, Money, NewAttempt, NewRun, RecordedEvent, Revision, RunRow, RunStore, Snapshot, SnapshotKey,
} from './types.ts'

type Row = Record<string, unknown>
/** State shared by a store and its transaction view: the connection and the queue of open transactions. */
type Shared = { db: DatabaseSync; gate: Promise<void> }

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const defaultDeadlineMs = 48 * 60 * 60 * 1000

/** Development store: every table in one SQLite file (WAL, foreign keys), wrapping the synchronous driver in promises. */
export class SqliteStore implements RunStore {
  private readonly shared: Shared
  private readonly inTransaction: boolean

  /** Opens or creates the database and applies pending migrations; `:memory:` skips directory creation. */
  constructor(filename: string, shared?: Shared, busyTimeoutMs = 5000) {
    this.inTransaction = shared !== undefined
    if (shared) {
      this.shared = shared
      return
    }
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
    const db = new DatabaseSync(filename)
    db.exec(`PRAGMA busy_timeout = ${Math.floor(busyTimeoutMs)}`)
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    this.migrate(db)
    this.shared = { db, gate: Promise.resolve() }
  }

  /** Applies migrations not yet recorded in `user_version`, each in its own immediate transaction. */
  private migrate(db: DatabaseSync) {
    for (let i = 0; i < sqliteMigrations.length; i++) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
        if (current <= i) {
          db.exec(sqliteMigrations[i]!)
          db.exec(`PRAGMA user_version = ${i + 1}`)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }

  private get db() {
    return this.shared.db
  }

  /** Runs a synchronous body once any open transaction has finished (a transaction's own view runs at once). */
  private async op<T>(body: () => T): Promise<T> {
    if (!this.inTransaction) await this.shared.gate
    return body()
  }

  /** Runs a synchronous body as one atomic unit: inside a transaction it just runs; otherwise it takes the write lock first, so a read-modify-write cannot interleave with another connection. */
  private atomic<T>(body: () => T): T {
    if (this.inTransaction) return body()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = body()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private one(sql: string, ...params: (string | number)[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined
  }

  private all(sql: string, ...params: (string | number)[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[]
  }

  private run(sql: string, ...params: (string | number | null | Uint8Array)[]) {
    return this.db.prepare(sql).run(...params)
  }

  private runRow(row: Row | undefined): RunRow | undefined {
    return row ? (JSON.parse(row.data as string) as RunRow) : undefined
  }

  private attemptRow(row: Row | undefined): AttemptRow | undefined {
    return row ? (JSON.parse(row.data as string) as AttemptRow) : undefined
  }

  createRun(input: NewRun) {
    return this.op(() => {
      const now = new Date()
      const defined = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as NewRun
      const run: RunRow = {
        states: { recruitment: 'open', collection: 'waiting', verification: 'pending', payment: 'none' },
        result: 'pending',
        ...defined,
        deadline: input.deadline ?? new Date(now.getTime() + defaultDeadlineMs).toISOString(),
        run: newRunId(),
        revision: 1,
        createdAt: now.toISOString(),
      }
      const inserted = this.run('INSERT INTO runs (id, key, revision, created_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING', run.run, run.key, run.revision, run.createdAt, JSON.stringify(run))
      if (Number(inserted.changes) > 0) return { run, created: true }
      return { run: this.runRow(this.one('SELECT data FROM runs WHERE key = ?', input.key))!, created: false }
    })
  }

  getRun(id: string) {
    return this.op(() => this.runRow(this.one('SELECT data FROM runs WHERE id = ?', id)))
  }

  listRuns() {
    return this.op(() => this.all('SELECT data FROM runs ORDER BY created_at, rowid').map((row) => this.runRow(row)!))
  }

  updateRun(id: string, patch: Partial<RunRow>, expectedRevision: number) {
    return this.op(() => this.atomic(() => {
      const current = this.runRow(this.one('SELECT data FROM runs WHERE id = ?', id))
      if (!current || current.revision !== expectedRevision) return false
      const next: RunRow = { ...current, ...patch, run: current.run, key: current.key, createdAt: current.createdAt, revision: expectedRevision + 1 }
      const result = this.run('UPDATE runs SET data = ?, revision = ? WHERE id = ? AND revision = ?', JSON.stringify(next), next.revision, id, expectedRevision)
      return Number(result.changes) === 1
    }))
  }

  createAttempt(input: NewAttempt) {
    return this.op(() => {
      const attempt: AttemptRow = {
        id: newId('a'),
        runId: input.runId,
        participant: input.participant,
        goalIndex: input.goalIndex,
        status: 'created',
        setupValues: input.setupValues ?? {},
        answers: {},
        rehearsal: input.rehearsal,
        purposes: input.purposes ?? [],
        ...(input.environment ? { environment: input.environment } : {}),
        flags: [],
      }
      const token = newToken()
      this.db.exec('SAVEPOINT create_attempt')
      try {
        this.run('INSERT OR IGNORE INTO participants (id, created_at) VALUES (?, ?)', attempt.participant, new Date().toISOString())
        this.run('INSERT INTO attempts (id, run_id, participant_id, status, data) VALUES (?, ?, ?, ?, ?)', attempt.id, attempt.runId, attempt.participant, attempt.status, JSON.stringify(attempt))
        this.run('INSERT INTO tokens (hash, attempt_id, run_id) VALUES (?, ?, ?)', hashToken(token), attempt.id, attempt.runId)
        this.db.exec('RELEASE create_attempt')
      } catch (error) {
        this.db.exec('ROLLBACK TO create_attempt')
        this.db.exec('RELEASE create_attempt')
        throw error
      }
      return { attempt, token }
    })
  }

  revokeTokens(attemptId: string) {
    return this.op(() => { this.run('DELETE FROM tokens WHERE attempt_id = ?', attemptId) })
  }

  authorize(token: string) {
    return this.op(() => {
      const hash = hashToken(token)
      // Only the sha256 of a token is stored and looked up through the primary-key index. The presented token is never
      // compared byte by byte, so there is no secret-dependent comparison for timing to reveal.
      const row = this.one('SELECT attempt_id, run_id FROM tokens WHERE hash = ?', hash)
      if (!row) return undefined
      const attempt = this.attemptRow(this.one('SELECT data FROM attempts WHERE id = ?', row.attempt_id as string))
      const run = this.runRow(this.one('SELECT data FROM runs WHERE id = ?', row.run_id as string))
      return attempt && run ? { run, attempt } : undefined
    })
  }

  getAttempt(id: string) {
    return this.op(() => this.attemptRow(this.one('SELECT data FROM attempts WHERE id = ?', id)))
  }

  listAttempts(runId: string) {
    return this.op(() => this.all('SELECT data FROM attempts WHERE run_id = ? ORDER BY rowid', runId).map((row) => this.attemptRow(row)!))
  }

  updateAttempt(id: string, patch: Partial<AttemptRow>, expectedStatus?: AttemptStatus) {
    return this.op(() => this.atomic(() => {
      const current = this.attemptRow(this.one('SELECT data FROM attempts WHERE id = ?', id))
      if (!current || (expectedStatus !== undefined && current.status !== expectedStatus)) return false
      const next: AttemptRow = { ...current, ...patch, id: current.id, runId: current.runId, participant: current.participant }
      const result = this.run('UPDATE attempts SET data = ?, status = ? WHERE id = ? AND status = ?', JSON.stringify(next), next.status, id, current.status)
      return Number(result.changes) === 1
    }))
  }

  appendEvents(attemptId: string, events: RecordedEvent[]) {
    return this.op(() => {
      this.db.exec('SAVEPOINT append_events')
      try {
        for (const event of events) this.run('INSERT OR IGNORE INTO events (attempt_id, client_seq, data) VALUES (?, ?, ?)', attemptId, event.seq ?? null, JSON.stringify(event))
        this.db.exec('RELEASE append_events')
      } catch (error) {
        this.db.exec('ROLLBACK TO append_events')
        this.db.exec('RELEASE append_events')
        throw error
      }
    })
  }

  listEvents(attemptId: string) {
    return this.op(() => this.all('SELECT data FROM events WHERE attempt_id = ? ORDER BY seq', attemptId).map((row) => JSON.parse(row.data as string) as RecordedEvent))
  }

  putSnapshot(attemptId: string, key: SnapshotKey, snapshot: Snapshot) {
    return this.op(() => {
      this.run('INSERT INTO snapshots (attempt_id, key, data) VALUES (?, ?, ?) ON CONFLICT (attempt_id, key) DO UPDATE SET data = excluded.data', attemptId, key, JSON.stringify(snapshot))
    })
  }

  getSnapshot(attemptId: string, key: SnapshotKey) {
    return this.op(() => {
      const row = this.one('SELECT data FROM snapshots WHERE attempt_id = ? AND key = ?', attemptId, key)
      return row ? (JSON.parse(row.data as string) as Snapshot) : undefined
    })
  }

  putBlob(attemptId: string, kind: string, bytes: Uint8Array, contentType: string) {
    return this.op(() => {
      const id = newId('b')
      this.run('INSERT INTO blobs (id, attempt_id, kind, content_type, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, attemptId, kind, contentType, bytes, new Date().toISOString())
      return id
    })
  }

  getBlob(id: string) {
    return this.op(() => {
      const row = this.one('SELECT bytes, content_type FROM blobs WHERE id = ?', id)
      return row ? { bytes: new Uint8Array(row.bytes as Uint8Array), contentType: row.content_type as string } : undefined
    })
  }

  deleteBlob(id: string) {
    return this.op(() => { this.run('DELETE FROM blobs WHERE id = ?', id) })
  }

  deleteBlobs(attemptId: string) {
    return this.op(() => Number(this.run('DELETE FROM blobs WHERE attempt_id = ?', attemptId).changes))
  }

  deleteEvents(attemptId: string) {
    return this.op(() => Number(this.run('DELETE FROM events WHERE attempt_id = ?', attemptId).changes))
  }

  deleteSnapshots(attemptId: string) {
    return this.op(() => Number(this.run('DELETE FROM snapshots WHERE attempt_id = ?', attemptId).changes))
  }

  deleteBlobsBefore(date: Date) {
    return this.op(() => Number(this.run('DELETE FROM blobs WHERE created_at < ?', date.toISOString()).changes))
  }

  addRevision(runId: string, revision: Revision) {
    return this.op(() => {
      this.run('INSERT INTO revisions (run_id, data) VALUES (?, ?)', runId, JSON.stringify(revision))
      return Number((this.one('SELECT COUNT(*) AS n FROM revisions WHERE run_id = ?', runId) as { n: number }).n)
    })
  }

  listRevisions(runId: string) {
    return this.op(() => this.all('SELECT data FROM revisions WHERE run_id = ? ORDER BY seq', runId).map((row) => JSON.parse(row.data as string) as Revision))
  }

  reserve(runId: string, amount: Money, cap: Money) {
    return this.op(() => {
      if (amount.currency !== cap.currency || amount.minor < 0 || !Number.isInteger(amount.minor)) return false
      const run = () => {
        const row = this.one('SELECT COALESCE(SUM(minor), 0) AS total FROM reservations WHERE run_id = ? AND currency = ?', runId, amount.currency) as { total: number }
        if (row.total + amount.minor > cap.minor) return false
        this.run('INSERT INTO reservations (run_id, minor, currency) VALUES (?, ?, ?)', runId, amount.minor, amount.currency)
        return true
      }
      return this.atomic(run)
    })
  }

  async transaction<T>(fn: (store: RunStore) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this)
    const previous = this.shared.gate
    let release!: () => void
    this.shared.gate = new Promise<void>((resolve) => (release = resolve))
    try {
      await previous
      this.db.exec('BEGIN IMMEDIATE')
    } catch (error) {
      release()
      throw error
    }
    try {
      const result = await fn(new SqliteStore('', this.shared))
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    } finally {
      release()
    }
  }

  async close() {
    await this.shared.gate
    this.db.close()
  }
}
