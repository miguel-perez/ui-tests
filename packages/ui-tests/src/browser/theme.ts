/**
 * The bar's colours, ported from the participant chrome of the product site (apps/web/components/player/player-styles.ts):
 * the inverse of the host page, opaque, never sampled from a surface under test, with one accent the author sets.
 * No Node imports: this module ships to the browser.
 */

import type { CompiledBrand } from '../schema/compiled.ts'

type Rgb = [number, number, number]

/** Reads `#rgb`, `#rrggbb` or a computed `rgb()` / `rgba()` colour; anything else, or a transparent one, is `undefined`. */
export function parseColour(value: string | undefined): Rgb | undefined {
  if (!value) return undefined
  const text = value.trim().toLowerCase()
  const hexMatch = /^#([\da-f]{3}|[\da-f]{6})$/.exec(text)?.[1]
  if (hexMatch) return (hexMatch.length === 3 ? [...hexMatch].map((c) => c + c) : hexMatch.match(/../g)!).map((part) => parseInt(part, 16)) as Rgb
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(text)
  if (!rgb) return undefined
  const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4])
  return alpha < 1 ? undefined : ([Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map(Math.round) as Rgb)
}
const hex = (colour: Rgb) => '#' + colour.map((value) => value.toString(16).padStart(2, '0')).join('')
const rgba = (colour: Rgb, alpha: number) => `rgba(${colour.join(', ')}, ${alpha})`
const over = (top: Rgb, alpha: number, bottom: Rgb) => top.map((value, i) => Math.round(bottom[i]! + (value - bottom[i]!) * alpha)) as Rgb

/** WCAG relative luminance. */
export function luminance(colour: Rgb): number {
  const [r, g, b] = colour.map((value) => value / 255).map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)) as Rgb
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}
/** WCAG contrast ratio between two opaque colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a)
  const y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Neutral fallbacks when the host's colours cannot be read: a dark bar over a light page, a light bar over a dark one. */
const darkChrome = { surface: [38, 40, 46] as Rgb, ink: [236, 237, 240] as Rgb }
const lightChrome = { surface: [232, 233, 236] as Rgb, ink: [24, 25, 30] as Rgb }
/** Floors nothing can override: 4.5:1 for text, 3:1 for the accent. */
export const floors = { text: 4.5, nonText: 3 } as const

export type ChromeInput = { hostInk?: string; hostBackground?: string; accent?: string; font?: string }
export type ChromeTheme = { surface: string; ink: string; dim: string; hair: string; accent: string; accentInk: string; font: string }

/** The inverse surface: the host's text colour as the surface and its background as the text, falling back when they cannot reach the text floor. */
export function chromeTheme({ hostInk, hostBackground, accent, font }: ChromeInput = {}): ChromeTheme {
  const background = parseColour(hostBackground) ?? ([255, 255, 255] as Rgb)
  const fallback = luminance(background) > 0.18 ? darkChrome : lightChrome
  const inkOfHost = parseColour(hostInk)
  const { surface, ink } = inkOfHost && contrast(inkOfHost, background) >= floors.text ? { surface: inkOfHost, ink: background } : fallback
  let dimAlpha = 0.68
  while (dimAlpha < 1 && contrast(over(ink, dimAlpha, surface), surface) < floors.text) dimAlpha = Math.round((dimAlpha + 0.04) * 100) / 100
  const chosen = parseColour(accent)
  const tone = chosen && contrast(chosen, surface) >= floors.nonText ? chosen : ink
  const deep = tone.map((value) => Math.round(value * 0.17)) as Rgb
  const onAccent =
    contrast(deep, tone) >= floors.text
      ? deep
      : [surface, ink, [0, 0, 0] as Rgb, [255, 255, 255] as Rgb].reduce((best, candidate) => (contrast(candidate, tone) > contrast(best, tone) ? candidate : best))
  return {
    surface: hex(surface),
    ink: hex(ink),
    dim: rgba(ink, Math.min(1, dimAlpha)),
    hair: rgba(ink, 0.16),
    accent: hex(tone),
    accentInk: hex(onAccent),
    font: font?.trim() || 'inherit',
  }
}

/** The theme as inline custom properties for the bar's root. */
export function chromeVars(theme: ChromeTheme): Record<string, string> {
  return Object.fromEntries(Object.entries(theme).map(([name, value]) => [`--uit-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value]))
}

/** The host as the author's brand adjusts it: a colour, an accent or a font the brand sets replaces the host's; what it leaves out is still read from the page. */
export function brandedHost(host: ChromeInput, brand: Pick<CompiledBrand, 'accent' | 'background' | 'text' | 'font'>): ChromeInput {
  return {
    ...host,
    ...(brand.text && { hostInk: brand.text }),
    ...(brand.background && { hostBackground: brand.background }),
    ...(brand.accent && { accent: brand.accent }),
    ...(brand.font && { font: brand.font.family }),
  }
}

/** Reads the host page: its text and background colours, its font, and an accent from `--ui-tests-accent` when the host defines one. */
export function readHost(doc: Document, accent?: string): ChromeInput {
  const view = doc.defaultView
  const body = doc.body
  if (!view || !body) return { accent }
  const style = view.getComputedStyle(body)
  const root = view.getComputedStyle(doc.documentElement)
  const background = parseColour(style.backgroundColor) ? style.backgroundColor : root.backgroundColor
  const variable = style.getPropertyValue('--ui-tests-accent').trim()
  return { hostInk: style.color, hostBackground: background, font: style.fontFamily, accent: accent ?? (variable || undefined) }
}
