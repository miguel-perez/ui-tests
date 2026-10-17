import type { ReactNode } from 'react'
import { agent } from '../../lib/copy'
import { SectionHead } from '../site/section-head'

/** The three interfaces as the artefact draws them, in the accent: two ends of a request, a server's two racks, a terminal. */
const icons: Record<string, ReactNode> = {
  api: <><rect x="4" y="12" width="14" height="20" rx="3" /><rect x="26" y="12" width="14" height="20" rx="3" /><path d="M18 18h8M18 26h8" /><path d="M23 15l3 3-3 3M21 29l-3-3 3-3" /></>,
  mcp: <><rect x="6" y="7" width="32" height="10" rx="3" /><rect x="6" y="27" width="32" height="10" rx="3" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="32" r="1.4" fill="currentColor" stroke="none" /><path d="M22 17v10M18 22h8" /></>,
  cli: <><rect x="5" y="8" width="34" height="28" rx="3" /><path d="M12 17l6 5-6 5M21 27h11" /></>,
}
/** A tile's sentence: a word in backticks is the literal the agent meets, set in mono. */
const literal = (text: string) => text.split('`').map((part, index) => index % 2 ? <b key={index}>{part}</b> : part)

/**
 * The agent section (design/artefacts/agents-section.html; docs/discovery/agent-section-research.md; issue #49): the heading with the
 * command under it in the first five columns, the lead in the right seven, then three tiles across twelve columns, one per interface
 * an agent uses: its icon, its name and target, one sentence. No terminal, no code block, no result line.
 */
export function Agents() {
  const [command, ...flag] = agent.command.split(' --')
  return <section className="block agents" aria-labelledby="agents" data-artefact="agents" data-section="agents">
    <SectionHead id="agents" heading={agent.heading} lead={agent.lead} under={<p className="agents-cmd"><span className="agents-prompt" aria-hidden="true">$</span>{command} <span className="agents-flag">--{flag.join(' --')}</span></p>} />
    <ul className="agents-tiles" data-figure>
      {agent.tiles.map(tile => <li className="agents-tile" key={tile.id}>
        <svg className="agents-icon" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[tile.id]}</svg>
        <h3>{tile.name} <span>{tile.target}</span></h3>
        <p>{literal(tile.text)}</p>
      </li>)}
    </ul>
  </section>
}
