/** The query surface the Postgres adapter needs; PGlite and Neon each implement it. */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
  /** Runs `fn` on one connection inside BEGIN/COMMIT; a throw rolls back. The `tx` client must not be used after `fn` settles. */
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/**
 * Postgres schema, applied in order and recorded in `schema_migrations`. Documents are `jsonb`; timestamps that order or
 * expire rows are ISO-8601 text, as in SQLite. `seq` columns give a deterministic insertion-order tiebreak.
 * Identity lives only in `participants`.
 */
export const postgresMigrations: string[] = [
  `CREATE TABLE participants (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
   CREATE TABLE runs (
     id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, created_at TEXT NOT NULL,
     seq BIGSERIAL, data JSONB NOT NULL);
   CREATE TABLE attempts (
     id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), participant_id TEXT NOT NULL REFERENCES participants(id),
     status TEXT NOT NULL, seq BIGSERIAL, data JSONB NOT NULL);
   CREATE INDEX attempts_run ON attempts(run_id, seq);
   CREATE TABLE tokens (hash TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), run_id TEXT NOT NULL REFERENCES runs(id));
   CREATE TABLE events (
     seq BIGSERIAL PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), client_seq BIGINT, data JSONB NOT NULL);
   CREATE INDEX events_attempt ON events(attempt_id, seq);
   CREATE UNIQUE INDEX events_client_seq ON events(attempt_id, client_seq);
   CREATE TABLE snapshots (attempt_id TEXT NOT NULL REFERENCES attempts(id), key TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY (attempt_id, key));
   CREATE TABLE blobs (
     id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), kind TEXT NOT NULL, content_type TEXT NOT NULL,
     bytes BYTEA NOT NULL, created_at TEXT NOT NULL);
   CREATE INDEX blobs_attempt ON blobs(attempt_id);
   CREATE TABLE revisions (seq BIGSERIAL PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data JSONB NOT NULL);
   CREATE TABLE reservations (seq BIGSERIAL PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), minor BIGINT NOT NULL, currency TEXT NOT NULL);`,
]
