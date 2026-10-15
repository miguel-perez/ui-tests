import type { Metadata } from 'next'
import { UiTests } from 'ui-tests/next'
import './globals.css'
export const metadata: Metadata = { title: 'ui-tests — Usability testing that runs like your unit tests', description: 'Define the goal and the happy path. Learn where people get stuck.' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<UiTests /></body></html>
}
