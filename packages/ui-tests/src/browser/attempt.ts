/** Where the app's page keeps the attempt it is in, on the app's own origin. The tag reads the same key. */
export const STORAGE_KEY = 'ui-tests-attempt'

/** The attempt key the page traded its handoff code for, the server that issued it, and when it stops working (epoch ms). */
export type StoredAttempt = { v: 1; server: string; run: string; attempt: string; key: string; expiresAt: number }

const isStored = (value: unknown): value is StoredAttempt => {
  const stored = value as Partial<StoredAttempt> | null
  return typeof stored === 'object' && stored !== null && stored.v === 1
    && typeof stored.server === 'string' && typeof stored.run === 'string' && typeof stored.attempt === 'string'
    && typeof stored.key === 'string' && typeof stored.expiresAt === 'number'
}

/** The attempt kept for `server`, while it has not expired at `now`; anything else (no storage, bad JSON, another version) is none. */
export function readAttempt(storage: Storage | undefined, server: string, now: number): StoredAttempt | undefined {
  try {
    const stored: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')
    return isStored(stored) && stored.server === server && stored.expiresAt > now ? stored : undefined
  } catch {
    return undefined
  }
}

/** Keeps `value`, replacing whatever attempt was kept before. Without storage the bar lasts this page only. */
export function writeAttempt(storage: Storage | undefined, value: StoredAttempt): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(value)) } catch { /* the next page starts without it */ }
}

/**
 * Forgets `attempt`: its entry, when the kept entry is that attempt (another tab may have moved on to a newer one), and the events and
 * replay kept for it in IndexedDB. Never throws.
 */
export function forgetAttempt(storage: Storage | undefined, idb: IDBFactory | undefined, attempt: string): void {
  try {
    const stored: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null')
    if (isStored(stored) && stored.attempt === attempt) storage?.removeItem(STORAGE_KEY)
  } catch { /* nothing kept, or nothing to keep it in */ }
  for (const name of [`ui-tests-events:${attempt}`, `ui-tests-replay:${attempt}`]) {
    try { idb?.deleteDatabase(name) } catch { /* no IndexedDB here */ }
  }
}
