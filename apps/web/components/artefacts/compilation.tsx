import type { ReactNode } from 'react'
import { role, segments } from 'ui-tests/colours'
import { highlight } from '../../lib/highlight'
import { compilation, inviteExample, inviteFile, landing } from '../../lib/copy'
import { Prose } from '../site/code'
import { CopyControl } from './copy-control'
import { Stepped } from './stepped'

/**
 * Compilation (docs/design/site-schema.md; design/artefacts/compile-section.html): what you write, what they see. One 800px reading
 * column: the heading and lead, the three commands as cards, the whole file, then each piece a person meets in order, with only the
 * lines that produce it (original numbers kept, skipped lines as a dots row), the screen in a constant light frame with the chrome
 * at real size, and what comes back. The chrome is drawn as the inverse of the light Weekboard page with its mint accent.
 */
export async function Compilation() {
  const html = await highlight(inviteExample)
  // Shiki writes one `<span class="line">` per source line inside `<code>`, separated by newlines.
  const lines = /<code>([\s\S]*)<\/code>/.exec(html)![1].split('\n')
  const all = lines.map((line, i) => ({ n: i + 1, html: line }))
  return <section className="block compilation" aria-labelledby="what-you-write">
    <div className="compile-column" data-artefact="compilation">
      <header className="compile-head"><h2 id="what-you-write">{compilation.heading}</h2><p>{compilation.lead}</p></header>
      <div className="compile-commands" role="list" aria-label="Three commands">
        {compilation.commands.map(({ command, does, strong }) => <div className="compile-command" role="listitem" key={command}>
          <code>{segments(`$ ${command}`).map((part, i) => <span key={i} style={{ color: role(part.color) }}>{part.text}</span>)}</code>
          <span>{strong ? <>{does.slice(0, does.indexOf(strong))}<b>{strong}</b>{does.slice(does.indexOf(strong) + strong.length)}</> : does}</span>
        </div>)}
      </div>
      <p className="compile-note"><Prose text={compilation.note} /></p>
      <LinesWindow title={inviteFile} legend={`${lines.length} lines`} rows={all} copy={inviteExample} label={inviteFile} />
      <ol className="compile-pieces">
        {compilation.pieces.map(piece => <li className="compile-piece" id={`piece-${piece.id}`} key={piece.id}>
          <div className="compile-intro">
            <h3><span className="compile-n">{piece.n}</span>{piece.name} <span>· {piece.sub}</span></h3>
            {piece.notes.map(note => <p key={note}><Prose text={note} /></p>)}
          </div>
          {piece.lines.length > 0 && <LinesWindow title={inviteFile} legend={piece.fields} rows={excerpt(all, piece.lines)} label={`The lines that produce ${piece.name.toLowerCase()}`} />}
          <div className="compile-main">
            {screens[piece.id]}
            <p className="compile-back"><span>Comes back</span>{piece.returns}</p>
          </div>
        </li>)}
      </ol>
    </div>
  </section>
}

type Row = { n?: number; html: string }
/** Only a piece's lines, with their original numbers; a run of skipped lines becomes one dots row. */
function excerpt(all: Row[], numbers: number[]) {
  const rows: Row[] = []
  let previous: number | undefined
  for (const n of [...numbers].sort((a, b) => a - b)) {
    if (previous !== undefined && n - previous > 1) rows.push({ html: '<span class="line">  ⋯</span>' })
    rows.push(all[n - 1]); previous = n
  }
  return rows
}

/** A code window of numbered lines: the whole file with its copy control, or one piece's lines with the fields they name. At 375 the lines wrap. */
function LinesWindow({ title, legend, rows, copy, label }: { title: string; legend?: string; rows: Row[]; copy?: string; label: string }) {
  return <figure className="window lines-window">
    <figcaption className="window-chrome"><span className="code-tab">{title}</span>{legend && <span className="lines-legend">{legend}</span>}{copy && <CopyControl text={copy} label={title} />}</figcaption>
    <div className="lines-body" tabIndex={0} role="region" aria-label={label}>
      <ol className="shiki">{rows.map((row, i) => <li key={i} className={row.n ? undefined : 'gap'}><span className="ln" aria-hidden="true">{row.n ?? ''}</span><code dangerouslySetInnerHTML={{ __html: row.html }} /></li>)}</ol>
    </div>
  </figure>
}

/** The light host page's address bar, as in every frame. */
function Address({ url }: { url: string }) { return <div className="frame-addr" aria-hidden="true"><i /><i /><i /><span>{url}</span></div> }
/** A frame over the Weekboard board: the board as the participant sees it, dimmed under a sheet when one is open. */
function Board({ label, dim = true, children }: { label: string; dim?: boolean; children: ReactNode }) {
  return <figure className="compile-frame" aria-label={label}>
    {/* The board is the light demo app; the sheet over it carries the words. */}
    <img className="frame-shot" src="/sessions/board.jpg" alt="" />
    {dim && <div className="frame-dim" />}
    <Address url="weekboard.app/board" />
    {children}
  </figure>
}
const Options = ({ items, square = false }: { items: string[]; square?: boolean }) => <ul className={`ch-opts${square ? ' sq' : ''}`}>{items.map(item => <li key={item.replace(/^\*/, '')} className={item.startsWith('*') ? 'on' : undefined}><i aria-hidden="true" />{item.replace(/^\*/, '')}</li>)}</ul>
const Next = ({ label = 'Next' }: { label?: string }) => <button className="ch-btn pri next-step" type="button">{label}</button>
const Talk = () => <span className="ch-talk"><i aria-hidden="true" />Talk instead</span>
const Sheet = ({ step, title, children }: { step: string; title?: string; children: ReactNode }) => <div className="ch-sheet"><span className="ch-step">{step}</span>{title && <h4>{title}</h4>}{children}</div>
const agreement = (chosen: number) => ['Strongly disagree', 'Disagree', 'Neither', 'Agree', 'Strongly agree'].map((text, i) => i === chosen ? `*${text}` : text)

/** Each piece's screen, drawn as player-chrome.html draws it; the stepped ones keep one height while you step through them. */
const screens: Record<string, ReactNode> = {
  consent: <figure className="compile-frame auto" aria-label="Consent screen">
    <Address url="ui-tests.com/t/k2m9" />
    <Sheet step="Weekboard · before you start" title="Weekboard would like to watch you try something on their site.">
      <ul className="ch-list">
        <li><i aria-hidden="true" /><span>What you do on their page: where you click, what you type, which pages you open</span><em>always</em></li>
        <li><i aria-hidden="true" /><span>Your screen, as a video, while you try it</span><em>needed</em></li>
        <li><i className="off" aria-hidden="true" /><span>Your voice, only if you choose to talk later</span><em>optional</em></li>
        <li><i className="off" aria-hidden="true" /><span>Your camera</span><em>off</em></li>
      </ul>
      <p className="ch-small">The website is being tested, not you. You can stop at any time and still be paid $9.</p>
      <div className="ch-actions"><button className="ch-btn quiet" type="button">What is recorded?</button><button className="ch-btn pri" type="button">Continue</button></div>
    </Sheet>
  </figure>,
  screener: <>
    <Stepped label="Screener questions, one at a time" url="ui-tests.com/t/k2m9" what="question">
      <Sheet step="A few questions first · 1 of 6" title="When did you last sign up for a tool to plan work with a team?"><Options items={['*In the past week', 'In the past month', 'Earlier this year', "I haven't"]} /><div className="ch-actions"><span className="ch-small">Pick one.</span><Next /></div></Sheet>
      <Sheet step="A few questions first · 2 of 6" title="Which of these do you use to plan work? Pick all that apply."><Options square items={['Trello', '*Asana', 'Notion', 'Linear', 'Basecamp', 'None of these']} /><div className="ch-actions"><span className="ch-small">Pick all that apply.</span><Next /></div></Sheet>
      <Sheet step="A few questions first · 3 of 6" title="Which of these have you done? Pick all that apply."><Options square items={['Managed a team of more than five', 'Used Weekboard', '*Taken a course on planning or project management', 'None of these']} /><div className="ch-actions"><span className="ch-small">Pick all that apply.</span><Next /></div></Sheet>
      <Sheet step="A few questions first · 4 of 6" title="When did you last need to plan a week with other people?"><Options items={['*This week', 'This month', 'Earlier this year', "I don't"]} /><div className="ch-actions"><span className="ch-small">Pick one.</span><Next /></div></Sheet>
      <Sheet step="A few questions first · 5 of 6" title="How do you do it today?"><Options items={['*A shared document or spreadsheet', 'A planning tool', 'Chat and email', 'In my head']} /><div className="ch-actions"><span className="ch-small">Pick one.</span><Next /></div></Sheet>
      <Sheet step="A few questions first · 6 of 6" title="How much does it matter to you to get this right?"><Options items={['*A lot: it costs me time every week', 'Some', 'Not much']} /><div className="ch-actions"><span className="ch-small">Pick one.</span><Next /></div></Sheet>
    </Stepped>
    <div className="compile-check" aria-label="The sample, worked out on your side" role="group">
      <span className="who">Worked out on your side</span>
      <dl>{compilation.sample.map(([term, value]) => <div key={term}><dt>{term}</dt><dd><Prose text={value} /></dd></div>)}</dl>
    </div>
  </>,
  impression: <Board label="First impression question over the flashed page">
    <Sheet step="You saw a page for half a second" title="What was that page for?">
      <div className="ch-box">In your own words. There is no right answer.</div>
      <div className="ch-actions"><Talk /><button className="ch-btn pri" type="button">Next</button></div>
    </Sheet>
  </Board>,
  card: <Board label="Scenario card over the dimmed page">
    <Sheet step="Task 1 of 1">
      <p>{landing.scenario}</p>
      <p className="ch-small">When you think you&apos;ve finished, press <b>Done</b>. If you get stuck, press <b>I couldn&apos;t do this</b>.</p>
      <div className="ch-actions"><span /><button className="ch-btn pri" type="button">Start task</button></div>
    </Sheet>
  </Board>,
  bar: <>
    <Board label="The page under test with the bar" dim={false}>
      <div className="ch-bar">
        <div className="ch-pill" role="region" aria-label="Weekboard study">
          <span className="grip" aria-hidden="true" />
          <span className="seg rec" role="group" aria-label="Recording, 41 seconds"><span className="dot" aria-hidden="true" /><span>0:41</span><button className="pause" type="button" aria-label="Pause recording"><svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" /><rect x="9.5" y="2" width="3.5" height="12" rx="1" /></svg></button></span>
          <button className="seg task" type="button" aria-expanded="false"><b>Task 1 of 1</b>Invite Sam to the board</button>
          <span className="seg"><button className="done" type="button">Done</button><button className="cant" type="button">I couldn&apos;t do this</button></span>
        </div>
      </div>
    </Board>
    <div className="compile-check" aria-label="The outcome check, run on your side" role="group">
      <span className="who">After Done · runs on your side</span>
      <pre><span className="fn">expect</span><span className="pu">(</span><span className="k">await</span> page.<span className="fn">textContent</span><span className="pu">(</span><span className="s">&apos;main&apos;</span><span className="pu">)).</span><span className="fn">toContain</span><span className="pu">(</span><span className="s">&apos;1 invitation pending&apos;</span><span className="pu">)</span></pre>
      <dl>{compilation.check.map(([who, result, detail]) => <div key={who}><dt>{who}</dt><dd><span className={result === 'Reached' ? 'yes' : 'no'}>{result}</span> · {detail}</dd></div>)}</dl>
    </div>
  </>,
  after: <Stepped label="The questions after the task, one at a time" url="ui-tests.com/t/k2m9" what="question">
    <Sheet step="After the task · 1 of 2" title="Overall, how difficult or easy did you find this task?">
      <ul className="ch-scale" aria-label="1 very difficult to 7 very easy, 3 chosen">{[1, 2, 3, 4, 5, 6, 7].map(n => <li key={n} className={n === 3 ? 'on' : undefined}>{n}</li>)}</ul>
      <div className="ch-anchors"><span>Very difficult</span><span>Very easy</span></div>
      <div className="ch-actions"><span className="ch-small">Press a number key, or tap.</span><Next /></div>
    </Sheet>
    <Sheet step="After the task · 2 of 2" title="What made it difficult?">
      <div className="ch-box filled">Share seemed like the place for people. When I found it I wasn&apos;t sure the first Add did anything, so I pressed it again.</div>
      <div className="ch-actions"><Talk /><Next /></div>
    </Sheet>
    <Sheet step="After all goals · 1 of 3" title="Would Weekboard be useful to you?"><Options items={agreement(3)} /><div className="ch-actions"><span /><Next /></div></Sheet>
    <Sheet step="After all goals · 2 of 3" title="Weekboard is easy to use."><Options items={agreement(1)} /><div className="ch-actions"><span /><Next /></div></Sheet>
    <Sheet step="After all goals · 3 of 3" title="Anything you want to tell Weekboard?">
      <div className="ch-box">Type here, or talk.</div>
      <div className="ch-actions"><Talk /><Next label="Finish" /></div>
    </Sheet>
  </Stepped>,
}
