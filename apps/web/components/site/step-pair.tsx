import type { ReactNode } from 'react'

/**
 * Step, on the page grid: the number and title take the first 5 columns, sticky; the step's sentence of context (its lead), what you
 * type and what you see take the right 7, one under the other, so every surface in a step is a figure in the right seven.
 */
export function StepPair({ id, number, title, intro, type, see, typeLabel = 'You type', seeLabel = 'You see' }: { id: string; number: string; title: string; intro?: ReactNode; type: ReactNode; see: ReactNode; typeLabel?: string; seeLabel?: string }) {
  return <section className="step split" id={id} aria-labelledby={`${id}-title`} data-section={id}>
    <h2 id={`${id}-title`} data-heading><span className="step-number">{number}</span>{title}</h2>
    <div className="step-body">
      {intro && <div className="step-intro" data-lead>{intro}</div>}
      <div className="step-type"><p className="step-label">{typeLabel}</p>{type}</div>
      <div className="step-see"><p className="step-label">{seeLabel}</p>{see}</div>
    </div>
  </section>
}
