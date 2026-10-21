import type { ReactNode } from 'react'
import { hosted } from '../../lib/copy'
import { SectionHead } from '../site/section-head'
import { Caption } from '../site/caption'

/** A URL in the terminal, in the blue the artefact gives it. */
const urls = (text: string) => text.split(/(https:\/\/[^\s"]+)/).map((part, index) => index % 2 ? <span className="u" key={index}>{part}</span> : part)

/** The tag as the artefact colours it: the tag in violet, its attribute in teal, the address in green, the script in ink. */
function Tag({ code }: { code: string }) {
  const [, server, script] = /^<script data-ui-tests="([^"]*)">([\s\S]*)<\/script>$/.exec(code)!
  return <><span className="t">&lt;script</span> <span className="at">data-ui-tests</span>=<span className="s">&quot;{server}&quot;</span><span className="t">&gt;</span>{script}<span className="t">&lt;/script&gt;</span></>
}

/**
 * One line of the terminal as the artefact colours it: the prompt muted with the command's name in green, then what `serve` prints:
 * its label muted with the address in blue, and the tag coloured as the line below draws it.
 */
function line(text: string): ReactNode {
  if (text.startsWith('$ ')) { const [prompt, ...rest] = text.split(' '), name = rest.pop(); return <><span className="p">{prompt}</span> {rest.join(' ')} <span className="a">{name}</span></> }
  if (text.startsWith('<script')) return <Tag code={text} />
  const [, label, value] = /^([^:]+: )(.*)$/.exec(text)!
  return <><span className="k">{label}</span>{urls(value)}</>
}

/** A piece without a number (the artefact draws none): its name and at most 64ch of text over its window, all twelve columns. */
function Piece({ id, name, intro, children }: { id: string; name: string; intro: string; children: ReactNode }) {
  return <section className="piece host-piece" aria-labelledby={`${id}-h`}><div className="piece-intro"><h3 id={`${id}-h`}>{name}</h3><p>{intro}</p></div>{children}</section>
}

/**
 * The host section (design/artefacts/hosted-section.html; docs/discovery/hosting-decision.md; issue #56), the landing's last: the
 * heading in the first five columns and the lead in the right seven, flush to the container's right edge; then "The command" with
 * the terminal exactly as drawn and "The line" with the script tag, both across twelve columns; then the closing line. No dashboard.
 */
export function Host() {
  const { command, line: snippet } = hosted
  return <section className="block host" aria-labelledby="hosted" data-artefact="host" data-section="hosted">
    <SectionHead id="hosted" heading={hosted.heading} lead={hosted.lead} />
    <Piece id="host-command" name={command.name} intro={command.intro}>
      <figure className="window host-window" data-figure>
        <figcaption className="window-chrome"><span>{command.tab[0]}</span><span className="example-label">{command.tab[1]}</span></figcaption>
        <pre className="host-term">{hosted.terminal.split('\n').map((text, index) => <span key={index}>{index > 0 && '\n'}{line(text)}</span>)}</pre>
      </figure>
    </Piece>
    <Piece id="host-line" name={snippet.name} intro={snippet.intro}>
      <figure className="window host-window" data-figure>
        <figcaption className="window-chrome"><span>{snippet.tab[0]}</span><span>{snippet.tab[1]}</span></figcaption>
        <pre className="host-snip"><code><Tag code={hosted.snippet} /></code></pre>
      </figure>
    </Piece>
    <Caption text={hosted.closing} />
  </section>
}
