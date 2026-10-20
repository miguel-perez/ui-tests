import type { Metadata, Viewport } from 'next'
import { Fira_Sans, Fira_Code } from 'next/font/google'
import { UiTests } from 'ui-tests/next'
import { TAG_SCRIPT } from 'ui-tests/tag'
import { promise, intro } from '../lib/copy'
import './globals.css'
const sans = Fira_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap', adjustFontFallback: false })
const mono = Fira_Code({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap', adjustFontFallback: false })
export const metadata: Metadata = { title: `ui-tests — ${promise}`, description: intro }
/** The site is light only (issue #43): form controls, scrollbars and the overscroll ground follow, whatever the system setting. */
export const viewport: Viewport = { colorScheme: 'light' }
/**
 * Root layout. The tag in the head, like `<UiTests />`, renders nothing and loads nothing unless a participant's run is on; where both
 * could show the bar, the tag's does.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <head><script data-ui-tests={process.env.NEXT_PUBLIC_UI_TESTS_URL ?? ''} dangerouslySetInnerHTML={{ __html: TAG_SCRIPT }} /></head>
      <body>{children}<UiTests /></body>
    </html>
  )
}
