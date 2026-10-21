/**
 * The participant chrome (docs/discovery/participant-chrome-research.md): the inverse of
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
  // The ink on the accent: the author's own when it reads, else the accent's deep shade (as #14251f on mint), else the best of the chrome's two colours, black and white.
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
/** Weekboard, the demo app under test: its light ink and canvas, its font, the mint accent its author sets and the accent ink on it (`--ch-accent-ink`). */
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

.uit .uit-progress { font-size: 13px; font-weight: 500; color: var(--uit-step); letter-spacing: .02em; font-variant-numeric: tabular-nums; }
.uit .uit-hint { font-size: 14px; color: var(--uit-dim); }

.uit svg { flex-shrink: 0; }
@media (pointer: coarse) { .uit button { min-height: 44px; } }

/* The sheet: the scenario card, the questions, consent and the wait share one surface. */
.uit-sheet { width: 100%; max-width: 520px; padding: 24px 28px 22px; background: var(--uit-surface); color: var(--uit-ink); border-radius: calc(var(--uit-radius) + 4px); box-shadow: 0 0 0 1px var(--uit-hair), 0 18px 40px rgba(21, 26, 33, .35); display: grid; gap: 12px; }

.uit-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 18px; }
.uit-actions > .uit-primary { margin-left: auto; }

/* Consent: what is recorded as a list, each with its state on the right (player-chrome.html). */
.uit-list { list-style: none; display: grid; gap: 6px; font-size: 14px; }
.uit-list li { display: grid; grid-template-columns: 18px 1fr auto; gap: 10px; align-items: baseline; }
.uit-list i { width: 8px; height: 8px; border-radius: 50%; background: var(--uit-accent); display: inline-block; justify-self: center; }
.uit-list i.uit-off { background: none; box-shadow: inset 0 0 0 1px var(--uit-dim); }
.uit-list em { font-style: normal; font-size: 13px; color: var(--uit-dim); }

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

@media (hover: hover) {
  .uit button:not(:disabled):hover { box-shadow: inset 0 0 0 1px var(--uit-dim); }
  .uit .uit-primary:not(:disabled):hover { box-shadow: none; filter: brightness(1.08); }

}
/* A calm move into place; text is never part-transparent, so it always reads at full contrast. */
@keyframes uit-in { from { transform: translateY(12px); } to { transform: none; } }
@keyframes uit-pulse { 50% { opacity: .45; } }
/* Narrow windows and phones: the pill docks across the bottom, the drag handle goes and the task summary folds behind its chevron. */
@media (max-width: 600px) {
  .uit-sheet { padding: 20px; }

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

@media (prefers-reduced-motion: reduce) { .uit *, .uit *::before, .uit *::after { animation: none !important; transition: none !important; } }
`
