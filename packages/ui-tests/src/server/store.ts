import { openStore } from '../store/open.ts'
import type { RunStore } from '../store/types.ts'

let store: Promise<RunStore> | undefined

/** The one store this server process reads and writes, opened on first use. A failed open is not kept: the next request tries again. */
export function getStore(): Promise<RunStore> {
  return (store ??= openStore().catch((error) => {
    store = undefined
    throw error
  }))
}
