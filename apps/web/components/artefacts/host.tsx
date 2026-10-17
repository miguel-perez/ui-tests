import type { ReactNode } from 'react'
import { hosted } from '../../lib/copy'
import { SectionHead } from '../site/section-head'
import { Caption } from '../site/caption'

/** A URL in the terminal, in the blue the artefact gives it. */
const urls = (text: string) => text.split(/(https:\/\/\S+)/).map((part, index) => index % 2 ? <span className="u" key={index}>{part}</span> : part)

/**
 * One line of the terminal as the artefact colours it: the prompt muted (the artefact's comment grey is under 4.5:1 as text) with the command's name in green, the status
 * muted, then each row's label and value: URLs in blue, the store's name in ink, the hint muted with its command in green.
 */
function line(text: string, index: number): ReactNode {
  if (text.startsWith('$ ')) { const [prompt, ...rest] = text.split(' '), name = rest.pop(); return <><span className="p">{prompt}</span> {rest.join(' ')} <span className="a">{name}</span></> }
  if (index === 1) return <span className="k">{text}</span>
  const [, label, value] = /^(\s+\S+\s+)(.*)$/.exec(text)!
  const store = /^([\w-]+)(,.*)$/.exec(value), hint = /^(.*· )(add one with) (.*)$/.exec(value)
  if (hint) return <>{label}{hint[1]}<span className="k">{hint[2]}</span> <span className="a">{hint[3]}</span></>
  if (store && !value.startsWith('https')) return <>{label}<b>{store[1]}</b>{store[2]}</>
  return <>{label}{urls(value)}</>
}

/** The script tag as the artefact colours it: the tag in violet, its attributes in teal, the URL in green. */
function Snippet({ code }: { code: string }) {
  const [, src] = /src="([^"]+)"/.exec(code)!
  return <code><span className="t">&lt;script</span> <span className="at">src</span>=<span className="s">&quot;{src}&quot;</span> <span className="at">async</span><span className="t">&gt;&lt;/script&gt;</span></code>
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
        <pre className="host-term">{hosted.terminal.split('\n').map((text, index) => <span key={index}>{index > 0 && '\n'}{line(text, index)}</span>)}</pre>
      </figure>
    </Piece>
    <Piece id="host-line" name={snippet.name} intro={snippet.intro}>
      <figure className="window host-window" data-figure>
        <figcaption className="window-chrome"><span>{snippet.tab[0]}</span><span>{snippet.tab[1]}</span></figcaption>
        <pre className="host-snip"><Snippet code={hosted.snippet} /></pre>
      </figure>
    </Piece>
    <Caption text={hosted.closing} />
  </section>
}
