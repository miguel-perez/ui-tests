import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Tag } from '../components/tag'
import { promise, intro } from '../lib/copy'
import './globals.css'
/** Fira, latin, kept in the repository (OFL, beside the files) so the build fetches nothing; next/font names each family after its const. */
const Fira_Sans = localFont({
  src: [{ path: './fonts/fira-sans-400.woff2', weight: '400' }, { path: './fonts/fira-sans-500.woff2', weight: '500' }, { path: './fonts/fira-sans-600.woff2', weight: '600' }],
  variable: '--font-sans', display: 'swap', adjustFontFallback: false,
})
const Fira_Code = localFont({ src: './fonts/fira-code.woff2', weight: '400 500', variable: '--font-mono', display: 'swap', adjustFontFallback: false })
export const metadata: Metadata = { title: `ui-tests — ${promise}`, description: intro }
/** The site is light only (issue #43): form controls, scrollbars and the overscroll ground follow, whatever the system setting. */
export const viewport: Viewport = { colorScheme: 'light' }
/** Root layout. The tag in the head does nothing and loads nothing unless a person is in an attempt. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${Fira_Sans.variable} ${Fira_Code.variable}`}>
      <head><Tag /></head>
      <body>{children}</body>
    </html>
  )
}
