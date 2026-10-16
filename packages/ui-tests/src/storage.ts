import Database from 'better-sqlite3'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { CompiledContext } from './compiler.ts'
import type { Snapshot } from './index.ts'

/** A recorder event: clicks with whether anything changed, URL changes, scroll, masked input, pauses and task-step snapshots. */
export type Event = { type: 'click' | 'url' | 'scroll' | 'input' | 'pause' | 'step'; at: number; url: string; target?: string; changed?: boolean; duration?: number; step?: number; snapshot?: Snapshot }
/** How an attempt ended. `abandoned early` is leaving before the first interaction; `gave up` is after trying. Both are distinct from failure. */
export type Reason = 'done' | 'gave up' | 'abandoned early' | 'timed out'
/** A spoken answer: the transcript as the person saw it and the stored audio it came from. */
export type VoiceAnswer = { question: 'difficulty' | 'words'; transcript: string; recording: string; mime: string; seconds: number }
/** What is captured for an attempt, each with the consent behind it. Interaction events are always recorded; voice only once the person chooses to talk. */
export type Recording = { events: true; screen: boolean; voice: boolean; webcam: boolean }
/** A run and its single rehearsal attempt: status, timings, terminal reason, answers, end-state snapshot and hook result. */
export type Run = { id: string; token: string; context: CompiledContext; goalIndex: number; sequence?: { index: number; total: number }; hooksBundle?: string; authoredContextIndex?: number; status: 'created' | 'consented' | 'active' | 'questions' | 'finished'; startedAt: number; endedAt?: number; extendedSeconds?: number; withdrawnAt?: number; reason?: Reason; seq?: number; difficulty?: string; confidence?: number; uxLite?: { ease: number; usefulness: number }; words?: string; voice?: VoiceAnswer[]; recording?: Recording; snapshot?: Snapshot; result?: unknown; answers?: Record<string, string> }
/** Storage behind the collector and the CLI. The SQLite adapter is the development implementation. */
export interface StorageAdapter {
  create(context: CompiledContext, goalIndex?: number): Run
  get(id: string): Run | undefined
  authorize(id: string, token: string): Run | undefined
  update(run: Run, previous?: Run): boolean
  append(id: string, events: Event[]): void
  events(id: string): Event[]
  /** Stores one voice recording for a run and returns its id. */
  saveRecording(id: string, mime: string, audio: Buffer): string
  /** Loads a stored voice recording. */
  recording(id: string): { mime: string; audio: Buffer } | undefined
  /** Deletes one stored recording, such as the answer a new recording replaced. */
  deleteRecording(id: string): void
  /** Deletes recordings stored before `before` (epoch ms) and returns how many went. */
  purgeRecordings(before: number): number
  /** Withdraws a run: deletes every recording for it and marks its attempt withdrawn. Returns the updated run. */
  withdraw(id: string): Run | undefined
  close(): void
}
/** How long recordings are kept unless withdrawn sooner: the 90-day default from the privacy requirements. */
export const recordingRetentionMs = 90 * 24 * 60 * 60 * 1000
/** The local data directory: `UI_TESTS_DATA_DIR`, or `.ui-tests` next to the nearest `package-lock.json`. */
export function dataDirectory() {
  if (process.env.UI_TESTS_DATA_DIR) return process.env.UI_TESTS_DATA_DIR
  let root = process.cwd()
  while (!existsSync(path.join(root, 'package-lock.json')) && path.dirname(root) !== root) root = path.dirname(root)
  return path.join(root, '.ui-tests')
}
/** Development storage: runs, attempts, events and end-state snapshots in one SQLite file. */
export class SQLiteAdapter implements StorageAdapter {
  db: Database.Database
  /** Opens or creates the database and its tables; `:memory:` skips directory creation. */
  constructor(filename = path.join(dataDirectory(), 'dev.sqlite')) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(`CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (run_id TEXT PRIMARY KEY REFERENCES runs(id), rehearsal INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (run_id TEXT PRIMARY KEY REFERENCES runs(id), url TEXT NOT NULL, dom TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recordings (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), mime TEXT NOT NULL, audio BLOB NOT NULL, created_at INTEGER NOT NULL);`)
    // Databases from before retention lack the timestamp; their recordings start the 90 days now.
    if (!(this.db.prepare('PRAGMA table_info(recordings)').all() as { name: string }[]).some(column => column.name === 'created_at')) {
      this.db.exec('ALTER TABLE recordings ADD COLUMN created_at INTEGER')
      this.db.prepare('UPDATE recordings SET created_at=?').run(Date.now())
    }
    this.db.exec('CREATE INDEX IF NOT EXISTS recordings_run ON recordings(run_id); CREATE INDEX IF NOT EXISTS recordings_created ON recordings(created_at)')
    // Every opening enforces retention, so no command or request reads a recording past it.
    this.purgeRecordings(Date.now() - recordingRetentionMs)
  }
  /** Creates a run with a fresh participant token and its rehearsal attempt row. */
  create(context: CompiledContext, goalIndex = 0): Run {
    if (!context.goals[goalIndex]) throw new Error('Unknown goal')
    const run: Run = { id: randomUUID(), token: randomBytes(32).toString('hex'), context, goalIndex, status: 'created', startedAt: Date.now(), recording: { events: true, screen: false, voice: false, webcam: false } }
    this.db.prepare('INSERT INTO runs VALUES (?, ?, ?)').run(run.id, run.token, JSON.stringify(run))
    this.db.prepare('INSERT INTO attempts(run_id,data) VALUES (?,?)').run(run.id, JSON.stringify({ rehearsal: true }))
    return run
  }
  /** Loads a run by id without checking its token. */
  get(id: string) { const row = this.db.prepare('SELECT data FROM runs WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Run : undefined }
  /** Loads a run only when the token matches, compared in constant time. */
  authorize(id: string, token: string) {
    const run = this.get(id)
    if (!run || Buffer.byteLength(token) !== Buffer.byteLength(run.token) || !timingSafeEqual(Buffer.from(token), Buffer.from(run.token))) return undefined
    return run
  }
  /** Persists the run, its attempt summary and its snapshot in one transaction. With `previous`, writes only if the stored row still equals it and returns false otherwise. */
  update(run: Run, previous?: Run) {
    return this.db.transaction(() => {
      const updated = previous
        ? this.db.prepare('UPDATE runs SET data=? WHERE id=? AND data=?').run(JSON.stringify(run), run.id, JSON.stringify(previous))
        : this.db.prepare('UPDATE runs SET data=? WHERE id=?').run(JSON.stringify(run), run.id)
      if (!updated.changes) return false
      this.db.prepare('UPDATE attempts SET data=? WHERE run_id=?').run(JSON.stringify({ reason: run.reason, seq: run.seq, confidence: run.confidence, uxLite: run.uxLite, voice: run.voice?.map(answer => answer.recording), withdrawnAt: run.withdrawnAt, startedAt: run.startedAt, endedAt: run.endedAt, rehearsal: true }), run.id)
      if (run.snapshot) this.db.prepare('INSERT OR REPLACE INTO snapshots VALUES (?,?,?)').run(run.id, run.snapshot.url, run.snapshot.dom)
      return true
    })()
  }
  /** Appends recorder events for a run in one transaction. */
  append(id: string, events: Event[]) {
    this.db.transaction(() => { for (const event of events) this.db.prepare('INSERT INTO events(run_id,data) VALUES (?,?)').run(id, JSON.stringify(event)) })()
  }
  /** Returns a run's events in insertion order. */
  events(id: string) { return (this.db.prepare('SELECT data FROM events WHERE run_id=? ORDER BY id').all(id) as { data: string }[]).map(row => JSON.parse(row.data) as Event) }
  /** Stores one voice recording as a blob beside the run, so the run record stays small. */
  saveRecording(id: string, mime: string, audio: Buffer) {
    const recording = randomUUID()
    this.db.prepare('INSERT INTO recordings(id,run_id,mime,audio,created_at) VALUES (?,?,?,?,?)').run(recording, id, mime, audio, Date.now())
    return recording
  }
  /** Loads a stored voice recording by id. */
  recording(id: string) { return this.db.prepare('SELECT mime, audio FROM recordings WHERE id=?').get(id) as { mime: string; audio: Buffer } | undefined }
  /** Deletes one stored recording by id. */
  deleteRecording(id: string) { this.db.prepare('DELETE FROM recordings WHERE id=?').run(id) }
  /** Deletes recordings older than the cutoff. */
  purgeRecordings(before: number) { return this.db.prepare('DELETE FROM recordings WHERE created_at < ?').run(before).changes }
  /** Deletes every recording for the run, drops the spoken answers that pointed at them and marks the attempt withdrawn, in one transaction. */
  withdraw(id: string) {
    return this.db.transaction(() => {
      const run = this.get(id)
      if (!run) return undefined
      this.db.prepare('DELETE FROM recordings WHERE run_id=?').run(id)
      run.voice = undefined
      run.recording = { ...(run.recording ?? { events: true, screen: false, webcam: false }), voice: false }
      run.withdrawnAt ??= Date.now()
      this.update(run)
      return run
    })()
  }
  /** Closes the database handle. */
  close() { this.db.close() }
}
