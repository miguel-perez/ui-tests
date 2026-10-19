/** SQLite schema, applied in order; the index is stored in `PRAGMA user_version`. Identity lives only in `participants`. */
export const sqliteMigrations: string[] = [
  `CREATE TABLE participants (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
   CREATE TABLE runs (
     id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL);
   CREATE TABLE attempts (
     id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), participant_id TEXT NOT NULL REFERENCES participants(id),
     status TEXT NOT NULL, data TEXT NOT NULL);
   CREATE INDEX attempts_run ON attempts(run_id);
   CREATE TABLE tokens (hash TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), run_id TEXT NOT NULL REFERENCES runs(id));
   CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, attempt_id TEXT NOT NULL REFERENCES attempts(id), data TEXT NOT NULL);
   CREATE INDEX events_attempt ON events(attempt_id, seq);
   CREATE TABLE snapshots (attempt_id TEXT NOT NULL REFERENCES attempts(id), key TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (attempt_id, key));
   CREATE TABLE blobs (
     id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL REFERENCES attempts(id), kind TEXT NOT NULL, content_type TEXT NOT NULL,
     bytes BLOB NOT NULL, created_at TEXT NOT NULL);
   CREATE INDEX blobs_attempt ON blobs(attempt_id);
   CREATE TABLE revisions (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
   CREATE TABLE reservations (seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(id), minor INTEGER NOT NULL, currency TEXT NOT NULL);`,
  // Events carry the sender's sequence number so a replayed batch is stored once; events without one always insert (NULLs are distinct).
  `ALTER TABLE events ADD COLUMN client_seq INTEGER;
   CREATE UNIQUE INDEX events_client_seq ON events(attempt_id, client_seq);`,
]
