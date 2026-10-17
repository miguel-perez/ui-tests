import { Icon } from '../icon'

type Check = { name: string; summary: string; state: 'issue' | 'pass'; link: string }
const checks: Check[] = [
  { name: 'ui-tests', summary: 'Reached the goal: 2 of 5 · 4 problems found', state: 'issue', link: '#findings' },
  { name: 'preview', summary: 'Deployment ready', state: 'pass', link: '#findings' },
  { name: 'tests', summary: '212 passed', state: 'pass', link: '#findings' },
]

/** Check: one row of GitHub's checks box. */
function CheckRow({ name, summary, state, link }: Check) {
  return <div className="check-row"><span className={state === 'issue' ? 'issue-symbol' : 'check-pass'}><Icon name={state} /></span><span><strong>{name}</strong> <span className="check-summary">· {summary}</span></span><a href={link} aria-label={`${name} details`}>Details</a></div>
}

/** ChecksBox: the pull request's checks, drawn as GitHub's chrome in the site's neutrals: a white window on the canvas, the data its only colour. */
export function ChecksBox() {
  return <div className="window checks-box" data-artefact="checks-box"><div className="window-chrome"><h3><span className="check-pass"><Icon name="pass" /></span>All checks have passed</h3><span className="example-label">Example run</span></div>{checks.map(check => <CheckRow key={check.name} {...check} />)}</div>
}
