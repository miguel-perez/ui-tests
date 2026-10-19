'use client'

import { useEffect, useId, useState, type CSSProperties } from 'react'
import { chromeTheme, chromeVars, parseColour, playerCss, type ChromeInput } from './player-styles.ts'
export { weekboardChrome, type ChromeInput } from './player-styles.ts'
import { invitation } from './invitation.ts'

/**
 * Two of the participant's screens, drawn in the sources section: the join sheet a person sees when they open your link, and the
 * invitation a visitor sees on your live site. Built to docs/discovery/participant-overlay-research.md in the chrome of
 * docs/discovery/participant-chrome-research.md and design/artefacts/player-chrome.html. Illustrations: nothing here records.
 */

/** The player's stylesheet, hoisted once into the document head by React however many surfaces render it. */
export function PlayerStyles() { return <style href="ui-tests-player" precedence="medium">{playerCss}</style> }

/**
 * The chrome's colours (participant-chrome research, white-labelling rules): an embedded example names its host page; on a real
 * page they are read from the host once mounted, its text and background turned over, its font, and the author's accent.
 */
export function useChrome(host?: ChromeInput, accent?: string) {
  const [theme, setTheme] = useState(() => host ? chromeTheme({ ...host, accent: accent ?? host.accent }) : undefined)
  useEffect(() => {
    if (host) { setTheme(chromeTheme({ ...host, accent: accent ?? host.accent })); return }
    const body = getComputedStyle(document.body), root = getComputedStyle(document.documentElement)
    const background = [body.backgroundColor, root.backgroundColor].find(value => parseColour(value))
    setTheme(chromeTheme({ hostInk: body.color, hostBackground: background, accent, font: body.fontFamily }))
  }, [host?.hostInk, host?.hostBackground, host?.accent, host?.font, accent])
  return theme && chromeVars(theme) as CSSProperties
}

/**
 * The join screen: the first thing a person sees when they open your link (design/artefacts/sources-section.html, the link's picture).
 * Who asked and for how long, what the attempt is, that the site is tested and not them, what is recorded, then Start. The screener
 * comes next ("A few questions about you first"), then the consent. The screen video line shows only when the run records it.
 */
export function JoinSheet({ name = 'this website', minutes, video = false, onStart, busy = false, level = 2, chrome, accent }: { name?: string; minutes: number; video?: boolean; onStart?: () => void; busy?: boolean; level?: 1 | 2 | 3; chrome?: ChromeInput; accent?: string }) {
  const Heading = (['h1', 'h2', 'h3'] as const)[level - 1]
  // One id per instance, so two join sheets on one page never label each other.
  const title = `${useId()}-join-title`
  return <section className="uit uit-sheet uit-join" style={useChrome(chrome, accent)} data-research-taskbar aria-labelledby={title}>
    <PlayerStyles />
    <p className="uit-progress">{capital(name)} · about {minutes} minutes</p>
    <Heading id={title}>{capital(name)} asked for your help with one thing on their site.</Heading>
    <p>You&apos;ll try it the way you normally would, then answer two short questions. There are no wrong moves. The website is being tested, not you.</p>
    <ul className="uit-list" aria-label="What is recorded">
      <li><i aria-hidden="true" /><span>What you do on their page is recorded</span><em>always</em></li>
      {video && <li><i aria-hidden="true" /><span>Your screen, as a video</span><em>needed</em></li>}
      <li><i className="uit-off" aria-hidden="true" /><span>Your voice, only if you choose to talk</span><em>optional</em></li>
    </ul>
    <div className="uit-actions"><span className="uit-hint">A few questions about you first.</span><button type="button" className="uit-primary" disabled={busy} onClick={onStart}>Start</button></div>
  </section>
}

/**
 * The invitation a visitor sees on your live site when a page has given them trouble twice (PRD 03, intercept; intercept-recruiting.md):
 * why they were asked, how long, that it is paid, and that the site is tested, not them. One string in PRD 03, this player and the demo.
 * "No thanks" is never asked again that visit; nothing from before a yes is kept.
 */
export function Invitation({ name = 'this website', onAccept, onDecline, contained = false, chrome, accent }: { name?: string; onAccept?: () => void; onDecline?: () => void; contained?: boolean; chrome?: ChromeInput; accent?: string }) {
  const body = `${useId()}-invite-body`
  return <section className={`uit uit-invite${contained ? ' uit-contained' : ''}`} style={useChrome(chrome, accent)} data-research-taskbar role="dialog" aria-label={`Invitation from ${capital(name)}`} aria-describedby={body}>
    <PlayerStyles />
    <h2>{invitation.title}</h2>
    <p id={body}>{invitation.body}</p>
    <div className="uit-invite-actions"><button type="button" className="uit-primary" onClick={onAccept}>{invitation.accept}</button><button type="button" onClick={onDecline}>{invitation.decline}</button></div>
  </section>
}

const capital = (text: string) => text ? text[0].toUpperCase() + text.slice(1) : text
