import type { ReactNode } from 'react'

/** Step: the number and title span both halves above; what you type takes 6 columns, what you see the other 6, in one row. */
export function StepPair({ id, number, title, intro, type, see, typeLabel = 'You type', seeLabel = 'You see' }: { id: string; number: string; title: string; intro?: ReactNode; type: ReactNode; see: ReactNode; typeLabel?: string; seeLabel?: string }) {
  return <section className="step" id={id} aria-labelledby={`${id}-title`}>
    <header className="step-head"><span className="step-number">{number}</span><h2 id={`${id}-title`}>{title}</h2>{intro && <div className="step-intro">{intro}</div>}</header>
    <div className="step-pair">
      <div className="step-type"><p className="step-label">{typeLabel}</p>{type}</div>
      <div className="step-see"><p className="step-label">{seeLabel}</p>{see}</div>
    </div>
  </section>
}
