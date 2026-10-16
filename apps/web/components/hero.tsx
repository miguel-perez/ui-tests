import type { ReactNode } from 'react'
import { HeroBackdrop } from './hero-backdrop'
import { TerminalWindow } from './artefacts/terminal-window'
import { Caption } from './site/caption'

/** Claim: headline and standfirst in 7 columns, the hero artefact in 5 with its caption under it; the session and texture sit behind. */
export function Hero({ headline, standfirst, actions, fineprint, caption }: { headline: string; standfirst: string; actions: ReactNode; fineprint: string; caption: string }) {
  return <section className="hero" aria-labelledby="promise">
    <HeroBackdrop />
    <div className="site-width hero-grid">
      <div className="hero-copy"><h1 id="promise">{headline}</h1><p className="standfirst">{standfirst}</p>{actions}<p className="fineprint">{fineprint}</p></div>
      <div className="hero-artefact"><TerminalWindow typing /><Caption text={caption} /></div>
    </div>
  </section>
}
