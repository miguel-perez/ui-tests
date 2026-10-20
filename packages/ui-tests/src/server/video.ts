import { signedUrl, verifyPath } from '../report/sign.ts'
import { assembleVideo, videoResponse } from '../report/video.ts'
import { mayShow } from '../report/view.tsx'
import { buildRecord } from '../record/build.ts'
import { getStore } from './store.ts'

const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } })

/** The path of a person's video in a shared report. It is signed like the report: `/rv/<run>/p<n>?sig=`. */
export const sharedVideoPath = (run: string, person: number) => `/rv/${encodeURIComponent(run)}/p${person}`
export const sharedVideoUrl = (run: string, person: number, secret: string) => signedUrl(sharedVideoPath(run, person), secret)

/**
 * The video of one person in a shared report: mount at `app/rv/[...path]/route.server.ts`. Answers only to its own signature, only for
 * a person who agreed to their recording being shown, and never for one who withdrew.
 */
export async function reportVideo(request: Request): Promise<Response> {
  const secret = process.env.UI_TESTS_SHARE_SECRET
  const url = new URL(request.url)
  const path = url.pathname
  if (!secret || !verifyPath(path, url.searchParams.get('sig'), secret)) return notFound()
  let segments: string[]
  try { segments = path.split('/').filter(Boolean).map(decodeURIComponent) } catch { return notFound() }
  const [prefix, run, who, ...rest] = segments
  const person = /^p([1-9]\d{0,5})$/.exec(who ?? '')?.[1]
  if (prefix !== 'rv' || !run || !person || rest.length) return notFound()
  const store = await getStore()
  const row = await store.getRun(run)
  if (!row || row.actor === 'agent') return notFound()
  const attempt = (await buildRecord(store, run)).attempts[Number(person) - 1]
  if (!attempt || !mayShow(attempt)) return notFound()
  const stored = (await store.listAttempts(run))[Number(person) - 1]
  const asked = url.searchParams.get('s')
  const video = stored && (await assembleVideo(store, stored, asked === null ? undefined : Number(asked)))
  return video ? videoResponse(video, request.headers.get('range')) : notFound()
}
