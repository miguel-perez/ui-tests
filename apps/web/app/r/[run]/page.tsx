import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SiteShell } from '../../../components/site-shell'
import { RunReport } from '../../../components/artefacts/run-report'
import { CopyControl } from '../../../components/artefacts/copy-control'
import { run } from '../../../lib/attempts'
import { runFacts } from '../../../lib/copy'
import { reportPath, attemptPath } from '../../../lib/pull-request'
import { shared, verify } from '../../../lib/share'

export const metadata: Metadata = { title: `${runFacts.product} · ${run.goal} · run ${run.run}`, robots: { index: false, follow: false } }
export const generateStaticParams = () => [{ run: run.run }]

/**
 * The run report, /r/<run>, as the list (design/artefacts/run-report-list.html). For the author it sits in the site with a Share control; with a valid
 * signature (`?s=`) it is the shareable page, white-labelled: no ui-tests header, the product's name, and people linking to their
 * signed attempts. An unknown run, or an altered or unsigned share link, is not found.
 */
export default async function Report({ params, searchParams }: { params: Promise<{ run: string }>; searchParams: Promise<{ s?: string }> }) {
  const [{ run: id }, { s }] = await Promise.all([params, searchParams])
  if (id !== run.run) notFound()
  if (s !== undefined) {
    if (!verify(reportPath, s)) notFound()
    const links = Object.fromEntries(run.attempts.map(entry => [entry.number, shared(attemptPath(entry.number))!]))
    return <main id="content" className="report-page shared"><div className="report-column"><RunReport links={links} /></div></main>
  }
  const link = shared(reportPath)
  return <SiteShell><main id="content" className="report-page"><div className="report-column">
    {link && <p className="report-share"><span>Anyone with this link sees the report, without your notes or the check.</span><CopyControl text={link} label="the report link" action={runFacts.share} /></p>}
    <RunReport example />
  </div></main></SiteShell>
}
