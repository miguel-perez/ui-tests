import { openStore } from '../store/open.ts'
import type { RunStore } from '../store/types.ts'
import { createCollector } from './collector.ts'

export { createCollector, type CollectorOptions } from './collector.ts'
export { participantView, type ParticipantView } from './view.ts'

let store: Promise<RunStore> | undefined
const handler = createCollector({
  store: () => (store ??= openStore().catch((error) => {
    store = undefined
    throw error
  })),
  ...(process.env.UI_TESTS_CLI_SECRET && { cliSecret: process.env.UI_TESTS_CLI_SECRET }),
})

/** The collector as route handlers: mount them at `/api/ui-tests/[[...path]]`. */
export const GET = (request: Request) => handler(request)
export const POST = (request: Request) => handler(request)
