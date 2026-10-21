import type { RecordedEvent } from '../store/types.ts'

export type Buffer = {
  /** Stores the events durably; resolves once they are kept. */
  push(events: RecordedEvent[]): Promise<void>
  /** Sends everything kept, in order, in batches. Stops at the first batch `post` refuses; what was not accepted stays kept. */
  flush(): Promise<void>
  /** Forgets everything kept. */
  clear(): Promise<void>
  /** Closes the buffer and deletes its database. */
  destroy(): Promise<void>
}

/** A batch holds at most this many events (the collector's limit) ... */
export const BATCH_EVENTS = 100
/** ... and at most this many bytes of JSON, which keeps the request under the collector's 2,100,000. */
export const BATCH_BYTES = 2_000_000
/** Replay batches (rrweb) are counted on their own: at most this many bytes, under the collector's 5,000,000 for them. */
export const REPLAY_BATCH_BYTES = 4_000_000

const STORE = 'events'
const encoder = new TextEncoder()
const size = (event: RecordedEvent) => encoder.encode(JSON.stringify(event)).length

const request = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})

/**
 * An IndexedDB-backed retry buffer. Events survive a lost connection or a page that reloads, and replay in order on the next
 * `flush`. Without IndexedDB (a private window, blocked site data) it keeps them in memory instead.
 * `post` answers true once the server has dealt with the batch for good (accepted, or refused in a way a retry cannot mend).
 */
export function createBuffer(
  post: (batch: RecordedEvent[]) => Promise<boolean>,
  db: IDBFactory | undefined = globalThis.indexedDB,
  name = 'ui-tests-events',
  limits: { events: number; bytes: number } = { events: BATCH_EVENTS, bytes: BATCH_BYTES },
): Buffer {
  let memory: { key: number; event: RecordedEvent }[] = []
  let counter = 0
  let opened: Promise<IDBDatabase | undefined> | undefined
  const open = () =>
    (opened ??= new Promise<IDBDatabase | undefined>((resolve) => {
      if (!db) return resolve(undefined)
      try {
        const req = db.open(name, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true })
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(undefined)
        req.onblocked = () => resolve(undefined)
      } catch {
        resolve(undefined)
      }
    }))

  async function read(): Promise<{ key: number; event: RecordedEvent }[]> {
    const database = await open()
    if (!database) return memory
    try {
      const tx = database.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const [keys, events] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
      // An event numbered by its sender keeps that number (it may also have gone out on its own, and the collector stores it once);
      // otherwise the key generator, which only counts up, is its sequence number across reloads.
      return keys.map((key, i) => ({ key: key as number, event: { ...(events[i] as RecordedEvent), seq: (events[i] as RecordedEvent).seq ?? (key as number) } }))
    } catch {
      return memory
    }
  }

  async function remove(keys: number[]): Promise<void> {
    const database = await open()
    if (!database) {
      memory = memory.filter((entry) => !keys.includes(entry.key))
      return
    }
    const tx = database.transaction(STORE, 'readwrite')
    for (const key of keys) tx.objectStore(STORE).delete(key)
    await done(tx)
  }

  // Pushes and flushes run one at a time so a flush never sends an event twice.
  let queue: Promise<unknown> = Promise.resolve()
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn)
    queue = next.catch(() => {})
    return next
  }

  return {
    push: (events) =>
      serial(async () => {
        if (events.length === 0) return
        const database = await open()
        if (!database) {
          for (const event of events) { const key = ++counter; memory.push({ key, event: { ...event, seq: event.seq ?? key } }) }
          return
        }
        const tx = database.transaction(STORE, 'readwrite')
        for (const event of events) tx.objectStore(STORE).add(event)
        await done(tx)
      }),
    flush: () =>
      serial(async () => {
        for (;;) {
          const kept = await read()
          if (kept.length === 0) return
          const batch: typeof kept = []
          let bytes = 0
          for (const entry of kept) {
            const n = size(entry.event)
            if (batch.length >= limits.events || (batch.length > 0 && bytes + n > limits.bytes)) break
            batch.push(entry)
            bytes += n
          }
          let accepted = false
          try { accepted = await post(batch.map((entry) => entry.event)) } catch { accepted = false }
          if (!accepted) return
          await remove(batch.map((entry) => entry.key))
        }
      }),
    clear: () =>
      serial(async () => {
        memory = []
        const database = await open()
        if (!database) return
        const tx = database.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).clear()
        await done(tx)
      }),
    destroy: () =>
      serial(async () => {
        memory = []
        const database = await open()
        database?.close()
        opened = undefined
        if (!db) return
        await new Promise<void>((resolve) => {
          try {
            const req = db.deleteDatabase(name)
            req.onsuccess = req.onerror = req.onblocked = () => resolve()
          } catch { resolve() }
        })
      }),
  }
}
