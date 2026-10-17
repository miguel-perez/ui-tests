/**
 * The participant chrome (docs/discovery/participant-chrome-research.md, design/artefacts/player-chrome.html): the inverse of
 * the host page, opaque, with a hairline and a soft shadow, the host's font and the one accent the author sets. On a light site
 * the chrome is dark, on a dark site it is light, so it never takes the colour of a surface on the page under test and needs no logo.
 */

type Rgb = [number, number, number]
/** Reads `#rgb`, `#rrggbb` or a computed `rgb()` / `rgba()` colour; anything else, or a transparent one, is `undefined`. */
export function parseColour(value: string | undefined): Rgb | undefined {
  if (!value) return undefined
  const text = value.trim().toLowerCase()
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/.exec(text)?.[1]
  if (hex) return (hex.length === 3 ? [...hex].map(c => c + c) : hex.match(/../g)!).map(part => parseInt(part, 16)) as Rgb
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text)
  if (!rgb) return undefined
  const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])
  return alpha < 1 ? undefined : [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map(Math.round) as Rgb
}
const hex = (colour: Rgb) => '#' + colour.map(value => value.toString(16).padStart(2, '0')).join('')
const rgba = (colour: Rgb, alpha: number) => `rgba(${colour.join(', ')}, ${alpha})`
/** The colour seen when `top` at `alpha` is painted over `bottom`. */
const over = (top: Rgb, alpha: number, bottom: Rgb) => top.map((value, i) => Math.round(bottom[i] + (value - bottom[i]) * alpha)) as Rgb
/** WCAG relative luminance. */
export function luminance(colour: Rgb) {
  const [r, g, b] = colour.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return r * .2126 + g * .7152 + b * .0722
}
/** WCAG contrast ratio between two opaque colours. */
export function contrast(a: Rgb, b: Rgb) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }

/** The chrome over a light page when nothing better can be read: Weekboard's ink and canvas, turned over. */
const darkChrome = { surface: [44, 51, 83] as Rgb, ink: [225, 226, 231] as Rgb }
/** The chrome over a dark page: the site's canvas as text on a light grey, never white. */
const lightChrome = { surface: [225, 226, 231] as Rgb, ink: [26, 27, 38] as Rgb }
/** Floors the author cannot override: 4.5:1 for text, 3:1 for the accent and the recording dot. */
export const floors = { text: 4.5, nonText: 3 } as const

/** What the chrome is drawn from: the host page's text and background colours, the author's accent (`chrome.accent` in the config) and the ink on it, and the font. */
export type ChromeInput = { hostInk?: string; hostBackground?: string; accent?: string; accentInk?: string; font?: string }
/** Every colour the chrome paints, as CSS custom properties on `.uit`. */
export type ChromeTheme = { surface: string; ink: string; dim: string; hair: string; accent: string; accentInk: string; step: string; rec: string; scrim: string; host: string; font: string }

/**
 * The inverse surface: the host's text colour as the surface and its background as the text. A pair that cannot reach the text
 * floor falls back to the default for the host's lightness. The accent is never sampled from the host; without one the accent is
 * the chrome's own text colour. Text on the accent flips between the chrome's two colours, then black or white.
 */
export function chromeTheme({ hostInk, hostBackground, accent, accentInk, font }: ChromeInput = {}): ChromeTheme {
  const background = parseColour(hostBackground) ?? [255, 255, 255]
  const fallback = luminance(background) > .18 ? darkChrome : lightChrome
  const inkOfHost = parseColour(hostInk)
  const pair = inkOfHost && contrast(inkOfHost, background) >= floors.text ? { surface: inkOfHost, ink: background } : fallback
  const { surface, ink } = pair
  // The dim text is the chrome's text at the lowest alpha that still reads at the text floor.
  let dimAlpha = .68
  while (dimAlpha < 1 && contrast(over(ink, dimAlpha, surface), surface) < floors.text) dimAlpha = Math.round((dimAlpha + .04) * 100) / 100
  const chosen = parseColour(accent)
  const tone = chosen && contrast(chosen, surface) >= floors.nonText ? chosen : ink
  // The ink on the accent: the author's own when it reads, else the accent's deep shade (as the artefacts' #14251f on mint), else the best of the chrome's two colours, black and white.
  const own = parseColour(accentInk), deep = tone.map(value => Math.round(value * .17)) as Rgb
  const onAccent = own && tone === chosen && contrast(own, tone) >= floors.text ? own : contrast(deep, tone) >= floors.text ? deep
    : [surface, ink, [0, 0, 0] as Rgb, [255, 255, 255] as Rgb].reduce((best, candidate) => contrast(candidate, tone) > contrast(best, tone) ? candidate : best)
  const dark = luminance(surface) < .18
  return {
    surface: hex(surface), ink: hex(ink), dim: rgba(ink, Math.min(1, dimAlpha)), hair: rgba(ink, .16),
    accent: hex(tone), accentInk: hex(onAccent),
    // "Task 1 of 1" takes the accent where it reads as text, as player-chrome.html draws it; otherwise the dim text.
    step: contrast(tone, surface) >= floors.text ? hex(tone) : rgba(ink, Math.min(1, dimAlpha)),
    rec: dark ? '#f52a65' : '#c0244b', scrim: rgba(surface, .4), host: hex(background),
    font: font?.trim() || 'inherit',
  }
}
/** The theme as inline custom properties for a `.uit` root. */
export function chromeVars(theme: ChromeTheme) {
  return Object.fromEntries(Object.entries(theme).map(([name, value]) => [`--uit-${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`, value])) as Record<string, string>
}
/** Weekboard, the demo app under test: its light ink and canvas, its font, the mint accent its author sets and the accent ink the artefacts draw on it (`--ch-accent-ink`). */
export const weekboardChrome: ChromeInput = { hostInk: '#2c3353', hostBackground: '#e1e2e7', accent: '#5fe3c0', accentInk: '#14251f', font: '"Fira Sans", sans-serif' }

const defaults = Object.entries(chromeVars(chromeTheme(weekboardChrome))).map(([name, value]) => `${name}: ${value};`).join(' ')

/** One stylesheet for every player surface, scoped to `.uit`, so a host app's styles neither leak in nor need to exist. */
export const playerCss = `
.uit { ${defaults} --uit-radius: 10px; color: var(--uit-ink); font-family: var(--uit-font); font-size: 15px; line-height: 1.5; text-align: left; box-sizing: border-box; letter-spacing: normal; }
.uit *, .uit *::before, .uit *::after { box-sizing: border-box; }
.uit h1, .uit h2, .uit h3, .uit p, .uit fieldset, .uit legend, .uit ul { margin: 0; padding: 0; }
.uit button, .uit input, .uit textarea, .uit select { font: inherit; color: inherit; }
.uit button { cursor: pointer; border: 0; box-shadow: inset 0 0 0 1px var(--uit-hair); background: transparent; border-radius: var(--uit-radius); padding: 0 14px; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 500; font-size: 14px; white-space: nowrap; }
.uit button:disabled { cursor: default; opacity: .55; }
.uit :focus-visible { outline: 2px solid var(--uit-ink); outline-offset: 2px; box-shadow: 0 0 0 2px var(--uit-surface); }
.uit .uit-primary { background: var(--uit-accent); box-shadow: none; color: var(--uit-accent-ink); }
.uit .uit-quiet { box-shadow: none; color: var(--uit-dim); font-weight: 400; }
.uit .uit-link { box-shadow: none; min-height: 32px; padding: 0 4px; color: var(--uit-ink); text-decoration: underline; text-decoration-color: var(--uit-hair); text-underline-offset: 3px; }
.uit .uit-progress { font-size: 13px; font-weight: 500; color: var(--uit-step); letter-spacing: .02em; font-variant-numeric: tabular-nums; }
.uit .uit-ends, .uit .uit-hint { font-size: 14px; color: var(--uit-dim); }
.uit .uit-ends b { font-weight: 500; color: var(--uit-ink); }
.uit .uit-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.uit .uit-error { color: var(--uit-ink); font-size: 14px; }
.uit .uit-error::before { content: '! '; color: var(--uit-rec); font-weight: 600; }
.uit svg { flex-shrink: 0; }
@media (pointer: coarse) { .uit button { min-height: 44px; } }

/* The sheet: the scenario card, the questions, consent and the wait share one surface. */
.uit-sheet { width: 100%; max-width: 520px; padding: 24px 28px 22px; background: var(--uit-surface); color: var(--uit-ink); border-radius: calc(var(--uit-radius) + 4px); box-shadow: 0 0 0 1px var(--uit-hair), 0 18px 40px rgba(21, 26, 33, .35); display: grid; gap: 12px; }
.uit-card { justify-items: start; }
.uit-card .uit-scenario { font-size: 17px; line-height: 1.5; }
.uit-card .uit-primary { margin-top: 6px; justify-self: end; padding: 0 18px; }

/* The bar: one 40px pill, bottom right, the recording state as its leading segment. */
.uit-bar { position: fixed; z-index: 2147483646; right: 16px; display: grid; justify-items: end; gap: 8px; max-width: calc(100vw - 32px); translate: var(--uit-dx, 0) var(--uit-dy, 0); }
.uit-bar.uit-bottom { bottom: max(16px, env(safe-area-inset-bottom)); }
.uit-bar.uit-top { top: 16px; }
.uit-bar.uit-top .uit-task { order: 2; }
.uit-bar.uit-contained { position: absolute; right: 12px; max-width: calc(100% - 24px); }
.uit-bar.uit-contained.uit-bottom { bottom: 12px; }
.uit-bar.uit-hidden { visibility: hidden; }
.uit-pill { min-height: 40px; display: flex; flex-wrap: wrap; align-items: center; padding: 0 6px 0 8px; background: var(--uit-surface); color: var(--uit-ink); border-radius: 20px; box-shadow: 0 0 0 1px var(--uit-hair), 0 8px 24px rgba(21, 26, 33, .28); font-size: 13px; white-space: nowrap; }
.uit-pill .uit-seg { display: flex; align-items: center; gap: 8px; min-height: 40px; }
.uit-pill .uit-seg + .uit-seg { border-left: 1px solid var(--uit-hair); margin-left: 12px; padding-left: 12px; }
.uit-pill button { font-size: 13px; }
.uit-pill .uit-handle { width: 24px; min-height: 40px; padding: 0; box-shadow: none; color: var(--uit-dim); cursor: grab; touch-action: none; }
.uit-pill .uit-handle svg { width: 14px; height: 14px; }
.uit-recseg { font-variant-numeric: tabular-nums; color: var(--uit-dim); font-size: 12px; font-weight: 500; }
.uit-recseg .uit-pause { width: 24px; min-height: 24px; padding: 0; border-radius: 50%; box-shadow: none; color: var(--uit-dim); }
.uit-recseg .uit-pause svg { width: 10px; height: 10px; }
.uit-pill .uit-summary { display: block; max-width: 240px; min-height: 40px; padding: 0; box-shadow: none; border-radius: 0; overflow: hidden; text-overflow: ellipsis; text-align: left; font-weight: 400; line-height: 40px; color: var(--uit-ink); }
.uit-pill .uit-summary b { font-weight: 500; color: var(--uit-step); margin-right: 8px; font-size: 12px; }
.uit-pill .uit-summary::after { content: ' \\203A'; color: var(--uit-dim); }
.uit-pill .uit-summary[aria-expanded="true"]::after { content: ' \\2039'; }
.uit-pill .uit-done, .uit-pill .uit-cant, .uit-pill .uit-confirm button { min-height: 28px; padding: 0 12px; border-radius: 14px; }
.uit-pill .uit-cant { padding: 0 8px; }
.uit-confirm { display: flex; align-items: center; gap: 8px; }
.uit-confirm p { font-weight: 500; padding-right: 4px; }
.uit-task { width: min(420px, calc(100vw - 32px)); padding: 16px 20px; gap: 8px; }
.uit-task p:first-child { font-size: 15px; }
.uit-bar .uit-error, .uit-page > .uit-error { white-space: normal; max-width: 420px; padding: 8px 14px; background: var(--uit-surface); border-radius: var(--uit-radius); box-shadow: 0 0 0 1px var(--uit-hair); }

/* The recording chip on its own, where the bar is not shown: the questions after the task. */
.uit-rec { display: inline-grid; gap: 2px; padding: 8px 14px; background: var(--uit-surface); color: var(--uit-ink); border-radius: 18px; box-shadow: 0 0 0 1px var(--uit-hair), 0 8px 24px rgba(21, 26, 33, .2); font-size: 13px; }
.uit-rec.uit-contained { position: absolute; top: 12px; right: 12px; }
.uit-rec-row { display: flex; align-items: center; gap: 8px; }
.uit-rec time { font-variant-numeric: tabular-nums; font-weight: 500; }
.uit-rec .uit-states { color: var(--uit-dim); font-size: 12px; }
.uit-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--uit-rec); box-shadow: 0 0 0 3px color-mix(in srgb, var(--uit-rec) 20%, transparent); flex-shrink: 0; animation: uit-pulse 2s ease-in-out infinite; }
.uit-dot.uit-paused { background: transparent; box-shadow: inset 0 0 0 1.5px var(--uit-rec); animation: none; }

/* Questions: one per screen, the card's surface, the scale selectable by keyboard, nothing preselected. */
.uit-questions { padding: 22px 28px 20px; }
.uit-questions .uit-q { display: grid; gap: 14px; animation: uit-in 220ms ease-out both; }
.uit-questions legend, .uit-questions .uit-label { font-size: 17px; line-height: 1.35; font-weight: 500; margin-bottom: 4px; }
.uit-questions fieldset { border: 0; min-width: 0; display: grid; gap: 10px; }
.uit-scale { display: grid; grid-template-columns: repeat(var(--uit-points, 7), minmax(0, 1fr)); gap: 4px; }
.uit-scale label { position: relative; display: block; }
.uit-scale input, .uit-choices input { position: absolute; inset: 0; opacity: 0; margin: 0; width: 100%; height: 100%; cursor: pointer; }
.uit-scale span { display: grid; place-items: center; height: 44px; border-radius: 6px; box-shadow: inset 0 0 0 1px var(--uit-hair); font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; }
.uit-scale input:checked + span { background: var(--uit-accent); box-shadow: none; color: var(--uit-accent-ink); }
.uit-scale input:focus-visible + span, .uit-choices input:focus-visible + span { outline: 2px solid var(--uit-ink); outline-offset: 2px; }
.uit-anchors { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; color: var(--uit-dim); }
.uit-choices { display: grid; gap: 4px; }
.uit-choices label { position: relative; display: block; }
/* An option row (player-chrome.html): a hairline row with a ring that fills with the accent when chosen; square for pick-all. */
.uit-choices span { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 7px 11px; border-radius: var(--uit-radius); box-shadow: inset 0 0 0 1px var(--uit-hair); font-size: 14px; }
.uit-choices span::before { content: ''; width: 14px; height: 14px; flex: none; border-radius: 50%; box-shadow: inset 0 0 0 1px var(--uit-dim); }
.uit-choices.uit-multi span::before { border-radius: 3px; }
.uit-choices input:checked + span { box-shadow: inset 0 0 0 1px var(--uit-accent); }
.uit-choices input:checked + span::before { box-shadow: inset 0 0 0 4px var(--uit-accent); }
.uit-questions textarea { display: block; width: 100%; min-height: 96px; padding: 10px 12px; border: 0; box-shadow: inset 0 0 0 1px var(--uit-hair); border-radius: var(--uit-radius); background: transparent; resize: vertical; font-size: 16px; }
.uit-questions textarea::placeholder { color: var(--uit-dim); }
.uit-questions textarea[readonly] { box-shadow: inset 0 0 0 1px var(--uit-dim); }
.uit-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; }
.uit-actions > .uit-primary { margin-left: auto; }
.uit-actions .uit-talk-wrap { flex: 1 1 auto; }
.uit-talk { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 36px; }
.uit-talk .uit-live { display: inline-flex; align-items: center; gap: 8px; font-weight: 500; font-variant-numeric: tabular-nums; }
.uit-talk-consent { display: grid; gap: 12px; padding: 14px; border-radius: var(--uit-radius); box-shadow: inset 0 0 0 1px var(--uit-hair); }
.uit-talk-consent > span { display: flex; flex-wrap: wrap; gap: 8px; }

/* Consent: what is recorded as a list, each with its state on the right (player-chrome.html). */
.uit-list { list-style: none; display: grid; gap: 6px; font-size: 14px; }
.uit-list li { display: grid; grid-template-columns: 18px 1fr auto; gap: 10px; align-items: baseline; }
.uit-list i { width: 8px; height: 8px; border-radius: 50%; background: var(--uit-accent); display: inline-block; justify-self: center; }
.uit-list i.uit-off { background: none; box-shadow: inset 0 0 0 1px var(--uit-dim); }
.uit-list em { font-style: normal; font-size: 13px; color: var(--uit-dim); }
/* The first impression: the page fills the window for half a second, nothing over it. */
.uit-flash { position: fixed; inset: 0; width: 100vw; height: 100vh; border: 0; background: var(--uit-host); visibility: hidden; pointer-events: none; z-index: 1; }
.uit-flash.uit-flash-on { visibility: visible; }
.uit-page > .uit-sheet { position: relative; z-index: 2; }
/* The first click: the page is back and live; the question docks at the bottom so the page stays in view. */
.uit-flash.uit-flash-live { pointer-events: auto; }
.uit-click-layer { position: fixed; inset: 0; z-index: 2; cursor: crosshair; }
.uit-page > .uit-first-click { position: fixed; z-index: 3; left: 50%; bottom: 16px; translate: -50% 0; width: min(520px, calc(100vw - 32px)); padding: 16px 20px; gap: 8px; }
.uit-first-click h1 { font-size: 17px; line-height: 1.35; font-weight: 500; }
.uit-first-click .uit-actions { margin-top: 4px; }

/* The join screen: who asked, how long, what is recorded, then Start (sources-section.html, the link's picture). */
.uit-join { max-width: 460px; }
.uit-join h1, .uit-join h2, .uit-join h3 { font-size: 17px; line-height: 1.35; font-weight: 500; text-wrap: pretty; }
.uit-join > p:not(.uit-progress) { font-size: 15px; line-height: 1.5; text-wrap: pretty; }
.uit-join .uit-actions { margin-top: 4px; }

/* The invitation on a live page: a small card bottom right, on the chrome's surface, two answers (sources-section.html, the visitors' picture). */
.uit-invite { position: fixed; z-index: 2147483646; right: 16px; bottom: max(16px, env(safe-area-inset-bottom)); width: min(320px, calc(100vw - 32px)); padding: 14px 16px; display: grid; gap: 8px; background: var(--uit-surface); color: var(--uit-ink); border-radius: calc(var(--uit-radius) + 4px); box-shadow: 0 0 0 1px var(--uit-hair), 0 10px 28px rgba(21, 26, 33, .3); }
.uit-invite.uit-contained { position: absolute; z-index: 1; right: 16px; bottom: 16px; }
.uit-invite h2 { font-size: 15px; line-height: 1.35; font-weight: 500; text-wrap: pretty; }
.uit-invite p { font-size: 13px; line-height: 1.45; color: var(--uit-dim); text-wrap: pretty; }
.uit-invite-actions { display: flex; gap: 8px; margin-top: 2px; }
.uit-invite-actions button { min-height: 32px; font-size: 13px; }
@container (max-width: 600px) { .uit-invite.uit-contained { left: 8px; right: 8px; width: auto; } }
/* The player page: consent, the card, the questions and the upload wait, centred on the host's own background. */
.uit-page { min-height: 100vh; background: var(--uit-host); display: grid; place-items: center; padding: 48px 16px; }
.uit-consent { max-width: 520px; }
.uit-consent h1, .uit-page > .uit-questions h1, .uit-wait h1 { font-size: 19px; line-height: 1.3; font-weight: 500; text-wrap: balance; }
.uit-stack { display: grid; gap: 16px; justify-items: center; width: 100%; }
.uit-wait { max-width: 520px; }

@media (hover: hover) {
  .uit button:not(:disabled):hover { box-shadow: inset 0 0 0 1px var(--uit-dim); }
  .uit .uit-primary:not(:disabled):hover { box-shadow: none; filter: brightness(1.08); }
  .uit .uit-quiet:not(:disabled):hover, .uit-pill .uit-handle:hover, .uit-recseg .uit-pause:hover { box-shadow: none; background: var(--uit-hair); color: var(--uit-ink); }
  .uit-pill .uit-summary:not(:disabled):hover { box-shadow: none; text-decoration: underline; text-decoration-color: var(--uit-hair); text-underline-offset: 3px; }
  .uit .uit-link:hover { box-shadow: none; text-decoration-color: currentColor; }
  .uit-scale label:hover span, .uit-choices label:hover span { box-shadow: inset 0 0 0 1px var(--uit-dim); }
}
/* A calm move into place; text is never part-transparent, so it always reads at full contrast. */
@keyframes uit-in { from { transform: translateY(12px); } to { transform: none; } }
@keyframes uit-pulse { 50% { opacity: .45; } }
/* Narrow windows and phones: the pill docks across the bottom, the drag handle goes and the task summary folds behind its chevron. */
@media (max-width: 600px) {
  .uit-sheet { padding: 20px; }
  .uit-bar:not(.uit-contained) { left: 8px; right: 8px; max-width: none; justify-items: stretch; }
  .uit-bar:not(.uit-contained).uit-bottom { bottom: max(8px, env(safe-area-inset-bottom)); }
  .uit-bar:not(.uit-contained) .uit-pill { justify-content: space-between; padding: 0 6px 0 12px; min-height: 48px; }
  .uit-bar:not(.uit-contained) .uit-handle, .uit-bar:not(.uit-contained) .uit-summary b, .uit-bar:not(.uit-contained) .uit-summary-text { display: none; }
  .uit-bar:not(.uit-contained) .uit-summary { min-width: 24px; text-align: center; }
  .uit-bar:not(.uit-contained) .uit-pill { flex-wrap: nowrap; }
  .uit-bar:not(.uit-contained) .uit-seg { gap: 6px; }
  .uit-bar:not(.uit-contained) .uit-cant { padding: 0 4px; }
  .uit-bar:not(.uit-contained) .uit-seg + .uit-seg { margin-left: 6px; padding-left: 6px; }
  .uit-scale span { height: 40px; }
}
@container (max-width: 600px) {
  .uit-bar.uit-contained { left: 8px; right: 8px; max-width: none; justify-items: stretch; }
  .uit-bar.uit-contained.uit-bottom { bottom: 8px; }
  .uit-bar.uit-contained .uit-pill { justify-content: space-between; padding: 0 6px 0 12px; }
  .uit-bar.uit-contained .uit-handle, .uit-bar.uit-contained .uit-summary b, .uit-bar.uit-contained .uit-summary-text { display: none; }
  .uit-bar.uit-contained .uit-summary { min-width: 24px; text-align: center; }
  .uit-bar.uit-contained .uit-pill { flex-wrap: nowrap; }
  .uit-bar.uit-contained .uit-seg { gap: 6px; }
  .uit-bar.uit-contained .uit-cant { padding: 0 4px; }
  .uit-bar.uit-contained .uit-seg + .uit-seg { margin-left: 6px; padding-left: 6px; }
}
/* The 44px touch floor holds inside the pill too: on touch the pill grows to 56px rather than shrink its controls (participant-chrome research, floors). */
@media (pointer: coarse) {
  .uit-bar .uit-pill, .uit-bar:not(.uit-contained) .uit-pill { min-height: 56px; }
  .uit-pill .uit-done, .uit-pill .uit-cant, .uit-pill .uit-confirm button, .uit-recseg .uit-pause { min-height: 44px; border-radius: 22px; }
  .uit-recseg .uit-pause { width: 44px; }
  .uit-pill .uit-summary, .uit-pill .uit-handle { min-height: 44px; min-width: 44px; }
}
@media (prefers-reduced-motion: reduce) { .uit *, .uit *::before, .uit *::after { animation: none !important; transition: none !important; } }
`
