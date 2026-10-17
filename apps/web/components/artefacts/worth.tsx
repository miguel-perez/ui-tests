'use client'
import { useState, type CSSProperties } from 'react'
import { worth } from '../../lib/copy'
import { reckon, tidy, type Given } from '../../lib/worth'

const defaults = Object.fromEntries(Object.entries(worth.given).map(([key, field]) => [key, field.value])) as Given

/**
 * What a run is worth (design/artefacts/roi-section.html; docs/discovery/roi-research.md; issue #53): the heading in the first five
 * columns and, in the right seven with no lead, the one sentence, its arithmetic and the two sources. The four given numbers in the
 * arithmetic are fields set as its code, each as wide as what it holds; the derived numbers and the sentence follow every keystroke.
 * Nothing is stored: a reload restores the defaults. No figure and no calculator.
 */
export function Worth() {
  const [given, setGiven] = useState(defaults)
  const shown = reckon(given)
  const field = (key: keyof Given) => <input id={`worth-${key}`} type="text" inputMode="decimal" value={given[key]} size={worth.given[key].value.length} aria-label={worth.given[key].label}
    style={{ '--n': Math.max(1, given[key].length) } as CSSProperties}
    onChange={event => { const value = event.target.value; setGiven(now => ({ ...now, [key]: value })) }}
    onBlur={event => { const value = tidy(event.target.value, key); setGiven(now => ({ ...now, [key]: value })) }} />
  return <section className="block worth" aria-labelledby="worth" data-artefact="worth" data-section="worth">
    <header className="section-head">
      <h2 id="worth" data-heading>{worth.heading}</h2>
      <div className="worth-claim" data-lead>
        <p className="worth-say">Five people cost about <b>${shown.price}</b>, about <span className="worth-time">{shown.time}</span> of a US developer&apos;s time. If one problem they show you would have taken longer than that to find from bug reports, reproduce and fix after release, the run has paid for itself.</p>
        <div className="worth-note">
          <p className="worth-arithmetic">The arithmetic: <code>${field('pay')} ÷ {field('hours')} h = ${shown.wage}</code> an hour in wages. Wages are <code>{field('share')}%</code> of what employers pay, so about <code>${shown.rate}</code> an hour. <code>${field('price')} ÷ ${shown.rate} = {shown.hours} h</code>, about <span className="worth-time">{shown.time}</span>.</p>
          <p className="worth-sources">{worth.sources.map(source => <a key={source.href} href={source.href}>{source.name}</a>)}</p>
        </div>
      </div>
    </header>
  </section>
}
