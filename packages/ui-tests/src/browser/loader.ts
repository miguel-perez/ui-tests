import { STORAGE_KEY, forgetAttempt, readAttempt, writeAttempt } from './attempt.ts'
import { keyClient } from './key-client.ts'
import type { mountBar } from './mount.tsx'

/** The parts of the browser the loader uses; each is replaced in tests. */
export type LoaderDeps = {
  fetch: typeof fetch
  storage: Storage | undefined
  idb: IDBFactory | undefined
  location: Pick<Location, 'assign'>
  addEventListener: (type: 'storage', listener: (event: Pick<StorageEvent, 'key' | 'newValue'>) => void) => void
  /** Loads the bar, React and the recorder: a chunk of its own, fetched only once there is an attempt to show. */
  importBar: () => Promise<{ mountBar: typeof mountBar }>
}

/** `localStorage` throws in some sandboxed and privacy modes; the bar then lasts one page. */
function localStore(): Storage | undefined {
  try { return globalThis.localStorage } catch { return undefined }
}

/** The browser's own, for whatever `deps` does not name; each is read only when it is not given. */
function withBrowser(deps: Partial<LoaderDeps> = {}): LoaderDeps {
  const given = (key: keyof LoaderDeps) => key in deps
  return {
    fetch: deps.fetch ?? ((input, init) => fetch(input, init)),
    storage: given('storage') ? deps.storage : localStore(),
    idb: given('idb') ? deps.idb : globalThis.indexedDB,
    location: deps.location ?? globalThis.location,
    addEventListener: deps.addEventListener ?? ((type, listener) => globalThis.addEventListener(type, listener)),
    importBar: deps.importBar ?? (() => import('./mount.tsx')),
  }
}

type Exchanged = { key: string; run: string; attempt: string; expiresAt: number }
const isExchanged = (value: unknown): value is Exchanged => {
  const body = value as Partial<Exchanged> | null
  return typeof body === 'object' && body !== null && typeof body.key === 'string' && typeof body.run === 'string'
    && typeof body.attempt === 'string' && typeof body.expiresAt === 'number'
}

/**
 * What `ui-tests.js` runs, with the address it was loaded from. A fragment `#<run>.<code>` (the tag passes on the handoff code) is
 * traded for an attempt key, which replaces any attempt kept before; then, for the attempt kept for this server, the bar is loaded and
 * mounted. Another tab ending or replacing that attempt unmounts it. Every failure leaves the page as it was: nothing is thrown and
 * nothing is added.
 */
export async function start(moduleUrl: string, deps?: Partial<LoaderDeps>): Promise<void> {
  try {
    const { fetch: send, storage, idb, location, addEventListener, importBar } = withBrowser(deps)
    const url = new URL(moduleUrl)
    const server = url.origin
    const handoff = url.hash.slice(1)
    if (handoff) {
      const dot = handoff.lastIndexOf('.')
      if (dot < 1) return
      const run = handoff.slice(0, dot)
      const older = readAttempt(storage, server, -Infinity)
      let body: unknown
      try {
        const response = await send(`${server}/api/ui-tests/exchange?run=${encodeURIComponent(run)}`, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: handoff.slice(dot + 1) }),
        })
        body = response.ok ? await response.json() : undefined
      } catch { /* the server is not there: treated as a refusal */ }
      if (!isExchanged(body) || body.run !== run) {
        // The code is spent or refused, so an older attempt of the same run is over too; another run's attempt stays.
        if (older?.run === run) forgetAttempt(storage, idb, older.attempt)
        return
      }
      writeAttempt(storage, { v: 1, server, run: body.run, attempt: body.attempt, key: body.key, expiresAt: body.expiresAt })
    }
    const stored = readAttempt(storage, server, Date.now())
    if (!stored) return
    const { mountBar } = await importBar()
    const unmount = mountBar(keyClient(server, stored, { fetch: send, location, storage, idb }), document)
    let mounted = true
    addEventListener('storage', (event) => {
      if (!mounted || (event.key !== STORAGE_KEY && event.key !== null)) return
      let next: { attempt?: unknown } | null = null
      try { next = JSON.parse(event.newValue ?? 'null') } catch { /* unreadable is as good as removed */ }
      if (next?.attempt !== stored.attempt) { mounted = false; unmount() }
    })
  } catch {
    // The page goes on as if the tag were not there.
  }
}
