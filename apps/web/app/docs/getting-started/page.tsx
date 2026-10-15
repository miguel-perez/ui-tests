import Link from 'next/link'
import { commands, example } from '../../../lib/copy'
export default function GettingStarted() {
  return <main className="mx-auto max-w-3xl px-6 py-12"><Link className="text-sm font-semibold text-primary" href="/">← ui-tests</Link><h1 className="mt-10 text-4xl font-semibold tracking-tight">Your first local rehearsal</h1><p className="mt-5">Node 22 or newer and a Next.js App Router application are required. Start with yourself in development mode.</p>
    <section className="mt-10"><h2 className="text-2xl font-semibold">1. Install</h2><pre><code>{commands.install}</code></pre></section>
    <section className="mt-10"><h2 className="text-2xl font-semibold">2. Init and mount</h2><pre><code>{commands.init}</code></pre><p>Init writes the config, example test and Vitest exclusion. It preserves existing author files. Mount the integration in your root layout:</p><pre><code>{`import { UiTests } from 'ui-tests/next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<UiTests /></body></html>
}`}</code></pre><p>Mount the player at <code>app/ui-tests/[run]/page.tsx</code>:</p><pre><code>{`import { Player } from 'ui-tests/next'
export default async function Page({ params, searchParams }: {
  params: Promise<{ run: string }>
  searchParams: Promise<{ token?: string }>
}) {
  return <Player runId={(await params).run} token={(await searchParams).token} />
}`}</code></pre><p>Mount the development collector at <code>app/api/ui-tests/route.ts</code>:</p><pre><code>{`import { createCollector } from 'ui-tests/server'
export const runtime = 'nodejs'
export const GET = createCollector()
export const POST = GET`}</code></pre></section>
    <section className="mt-10"><h2 className="text-2xl font-semibold">3. Write the test</h2><p>Save this as <code>landing.ui.test.ts</code>. Write the people’s goal, not instructions about the interface.</p><pre><code>{example}</code></pre><p>Configure the local target in <code>ui-tests.config.ts</code>:</p><pre><code>{`import { defineConfig } from 'ui-tests'
export default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })`}</code></pre></section>
    <section className="mt-10"><h2 className="text-2xl font-semibold">4. Run dev mode</h2><p>Start your app, then run the rehearsal in another terminal from the application directory:</p><pre><code>{`${commands.dev}\n# In another terminal\n${commands.run}`}</code></pre><p>Consent, read the scenario, begin the task and use “I’m done” or “I can’t do this”. Answer the ease and confidence questions even if you stopped.</p><p>To run this repository from a clean clone:</p><pre><code>{`npm ci
npm run dev
# In another terminal
cd apps/web
npx ui-tests`}</code></pre></section>
    <section className="mt-10"><h2 className="text-2xl font-semibold">5. Read the result</h2><p>The CLI runs the outcome against the saved URL and DOM, then opens a trace on a separate local port. The trace includes issue moments, expected and actual evidence, timing and the derived rules. It is never served by your app.</p><p className="my-4 font-semibold">Rehearsal: 0 of 5 planned attempts recorded.</p><p>A rehearsal does not count toward the sample plan. A minutes-only goal produces issues without a result sentence. Stop the viewer with Ctrl+C; local records are in <code>.ui-tests/</code>.</p><pre><code>{`npx ui-tests lint
npx ui-tests verify <run-id>`}</code></pre></section>
  </main>
}
