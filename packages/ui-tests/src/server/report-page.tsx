import { notFound } from 'next/navigation'
import { AttemptReplay } from '../report/attempt-replay.tsx'
import { signedUrl, verifyPath } from '../report/sign.ts'
import { ReportView } from '../report/view.tsx'
import { buildRecord } from '../record/build.ts'
import { buildTrace } from '../trace/build.ts'
import { momentLabel } from '../trace/reel.ts'
import { getStore } from './store.ts'

type Params = Promise<{ path: string[] }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

/** The path being asked for, and the part of it that names the run and optionally one person. Notfound unless the signature holds. */
async function authorised(params: Params, searchParams: SearchParams): Promise<{ run: string; person?: number; secret: string }> {
  const secret = process.env.UI_TESTS_SHARE_SECRET
  const { path } = await params
  const { sig } = await searchParams
  const segments = path.map((part) => { try { return decodeURIComponent(part) } catch { return '' } })
  if (!secret || !verifyPath(`/r/${path.join('/')}`, typeof sig === 'string' ? sig : null, secret)) notFound()
  const [run, who, ...rest] = segments
  const person = who === undefined ? undefined : /^p([1-9]\d{0,5})$/.exec(who)?.[1]
  if (!run || rest.length > 0 || (who !== undefined && person === undefined)) notFound()
  return { run, secret, ...(person !== undefined && { person: Number(person) }) }
}

/** The page's title is the study's name; it never carries the name of the site that serves it. */
export async function reportMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { run } = await authorised(params, searchParams)
  const row = await (await getStore()).getRun(run)
  if (!row) notFound()
  return { title: `Report · ${row.compiled.name}`, description: 'A usability report.', robots: { index: false, follow: false } }
}

/**
 * The shared report: mount it at `app/r/[...path]/page.server.tsx`. `/r/<run>` is the whole report and `/r/<run>/p<n>` one person; each
 * answers only to its own signature (`?sig=`, HMAC-SHA256 of the path under `UI_TESTS_SHARE_SECRET`) and is a 404 otherwise, without the
 * secret set, or for a run that does not exist. It is built from the run record, which holds nothing the author keeps private.
 */
export async function ReportPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { run, person, secret } = await authorised(params, searchParams)
  const store = await getStore()
  if (!(await store.getRun(run))) notFound()
  const record = await buildRecord(store, run)
  const link = (path: string) => signedUrl(path, secret)
  if (person === undefined) return <ReportView record={record} link={link} />

  const attempt = record.attempts[person - 1]
  if (!attempt || attempt.status === 'created') notFound()
  const item = (await buildTrace(store, run)).attempts[person - 1]
  const asked = (await searchParams).at
  const at = typeof asked === 'string' && asked !== '' ? Number(asked) : NaN
  const begun = item?.replay?.length ? (item.replay[0]!.data as { timestamp?: number }).timestamp : undefined
  const replay = item?.replay && (
    <AttemptReplay
      events={item.replay.map((event) => event.data)}
      moments={item.reel.map((moment) => ({ start: moment.start, end: moment.end, label: momentLabel(moment) }))}
      {...(Number.isFinite(at) && { startAt: at })}
    />
  )
  return <ReportView record={record} attemptIndex={person - 1} link={link} replay={replay} {...(Number.isFinite(at) && begun !== undefined && { moment: Math.max(0, at - begun) })} />
}
