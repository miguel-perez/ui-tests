import Link from 'next/link'
import { ui, footer } from '../lib/copy'
import { Icon } from './icon'
import { PageTexture } from './page-texture'

export const repository = 'https://github.com/miguel-perez/ui-tests'

function Wordmark() {
  return <Link className="wordmark" href="/" aria-label="ui-tests home"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="12" strokeLinejoin="miter" strokeLinecap="butt" aria-hidden="true"><rect x="20" y="20" width="60" height="60" /><path d="M50 20 V50 H80" /></svg><span>{ui.wordmark}<em>.</em></span></Link>
}

/**
 * The landing page's shell: the header, the texture and the footer. The texture runs
 * behind all of it (issue #51); the footer closes every page: the wordmark in the first five columns, the three links in the right
 * seven, the last flush with the container's right edge.
 */
export function SiteShell({ children }: { children: React.ReactNode }) {
  return <div className="site">
    <a className="skip-link" href="#content">{ui.skip}</a>
    <PageTexture />
    <header className="site-header"><nav className="site-width" aria-label={ui.navigation}>
      <Wordmark />
      <div className="nav-links"><a href={repository}><Icon name="github" />{ui.github}</a></div>
    </nav></header>
    {children}
    <footer className="site-footer"><div className="site-width split">
      <Wordmark />
      <nav aria-label={footer.label}><ul className="footer-links">
        <li><a href="https://miguel.design">{footer.site}</a></li>
        <li><a href={`${repository}/blob/main/LICENSE`}>{footer.licence}</a></li>
        <li><a href={`${repository}/issues/new`}>{footer.report}</a></li>
      </ul></nav>
    </div></footer>
  </div>
}
