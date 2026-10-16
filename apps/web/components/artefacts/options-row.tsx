import { sources } from '../../lib/copy'
import { Icon } from '../icon'
import { Prose } from '../site/code'
import { InviteLink } from './invite-link'
import { CapControl } from './cap-control'
import { VisitorInvitation } from './visitor-invitation'

const icons = ['link', 'users', 'cursor'] as const
const minis = [InviteLink, CapControl, VisitorInvitation]

/** SourceOption: the name with its icon, the who sentence, the mini UI on the site surface, then cost and timing as a two-item footer. */
function OptionCard({ index }: { index: number }) {
  const [name, who, cost, timing] = sources[index], Mini = minis[index]
  return <article className="option-card" aria-labelledby={`source-${index}`}>
    <h3 id={`source-${index}`}><Icon name={icons[index]} />{name}</h3>
    <p className="option-who"><Prose text={who} /></p>
    <div className="option-mini"><Mini /></div>
    <dl className="option-footer"><div><dt>Cost</dt><dd>{cost}</dd></div><div><dt>Results</dt><dd>{timing}</dd></div></dl>
  </article>
}

/** OptionsRow: three equal cards of 4 columns each in one row. Not a table. */
export function OptionsRow() { return <div className="options-row">{sources.map((_, index) => <OptionCard key={index} index={index} />)}</div> }
