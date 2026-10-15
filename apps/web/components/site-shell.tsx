import Link from 'next/link'
import { standard, ui } from '../lib/copy'

export const repository = 'https://github.com/miguel-perez/ui-tests'

/** Shared by the landing page and guide, leaving participant surfaces independent. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return <>
    <a className="skip-link" href="#content">{ui.skip}</a>
    <header className="site-header"><nav className="site-width" aria-label={ui.navigation}>
      <Link className="wordmark" href="/">{ui.wordmark}</Link>
      <div className="nav-links"><Link href="/docs/getting-started">{ui.guide}</Link><a href={repository}>{ui.github}<span aria-hidden="true"> ↗</span></a></div>
    </nav></header>
    {children}
    <footer className="site-footer site-width"><Link className="wordmark" href="/">{ui.wordmark}</Link><p>{standard}</p></footer>
  </>
}
