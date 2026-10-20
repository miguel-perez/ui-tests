import type { BarView } from '../server/view.ts'
import { forgetAttempt, type StoredAttempt } from './attempt.ts'
import type { BarClient } from './bar.tsx'

/** The parts of the browser the client uses; each is replaced in tests. */
export type KeyClientDeps = {
  fetch?: typeof fetch
  location?: Pick<Location, 'assign'>
  storage?: Storage
  idb?: IDBFactory
}

/** Whether a body may go with keepalive: only while it fits the browsers' 64 KB budget for it. */
export const fitsKeepalive = (text: string) => new TextEncoder().encode(text).length < 60_000

/**
 * The bar's client on the app's page: every request goes to the collector on `server`, names the run, and carries the attempt key and
 * nothing else (never a cookie). A 401 means the key is spent or the attempt withdrawn, so the page forgets it.
 */
export function keyClient(server: string, stored: StoredAttempt, deps: KeyClientDeps = {}): BarClient {
  const send = deps.fetch ?? ((input, init) => fetch(input, init))
  const collector = `${server}/api/ui-tests/?run=${encodeURIComponent(stored.run)}`
  const forget = () => forgetAttempt(deps.storage, deps.idb, stored.attempt)
  const checked = (response: Response) => {
    if (response.status === 401) forget()
    return response
  }
  return {
    async view() {
      const response = checked(await send(`${collector}&view=bar`, { credentials: 'omit', cache: 'no-store', headers: { Authorization: `Bearer ${stored.key}` } }))
      return response.ok ? ((await response.json()) as BarView) : undefined
    },
    async post(body, options = {}) {
      const text = JSON.stringify(body)
      return checked(await send(collector, {
        method: 'POST',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${stored.key}`, 'Content-Type': 'application/json' },
        body: text,
        keepalive: options.keepalive !== false && fitsKeepalive(text),
      }))
    },
    back(query) {
      forget()
      ;(deps.location ?? window.location).assign(`${server}/ui-tests/${encodeURIComponent(stored.run)}/?${query}`)
    },
  }
}
