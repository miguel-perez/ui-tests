import { buildRecord } from '../record/build.ts'
import { reportDocument } from '../report/document.ts'
import { signedUrl, verifyPath } from '../report/sign.ts'
import type { RunStore } from '../store/types.ts'
import { buildTrace } from '../trace/build.ts'
import type { Bundles } from './bundles.ts'
import { sharedVideoUrl } from './video.ts'

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

/**
 * The shared report: `/r/<run>` is the whole report and `/r/<run>/p<n>` one person. Each answers only to its own signature (`?sig=`,
 * HMAC-SHA256 of the path under `shareSecret`) and is a 404 otherwise, without the secret, for a run that does not exist, and for an
 * agent run, whose report has its own address. It is built from the run record, which holds nothing the author keeps private.
 */
export async function reportResponse(request: Request, options: { store: RunStore; shareSecret?: string; bundles: Bundles }): Promise<Response> {
  const { store, shareSecret: secret } = options
  const url = new URL(request.url)
  if (!secret || !verifyPath(url.pathname, url.searchParams.get('sig'), secret)) return notFound()
  let segments: string[]
  try { segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent) } catch { return notFound() }
  const [prefix, run, who, ...rest] = segments
  const person = who === undefined ? undefined : /^p([1-9]\d{0,5})$/.exec(who)?.[1]
  if (prefix !== 'r' || !run || rest.length > 0 || (who !== undefined && person === undefined)) return notFound()
  const row = await store.getRun(run)
  if (!row || row.actor === 'agent') return notFound()
  const record = await buildRecord(store, run)
  const n = person === undefined ? undefined : Number(person)
  if (n !== undefined && (record.attempts[n - 1]?.status ?? 'created') === 'created') return notFound()
  const asked = url.searchParams.get('at')
  const at = asked !== null && asked !== '' && Number.isFinite(Number(asked)) ? Number(asked) : undefined
  const html = reportDocument({
    record,
    link: (path) => signedUrl(path, secret),
    video: (who, segment) => `${sharedVideoUrl(run, who, secret)}&s=${segment}`,
    replayScript: `/ui-tests/assets/${options.bundles.replay}`,
    ...(n !== undefined && { person: n, trace: await buildTrace(store, run) }),
    ...(at !== undefined && { at }),
  })
  return html === undefined ? notFound() : new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
