import type { Metadata } from 'next'
import { UiTests } from 'ui-tests/next'
import { Fira_Sans, Fira_Code } from 'next/font/google'
import { promise, intro } from '../lib/copy'
import './globals.css'
const sans = Fira_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans', display: 'swap', adjustFontFallback: false })
const mono = Fira_Code({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap', adjustFontFallback: false })
export const metadata: Metadata = { title: `ui-tests — ${promise}`, description: intro }
/** Root layout. Mounts the ui-tests taskbar once so it survives client-side navigation. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>{children}<UiTests /></body></html>
}
