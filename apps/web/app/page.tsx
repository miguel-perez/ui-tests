import Link from 'next/link'
import { ArrowUpRight, Check, Minus } from 'lucide-react'
import { buttonVariants } from '../components/ui/button'
import { promise, ladder, sections, example, progress } from '../lib/copy'

/** The landing page: the promise, the quality ladder with an example result, the example context, and what you write, what is derived and what you get back. */
export default function Home() {
  return <main className="mx-auto max-w-5xl px-6 py-10 md:px-12 md:py-14">
    <header className="flex items-center justify-between border-b border-border pb-7"><span className="text-xl font-bold tracking-tight">ui-tests<span className="text-primary">.</span></span><span className="rounded-full border border-border px-3 py-1 text-xs">R0 / local rehearsal</span></header>
    <section className="max-w-3xl py-20"><p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">From working software to usable software</p><h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-6xl">Usability testing that runs like your unit tests.</h1><p className="mt-7 max-w-2xl text-xl leading-relaxed">{promise.slice(promise.indexOf('Define'))}</p><p className="mt-6 max-w-2xl text-sm text-foreground/75">{progress}</p></section>
    <section aria-label="The quality ladder" className="border-t border-border">
      {ladder.map(([title, description], index) => <section key={title} className={`grid gap-6 border-b border-border py-9 md:grid-cols-[180px_1fr] ${index === 1 ? 'rounded-lg bg-white px-6 shadow-sm' : ''}`}>
        <div><span className="text-xs font-mono text-primary">0{index + 1}</span><h2 className="mt-2 text-xl font-semibold">{title}</h2></div>
        <div>{index === 1 && <div className="mb-8"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-primary">An example result, before the code</p><ul className="space-y-3 text-sm"><li className="flex gap-3"><Minus aria-hidden size={18}/>Dead click · 00:12 · “Install” did not respond.</li><li className="flex gap-3"><Minus aria-hidden size={18}/>Deviation · 00:28 · A visit to /pricing interrupted the path.</li><li className="flex gap-3"><Check aria-hidden size={18}/>Outcome correct · Final URL: /docs/getting-started.</li></ul><p className="mt-5 border-l-2 border-primary pl-4 font-medium">Rehearsal: 0 of 5 planned attempts recorded.</p></div>}<p className="text-sm text-foreground/80">{description}</p>{index > 1 && <p className="mt-2 text-xs text-foreground/70">Derived now; not run in this slice.</p>}</div>
      </section>)}
    </section>
    <section className="py-14"><p className="text-xs font-semibold uppercase tracking-widest text-primary">landing.ui.test.ts</p><h2 className="mb-6 mt-2 text-2xl font-semibold">A context, a goal, an outcome.</h2><pre><code>{example}</code></pre></section>
    <div className="grid gap-8 md:grid-cols-3">{sections.map(([title, body]) => <section key={title}><h2 className="font-semibold">{title}</h2><p className="mt-3 text-sm text-foreground/80">{body}</p></section>)}</div>
    <p className="mt-12 text-sm text-foreground/75">The record is evidence for ISO 9241-210’s people clauses; it is not a certification.</p>
    <footer className="mt-12 flex flex-wrap items-center justify-between gap-5 border-t border-border py-8"><p className="text-sm">Try the context on yourself first.</p><Link className={buttonVariants()} href="/docs/getting-started">Get started <ArrowUpRight aria-hidden size={16}/></Link></footer>
  </main>
}
