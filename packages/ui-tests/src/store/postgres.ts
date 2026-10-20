import { createHash } from 'node:crypto'
import { newId, newRunId, newToken } from '../ids.ts'
import { postgresMigrations, type SqlClient } from './sql.ts'
import type {
  AttemptRow, AttemptStatus, Money, NewAttempt, NewRun, RecordedEvent, Revision, RunRow, RunStore, Snapshot, SnapshotKey,
} from './types.ts'

type Row = Record<string, unknown>
/** State shared by a store and its transaction view: the connection and the queue of open transactions (and migrations). */
type Shared = { client: SqlClient; gate: Promise<void> }

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const defaultDeadlineMs = 48 * 60 * 60 * 1000
const json = (value: unknown) => JSON.stringify(value)

/** Applies migrations not yet recorded, serialised across processes by a transaction-scoped advisory lock. */
async function migrate(client: SqlClient) {
  await client.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(7353717)')
    await tx.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)')
    const applied = (await tx.query<{ version: number }>('SELECT version FROM schema_migrations')).rows.map((row) => Number(row.version))
    for (let i = 0; i < postgresMigrations.length; i++) {
      if (applied.includes(i + 1)) continue
      // One statement per query: drivers prepare statements, which allow a single command.
      for (const statement of postgresMigrations[i]!.split(';').map((part) => part.trim()).filter(Boolean)) await tx.query(statement)
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [i + 1])
    }
  })
}

/** Run store on Postgres, through any {@link SqlClient}: PGlite locally and in tests, Neon in deployment. */
export class PostgresStore implements RunStore {
  private readonly shared: Shared
  private readonly tx?: SqlClient

  /** Starts applying migrations at once; every call waits for them. A transaction view is built only by `transaction()`. */
  constructor(client: SqlClient, view?: { shared: Shared; tx: SqlClient }) {
    if (view) {
      this.shared = view.shared
      this.tx = view.tx
      return
    }
    const ready = migrate(client)
    ready.catch(() => {})
    this.shared = { client, gate: ready }
  }

  /** Runs a body once any open transaction has finished (a transaction's own view runs at once). */
  private async op<T>(body: (db: SqlClient) => Promise<T>): Promise<T> {
    if (this.tx) return body(this.tx)
    await this.shared.gate
    return body(this.shared.client)
  }

  /** Runs a body as one atomic unit: inside a transaction it just runs; otherwise it opens one of its own. */
  private atomic<T>(body: (db: SqlClient) => Promise<T>): Promise<T> {
    return this.op((db) => (this.tx ? body(db) : db.transaction(body)))
  }

  private runRow(row: Row | undefined): RunRow | undefined {
    return row ? (row.data as RunRow) : undefined
  }

  private attemptRow(row: Row | undefined): AttemptRow | undefined {
    return row ? (row.data as AttemptRow) : undefined
  }

  createRun(input: NewRun) {
    return this.op(async (db) => {
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
      const inserted = await db.query(
        'INSERT INTO runs (id, key, revision, created_at, data) VALUES ($1, $2, $3, $4, $5::jsonb) ON CONFLICT (key) DO NOTHING RETURNING id',
        [run.run, run.key, run.revision, run.createdAt, json(run)],
      )
      if (inserted.rows.length > 0) return { run, created: true }
      const existing = await db.query<Row>('SELECT data FROM runs WHERE key = $1', [input.key])
      return { run: this.runRow(existing.rows[0])!, created: false }
    })
  }

  getRun(id: string) {
    return this.op(async (db) => this.runRow((await db.query<Row>('SELECT data FROM runs WHERE id = $1', [id])).rows[0]))
  }

  listRuns() {
    return this.op(async (db) => (await db.query<Row>('SELECT data FROM runs ORDER BY created_at, seq')).rows.map((row) => this.runRow(row)!))
  }

  updateRun(id: string, patch: Partial<RunRow>, expectedRevision: number) {
    return this.atomic(async (db) => {
      const current = this.runRow((await db.query<Row>('SELECT data FROM runs WHERE id = $1 FOR UPDATE', [id])).rows[0])
      if (!current || current.revision !== expectedRevision) return false
      const next: RunRow = { ...current, ...patch, run: current.run, key: current.key, createdAt: current.createdAt, revision: expectedRevision + 1 }
      await db.query('UPDATE runs SET data = $1::jsonb, revision = $2 WHERE id = $3', [json(next), next.revision, id])
      return true
    })
  }

  createAttempt(input: NewAttempt) {
    return this.atomic(async (db) => {
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
      await db.query('INSERT INTO participants (id, created_at) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [attempt.participant, new Date().toISOString()])
      await db.query('INSERT INTO attempts (id, run_id, participant_id, status, data) VALUES ($1, $2, $3, $4, $5::jsonb)', [attempt.id, attempt.runId, attempt.participant, attempt.status, json(attempt)])
      await db.query('INSERT INTO tokens (hash, attempt_id, run_id) VALUES ($1, $2, $3)', [hashToken(token), attempt.id, attempt.runId])
      return { attempt, token }
    })
  }

  authorize(token: string) {
    return this.op(async (db) => {
      // Only the sha256 of a token is stored and looked up through the primary-key index; the presented token is never
      // compared byte by byte, so there is no secret-dependent comparison for timing to reveal.
      const row = (await db.query<Row>('SELECT attempt_id, run_id FROM tokens WHERE hash = $1', [hashToken(token)])).rows[0]
      if (!row) return undefined
      const attempt = this.attemptRow((await db.query<Row>('SELECT data FROM attempts WHERE id = $1', [row.attempt_id])).rows[0])
      const run = this.runRow((await db.query<Row>('SELECT data FROM runs WHERE id = $1', [row.run_id])).rows[0])
      return attempt && run ? { run, attempt } : undefined
    })
  }

  getAttempt(id: string) {
    return this.op(async (db) => this.attemptRow((await db.query<Row>('SELECT data FROM attempts WHERE id = $1', [id])).rows[0]))
  }

  listAttempts(runId: string) {
    return this.op(async (db) => (await db.query<Row>('SELECT data FROM attempts WHERE run_id = $1 ORDER BY seq', [runId])).rows.map((row) => this.attemptRow(row)!))
  }

  updateAttempt(id: string, patch: Partial<AttemptRow>, expectedStatus?: AttemptStatus) {
    return this.atomic(async (db) => {
      const current = this.attemptRow((await db.query<Row>('SELECT data FROM attempts WHERE id = $1 FOR UPDATE', [id])).rows[0])
      if (!current || (expectedStatus !== undefined && current.status !== expectedStatus)) return false
      const next: AttemptRow = { ...current, ...patch, id: current.id, runId: current.runId, participant: current.participant }
      await db.query('UPDATE attempts SET data = $1::jsonb, status = $2 WHERE id = $3', [json(next), next.status, id])
      return true
    })
  }

  appendEvents(attemptId: string, events: RecordedEvent[]) {
    return this.atomic(async (db) => {
      for (const event of events) {
        await db.query('INSERT INTO events (attempt_id, client_seq, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (attempt_id, client_seq) DO NOTHING', [attemptId, event.seq ?? null, json(event)])
      }
    })
  }

  listEvents(attemptId: string) {
    return this.op(async (db) => (await db.query<Row>('SELECT data FROM events WHERE attempt_id = $1 ORDER BY seq', [attemptId])).rows.map((row) => row.data as RecordedEvent))
  }

  putSnapshot(attemptId: string, key: SnapshotKey, snapshot: Snapshot) {
    return this.op(async (db) => {
      await db.query('INSERT INTO snapshots (attempt_id, key, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (attempt_id, key) DO UPDATE SET data = excluded.data', [attemptId, key, json(snapshot)])
    })
  }

  getSnapshot(attemptId: string, key: SnapshotKey) {
    return this.op(async (db) => {
      const row = (await db.query<Row>('SELECT data FROM snapshots WHERE attempt_id = $1 AND key = $2', [attemptId, key])).rows[0]
      return row ? (row.data as Snapshot) : undefined
    })
  }

  putBlob(attemptId: string, kind: string, bytes: Uint8Array, contentType: string) {
    return this.op(async (db) => {
      const id = newId('b')
      await db.query('INSERT INTO blobs (id, attempt_id, kind, content_type, bytes, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [id, attemptId, kind, contentType, bytes, new Date().toISOString()])
      return id
    })
  }

  getBlob(id: string) {
    return this.op(async (db) => {
      const row = (await db.query<Row>('SELECT bytes, content_type FROM blobs WHERE id = $1', [id])).rows[0]
      return row ? { bytes: new Uint8Array(row.bytes as Uint8Array), contentType: row.content_type as string } : undefined
    })
  }

  deleteBlobs(attemptId: string) {
    return this.op(async (db) => (await db.query('DELETE FROM blobs WHERE attempt_id = $1 RETURNING id', [attemptId])).rows.length)
  }

  deleteEvents(attemptId: string) {
    return this.op(async (db) => (await db.query('DELETE FROM events WHERE attempt_id = $1 RETURNING seq', [attemptId])).rows.length)
  }

  deleteSnapshots(attemptId: string) {
    return this.op(async (db) => (await db.query('DELETE FROM snapshots WHERE attempt_id = $1 RETURNING key', [attemptId])).rows.length)
  }

  deleteBlobsBefore(date: Date) {
    return this.op(async (db) => (await db.query('DELETE FROM blobs WHERE created_at < $1 RETURNING id', [date.toISOString()])).rows.length)
  }

  addRevision(runId: string, revision: Revision) {
    return this.atomic(async (db) => {
      await db.query('INSERT INTO revisions (run_id, data) VALUES ($1, $2::jsonb)', [runId, json(revision)])
      return Number((await db.query<{ n: string }>('SELECT COUNT(*) AS n FROM revisions WHERE run_id = $1', [runId])).rows[0]!.n)
    })
  }

  listRevisions(runId: string) {
    return this.op(async (db) => (await db.query<Row>('SELECT data FROM revisions WHERE run_id = $1 ORDER BY seq', [runId])).rows.map((row) => row.data as Revision))
  }

  reserve(runId: string, amount: Money, cap: Money) {
    if (amount.currency !== cap.currency || amount.minor < 0 || !Number.isInteger(amount.minor)) return Promise.resolve(false)
    return this.atomic(async (db) => {
      // Locking the run row serialises concurrent reservations for it, so the sum below cannot go stale.
      await db.query('SELECT id FROM runs WHERE id = $1 FOR UPDATE', [runId])
      const total = Number((await db.query<{ total: string }>('SELECT COALESCE(SUM(minor), 0) AS total FROM reservations WHERE run_id = $1 AND currency = $2', [runId, amount.currency])).rows[0]!.total)
      if (total + amount.minor > cap.minor) return false
      await db.query('INSERT INTO reservations (run_id, minor, currency) VALUES ($1, $2, $3)', [runId, amount.minor, amount.currency])
      return true
    })
  }

  async transaction<T>(fn: (store: RunStore) => Promise<T>): Promise<T> {
    if (this.tx) return fn(this)
    const previous = this.shared.gate
    let release!: () => void
    this.shared.gate = new Promise<void>((resolve) => (release = resolve))
    try {
      await previous
      return await this.shared.client.transaction((tx) => fn(new PostgresStore(this.shared.client, { shared: this.shared, tx })))
    } finally {
      release()
    }
  }

  async close() {
    await this.shared.gate.catch(() => {})
    await this.shared.client.close()
  }
}
