'use client'
import { Children, useState, type MouseEvent, type ReactNode } from 'react'

/**
 * A stepped frame (compile-section.html): every step sits in the same grid cell, so the frame keeps the height of its tallest step;
 * the steps not shown stay in the layout, invisible. The sheet's own Next moves on (and back to the first after the last), and a
 * small control under the frame steps either way.
 */
export function Stepped({ label, url, what, children }: { label: string; url: string; what: string; children: ReactNode }) {
  const steps = Children.toArray(children)
  const [current, setCurrent] = useState(0)
  const show = (n: number) => setCurrent(Math.max(0, Math.min(steps.length - 1, n)))
  function next(event: MouseEvent) { if ((event.target as Element).closest('.next-step')) setCurrent(current + 1 > steps.length - 1 ? 0 : current + 1) }
  return <>
    <figure className="compile-frame auto multi" aria-label={label} onClick={next}>
      <div className="frame-addr" aria-hidden="true"><i /><i /><i /><span>{url}</span></div>
      {/* Not the hidden attribute: Tailwind's base layer would take a hidden step out of the layout. Inert and invisible instead. */}
      {steps.map((step, i) => <div className={`car-step${i === current ? ' is-current' : ''}`} key={i} inert={i !== current} aria-hidden={i !== current}>{step}</div>)}
    </figure>
    <div className="stepper" role="group" aria-label={`Step through the ${steps.length} ${what}s`}>
      <button type="button" className="prev" aria-label={`Previous ${what}`} disabled={current === 0} onClick={() => show(current - 1)}>‹</button>
      <span className="where" aria-live="polite"><b>{current + 1}</b> of {steps.length}</span>
      <button type="button" className="nextb" aria-label={`Next ${what}`} disabled={current === steps.length - 1} onClick={() => show(current + 1)}>›</button>
      <span className="dots" aria-hidden="true">{steps.map((_, i) => <i key={i} className={i === current ? 'on' : undefined} />)}</span>
    </div>
  </>
}
