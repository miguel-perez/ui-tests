import { openStore } from '../store/open.ts'
import type { RunStore } from '../store/types.ts'
import { nullTranscriber, type Transcriber } from '../transcriber.ts'
import { createCollector } from './collector.ts'

export { createCollector, type CollectorOptions } from './collector.ts'
export { nullTranscriber, type Transcriber } from '../transcriber.ts'
export { participantView, type ParticipantView } from './view.ts'
export { PlayerPage } from './player-page.tsx'

/**
 * Spoken answers are kept as audio. To also get text, set `UI_TESTS_TRANSCRIBER` to a module (a package name or an absolute path)
 * whose default export is a `Transcriber` (`{ transcribe(audio: Uint8Array): Promise<string | undefined> }`); it is loaded on first use.
 */
let transcriber: Promise<Transcriber> | undefined
const configured: Transcriber = {
  async transcribe(audio) {
    const module = process.env.UI_TESTS_TRANSCRIBER
    if (!module) return nullTranscriber.transcribe(audio)
    transcriber ??= import(/* webpackIgnore: true */ module).then((m: { default: Transcriber }) => m.default)
    return (await transcriber).transcribe(audio)
  },
}

let store: Promise<RunStore> | undefined
const handler = createCollector({
  store: () => (store ??= openStore().catch((error) => {
    store = undefined
    throw error
  })),
  transcriber: configured,
  ...(process.env.UI_TESTS_CLI_SECRET && { cliSecret: process.env.UI_TESTS_CLI_SECRET }),
})

/** The collector as route handlers: mount them at `/api/ui-tests/[[...path]]`. */
export const GET = (request: Request) => handler(request)
export const POST = (request: Request) => handler(request)
