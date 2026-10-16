import Link from 'next/link'
import { ui } from '../lib/copy'

export const repository = 'https://github.com/miguel-perez/ui-tests'

/** Shared by the landing page and guide, leaving participant surfaces independent. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return <>
    <a className="skip-link" href="#content">{ui.skip}</a>
    <header className="site-header"><nav className="site-width" aria-label={ui.navigation}>
      <Link className="wordmark" href="/" aria-label="ui-tests home"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="12" strokeLinejoin="miter" strokeLinecap="butt" aria-hidden="true"><rect x="20" y="20" width="60" height="60" /><path d="M50 20 V50 H80" /></svg><span>{ui.wordmark}<em>.</em></span></Link>
      <div className="nav-links"><Link href="/docs/getting-started">{ui.guide}</Link><a href={repository}>{ui.github}<span aria-hidden="true"> ↗</span></a></div>
    </nav></header>
    {children}
  </>
}
