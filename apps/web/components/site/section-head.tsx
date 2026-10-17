import type { ReactNode } from 'react'
import { Prose } from './code'

/**
 * Section: the heading in the first 5 columns and the lead in the right 7, one row, 96px above and 48px below. Never a side caption.
 * A section may have no lead ("How it works.", issue #49); what sits under the heading (the agent section's command) stays in the five.
 */
export function SectionHead({ id, heading, lead, under }: { id: string; heading: string; lead?: string; under?: ReactNode }) {
  return <header className="section-head">
    {under ? <div className="section-title"><h2 id={id} data-heading>{heading}</h2>{under}</div> : <h2 id={id} data-heading>{heading}</h2>}
    {lead && <p data-lead><Prose text={lead} /></p>}
  </header>
}
