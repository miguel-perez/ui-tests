import { Prose } from './code'

/** Section: the heading in 5 columns and the lead in 7, one row, 96px above and 48px below. Never a side caption. */
export function SectionHead({ id, heading, lead }: { id: string; heading: string; lead: string }) {
  return <header className="section-head"><h2 id={id}>{heading}</h2><p><Prose text={lead} /></p></header>
}
