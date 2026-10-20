import { openStore } from '../store/open.ts'
import { applyRetention } from '../store/retention.ts'
import type { RunStore } from '../store/types.ts'

let store: Promise<RunStore> | undefined

/** The one store this server process reads and writes, opened on first use. A failed open is not kept: the next request tries again. */
export function getStore(): Promise<RunStore> {
  return (store ??= openStore()
    // What is past retention goes when the store opens; a failure is told and does not keep the server from serving.
    .then(async (opened) => {
      await applyRetention(opened, new Date()).catch((error) => console.error(`ui-tests: retention failed: ${error instanceof Error ? error.message : String(error)}`))
      // A server that stays up for months expires what is past retention once a day.
      setInterval(() => { void applyRetention(opened, new Date()).catch(() => {}) }, 24 * 60 * 60 * 1000).unref()
      return opened
    })
    .catch((error) => {
      store = undefined
      throw error
    }))
}
