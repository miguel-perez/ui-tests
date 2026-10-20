import { moduleTranscriber } from '../transcriber.ts'
import { createCollector } from './collector.ts'
import { getStore } from './store.ts'
import { reportVideo } from './video.ts'

export { createCollector, type CollectorOptions } from './collector.ts'
export { nullTranscriber, type Transcriber } from '../transcriber.ts'
export { participantView, type ParticipantView } from './view.ts'
export { PlayerPage } from './player-page.tsx'
export { ReportPage, reportMetadata } from './report-page.tsx'

/**
 * Spoken answers are kept as audio. To also get text, set `UI_TESTS_TRANSCRIBER` to a module (a package name or an absolute path)
 * whose default export is a `Transcriber` (`{ transcribe(audio: Uint8Array): Promise<string | undefined> }`); it is loaded on first use.
 */
const configured = moduleTranscriber(() => process.env.UI_TESTS_TRANSCRIBER)

const handler = createCollector({
  store: getStore,
  transcriber: configured,
  ...(process.env.UI_TESTS_CLI_SECRET && { cliSecret: process.env.UI_TESTS_CLI_SECRET }),
})

/** The collector as route handlers: mount them at `/api/ui-tests/[[...path]]`. */
export const GET = (request: Request) => handler(request)
export const POST = (request: Request) => handler(request)
export { canRead, combine, optimisable } from '../consumers.ts'

/** The video of a person in a shared report: mount at `app/rv/[...path]/route.server.ts`. */
export const GET_REPORT_VIDEO = async (request: Request) =>
  reportVideo(request, { store: await getStore(), ...(process.env.UI_TESTS_SHARE_SECRET && { shareSecret: process.env.UI_TESTS_SHARE_SECRET }) })
