import type { CompiledStudy } from '../schema/compiled.ts'

/** Money in integer minor units with a currency. */
export type Money = { minor: number; currency: string }

export type RecruitmentState = 'open' | 'filled' | 'paused' | 'stopped'
export type CollectionState = 'waiting' | 'collecting' | 'complete'
export type VerificationState = 'pending' | 'complete' | 'instrumentation-problem'
export type PaymentState = 'none' | 'reserved' | 'paid' | 'trued-up'
export type RunResult = 'pending' | 'problems-found' | 'none-found' | 'inconclusive'

/** The run handle of PRD 05: what a caller keeps to find and read a run. */
export type RunHandle = {
  run: string
  key: string
  context: { users: CompiledStudy['users']; purpose: string; id: string }
  build: { url: string; commit: string }
  actor: 'human' | 'agent'
  states: { recruitment: RecruitmentState; collection: CollectionState; verification: VerificationState; payment: PaymentState }
  result: RunResult
  deadline: string
  revision: number
}

/** A run as stored: the handle plus the compiled study, its hooks bundle and where it points. */
export type RunRow = RunHandle & {
  compiled: CompiledStudy
  hooksBundle: string
  rehearsal: boolean
  target: string
  createdAt: string
  /** Tunnels opened for the run, as JSON; shape is owned by the tunnel task. */
  tunnels?: unknown
  /** The reachability check of the target, as JSON; shape is owned by the recruit task. */
  reachability?: unknown
  /** Where the run's pull request check lives (`GitHubLink`); set by `ui-tests check`. */
  github?: unknown
  /** What has been told to the outside for the current result (`Delivered`): check, comment, webhook. */
  delivered?: unknown
}

/** What `createRun` takes; the store assigns the id, revision, creation time, and default states, result and deadline (48 hours). */
export type NewRun = Omit<RunRow, 'run' | 'revision' | 'createdAt' | 'states' | 'result' | 'deadline'> &
  Partial<Pick<RunRow, 'states' | 'result' | 'deadline'>>

export type AttemptStatus = 'created' | 'consented' | 'active' | 'questions' | 'finished'
export type AttemptReason = 'done' | 'gave up' | 'timeout' | 'withdrew' | 'disconnected'

/** The verdict of one hook: correct, incorrect with a diff, or unknown with a reason. */
export type HookResult = { status: 'correct' | 'incorrect' | 'unknown'; reason?: string; diff?: { expected: unknown; actual: unknown } }

/** The verified outcome of an attempt: the overall verdict, each step check, and the validation answer. */
export type Verification = HookResult & { steps: (HookResult & { name: string })[]; answer?: HookResult }

/** One revision of a run's findings, made in the trace viewer. Minimal here; the revision task extends it. */
export type Revision = { at: string; author?: string; note?: string; data?: unknown }

export type AttemptRow = {
  id: string
  runId: string
  /** The opaque runner id. Identity itself lives only in the participants table. */
  participant: string
  goalIndex: number
  status: AttemptStatus
  reason?: AttemptReason
  setupValues: Record<string, unknown>
  startedAt?: string
  endedAt?: string
  answers: Record<string, unknown>
  verification?: Verification
  rehearsal: boolean
  purposes: string[]
  environment?: Record<string, string>
  flags: string[]
}

export type NewAttempt = {
  runId: string
  participant: string
  goalIndex: number
  rehearsal: boolean
  purposes?: string[]
  setupValues?: Record<string, unknown>
  environment?: Record<string, string>
}

/** The end state of a page: its URL and DOM, flagged when truncated. */
export type Snapshot = { url: string; dom: string; truncated?: boolean; state?: unknown }

export type SnapshotKey = 'end' | `step-${number}`

export type RecordedEvent = {
  type: 'click' | 'url' | 'scroll' | 'input' | 'pause' | 'step' | 'key' | 'focus' | 'rrweb'
  at: number
  url: string
  target?: string
  changed?: boolean
  duration?: number
  step?: number
  data?: unknown
  /** The sender's per-attempt sequence number; an event whose (attempt, seq) is already stored is ignored. */
  seq?: number
}

/** Storage behind the collector and the CLI. SQLite for development, Postgres elsewhere; both pass the same conformance suite. */
export interface RunStore {
  /** Idempotent on `input.key`: a repeated key returns the existing run with `created: false`. */
  createRun(input: NewRun): Promise<{ run: RunRow; created: boolean }>
  getRun(id: string): Promise<RunRow | undefined>
  /** All runs in creation order (ties broken by insertion order). */
  listRuns(): Promise<RunRow[]>
  /** Applies the patch and bumps the revision, only when the stored revision is `expectedRevision`. */
  updateRun(id: string, patch: Partial<RunRow>, expectedRevision: number): Promise<boolean>
  /** Creates the attempt and a token, returned once; only its hash is stored. */
  createAttempt(input: NewAttempt): Promise<{ attempt: AttemptRow; token: string }>
  /** Revokes every token of the attempt, so `authorize` no longer finds them. */
  revokeTokens(attemptId: string): Promise<void>
  authorize(token: string): Promise<{ run: RunRow; attempt: AttemptRow } | undefined>
  getAttempt(id: string): Promise<AttemptRow | undefined>
  /** The run's attempts in creation order (ties broken by insertion order). */
  listAttempts(runId: string): Promise<AttemptRow[]>
  /** With `expectedStatus`, applies only when the attempt is in that status. */
  updateAttempt(id: string, patch: Partial<AttemptRow>, expectedStatus?: AttemptStatus): Promise<boolean>
  appendEvents(attemptId: string, events: RecordedEvent[]): Promise<void>
  listEvents(attemptId: string): Promise<RecordedEvent[]>
  putSnapshot(attemptId: string, key: SnapshotKey, snapshot: Snapshot): Promise<void>
  getSnapshot(attemptId: string, key: SnapshotKey): Promise<Snapshot | undefined>
  putBlob(attemptId: string, kind: string, bytes: Uint8Array, contentType: string): Promise<string>
  getBlob(id: string): Promise<{ bytes: Uint8Array; contentType: string } | undefined>
  deleteBlob(id: string): Promise<void>
  deleteBlobs(attemptId: string): Promise<number>
  /** Deletes the attempt's recorded events (the replay); returns how many. */
  deleteEvents(attemptId: string): Promise<number>
  /** Deletes the attempt's snapshots; returns how many. */
  deleteSnapshots(attemptId: string): Promise<number>
  /** Deletes blobs stored before `date` (retention); returns how many. */
  deleteBlobsBefore(date: Date): Promise<number>
  /** Appends a revision; returns its 1-based position. */
  addRevision(runId: string, revision: Revision): Promise<number>
  listRevisions(runId: string): Promise<Revision[]>
  /** Adds `amount` to the run's reservations unless the total would pass `cap`. Transactional. */
  reserve(runId: string, amount: Money, cap: Money): Promise<boolean>
  /** Runs `fn` atomically; a throw rolls everything back. */
  transaction<T>(fn: (store: RunStore) => Promise<T>): Promise<T>
  close(): Promise<void>
}
