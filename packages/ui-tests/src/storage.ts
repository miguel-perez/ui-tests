import Database from 'better-sqlite3'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import type { CompiledContext } from './compiler.ts'
import type { Snapshot } from './index.ts'

export type Event = { type: 'click' | 'url' | 'scroll' | 'input' | 'pause' | 'step'; at: number; url: string; target?: string; changed?: boolean; duration?: number; step?: number; snapshot?: Snapshot }
export type Run = { id: string; token: string; context: CompiledContext; goalIndex: number; hooksBundle?: string; authoredContextIndex?: number; status: 'created' | 'consented' | 'active' | 'questions' | 'finished'; startedAt: number; endedAt?: number; reason?: 'done' | 'gave up' | 'timed out'; seq?: number; confidence?: number; snapshot?: Snapshot; result?: unknown; answers?: Record<string, string> }
export interface StorageAdapter {
  create(context: CompiledContext, goalIndex?: number): Run
  get(id: string): Run | undefined
  authorize(id: string, token: string): Run | undefined
  update(run: Run, previous?: Run): boolean
  append(id: string, events: Event[]): void
  events(id: string): Event[]
  close(): void
}
export function dataDirectory() {
  if (process.env.UI_TESTS_DATA_DIR) return process.env.UI_TESTS_DATA_DIR
  let root = process.cwd()
  while (!existsSync(path.join(root, 'package-lock.json')) && path.dirname(root) !== root) root = path.dirname(root)
  return path.join(root, '.ui-tests')
}
export class SQLiteAdapter implements StorageAdapter {
  db: Database.Database
  constructor(filename = path.join(dataDirectory(), 'dev.sqlite')) {
    if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.exec(`CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, token TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (run_id TEXT PRIMARY KEY REFERENCES runs(id), rehearsal INTEGER NOT NULL DEFAULT 1, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots (run_id TEXT PRIMARY KEY REFERENCES runs(id), url TEXT NOT NULL, dom TEXT NOT NULL);`)
  }
  create(context: CompiledContext, goalIndex = 0): Run {
    if (!context.goals[goalIndex]) throw new Error('Unknown goal')
    const run: Run = { id: randomUUID(), token: randomBytes(32).toString('hex'), context, goalIndex, status: 'created', startedAt: Date.now() }
    this.db.prepare('INSERT INTO runs VALUES (?, ?, ?)').run(run.id, run.token, JSON.stringify(run))
    this.db.prepare('INSERT INTO attempts(run_id,data) VALUES (?,?)').run(run.id, JSON.stringify({ rehearsal: true }))
    return run
  }
  get(id: string) { const row = this.db.prepare('SELECT data FROM runs WHERE id=?').get(id) as { data: string } | undefined; return row ? JSON.parse(row.data) as Run : undefined }
  authorize(id: string, token: string) {
    const run = this.get(id)
    if (!run || Buffer.byteLength(token) !== Buffer.byteLength(run.token) || !timingSafeEqual(Buffer.from(token), Buffer.from(run.token))) return undefined
    return run
  }
  update(run: Run, previous?: Run) {
    return this.db.transaction(() => {
      const updated = previous
        ? this.db.prepare('UPDATE runs SET data=? WHERE id=? AND data=?').run(JSON.stringify(run), run.id, JSON.stringify(previous))
        : this.db.prepare('UPDATE runs SET data=? WHERE id=?').run(JSON.stringify(run), run.id)
      if (!updated.changes) return false
      this.db.prepare('UPDATE attempts SET data=? WHERE run_id=?').run(JSON.stringify({ reason: run.reason, seq: run.seq, confidence: run.confidence, startedAt: run.startedAt, endedAt: run.endedAt, rehearsal: true }), run.id)
      if (run.snapshot) this.db.prepare('INSERT OR REPLACE INTO snapshots VALUES (?,?,?)').run(run.id, run.snapshot.url, run.snapshot.dom)
      return true
    })()
  }
  append(id: string, events: Event[]) {
    this.db.transaction(() => { for (const event of events) this.db.prepare('INSERT INTO events(run_id,data) VALUES (?,?)').run(id, JSON.stringify(event)) })()
  }
  events(id: string) { return (this.db.prepare('SELECT data FROM events WHERE run_id=? ORDER BY id').all(id) as { data: string }[]).map(row => JSON.parse(row.data) as Event) }
  close() { this.db.close() }
}
