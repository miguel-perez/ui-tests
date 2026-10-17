import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SiteShell } from '../../../../components/site-shell'
import { AttemptView } from '../../../../components/artefacts/attempt-view'
import { run } from '../../../../lib/attempts'
import { attemptPath, reportPath } from '../../../../lib/pull-request'
import { shared, verify } from '../../../../lib/share'

export const metadata: Metadata = { title: `Attempt · ${run.goal} · run ${run.run}`, robots: { index: false, follow: false } }
export const generateStaticParams = () => run.attempts.map(entry => ({ run: run.run, person: entry.id }))

/** One person's attempt, the page each person in the report links to: everything about one person is here, and nowhere else. */
export default async function Attempt({ params, searchParams }: { params: Promise<{ run: string; person: string }>; searchParams: Promise<{ s?: string }> }) {
  const [{ run: id, person }, { s }] = await Promise.all([params, searchParams])
  const entry = run.attempts.find(candidate => candidate.id === person)
  if (id !== run.run || !entry) notFound()
  const heading = <><h1 className="report-title">{entry.person}, {run.goal}</h1><h2 className="sr-only">The attempt</h2></>
  if (s !== undefined) {
    if (!verify(attemptPath(entry.number), s)) notFound()
    return <main id="content" className="report-page shared"><div className="report-column"><p className="report-back"><Link href={shared(reportPath)!}>The report</Link></p>{heading}<AttemptView id={entry.id} /></div></main>
  }
  return <SiteShell><main id="content" className="report-page"><div className="report-column"><p className="report-back"><Link href={reportPath}>The report</Link></p>{heading}<AttemptView id={entry.id} /></div></main></SiteShell>
}
