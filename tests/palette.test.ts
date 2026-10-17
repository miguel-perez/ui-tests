import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { texture } from '../apps/web/lib/texture'

function luminance(hex: string) {
  const rgb = hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05) }
// The tokens' own floors are in tests/contrast.test.ts, read from design/artefacts/tokens.css.
const tokenFile = await readFile('design/artefacts/tokens.css', 'utf8')
const themes = {
  light: Object.fromEntries([...(/^:root \{([^}]*)\}/m.exec(tokenFile)![1]).matchAll(/--([\w-]+): (#[\da-f]{6})/g)].map(match => [match[1], match[2]])),
  dark: Object.fromEntries([...(/^:root\[data-theme="dark"\] \{([^}]*)\}/m.exec(tokenFile)![1]).matchAll(/--([\w-]+): (#[\da-f]{6})/g)].map(match => [match[1], match[2]])),
}

it('draws the texture in the line token and keeps the hero copy AA over its strongest pixel, in both themes', () => {
  expect(texture.token).toBe('--line')
  const channels = (hex: string) => hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16))
  for (const [theme, tokens] of Object.entries(themes)) {
    const stroke = channels(tokens.line), canvas = channels(tokens.canvas)
    const strongest = '#' + canvas.map((value, i) => Math.round(value + (stroke[i] - value) * texture.maxAlpha).toString(16).padStart(2, '0')).join('')
    // Over the texture the hero sets type in ink and muted, and links in the accent; everything else sits on an opaque window or button.
    for (const text of ['ink', 'muted', 'accent']) expect(contrast(tokens[text], strongest), `${text} over the texture, ${theme}`).toBeGreaterThanOrEqual(4.5)
  }
})

it('draws the participant chrome as the inverse of its host, with every rendered pair at its floor', async () => {
  const { chromeTheme, weekboardChrome, parseColour, contrast } = await import('../packages/ui-tests/src/player-styles')
  const css = await readFile('apps/web/app/globals.css', 'utf8')
  // The theme is the token block's; no component carries a theme class of its own.
  expect(css).not.toMatch(/theme-light|--light-/)
  const solid = (value: string, under: string) => {
    const m = /rgba\((\d+), (\d+), (\d+), ([\d.]+)\)/.exec(value)
    if (!m) return parseColour(value)!
    const base = parseColour(under)!
    return [1, 2, 3].map(i => Math.round(base[i - 1] + (Number(m[i]) - base[i - 1]) * Number(m[4]))) as [number, number, number]
  }
  const pairs = (theme: ReturnType<typeof chromeTheme>) => ({
    text: contrast(parseColour(theme.ink)!, parseColour(theme.surface)!),
    dim: contrast(solid(theme.dim, theme.surface), parseColour(theme.surface)!),
    onAccent: contrast(parseColour(theme.accentInk)!, parseColour(theme.accent)!),
    accent: contrast(parseColour(theme.accent)!, parseColour(theme.surface)!),
  })
  // Weekboard: dark chrome on the light app, the mint accent its author sets, never the app's orange.
  const weekboard = chromeTheme(weekboardChrome)
  expect(weekboard).toMatchObject({ surface: '#2c3353', ink: '#e1e2e7', accent: '#5fe3c0', step: '#5fe3c0' })
  // The site itself, as a host: dark chrome on the light page; without an accent, the chrome's own text colour.
  const site = chromeTheme({ hostInk: 'rgb(17, 17, 17)', hostBackground: 'rgb(246, 246, 246)' })
  expect(site).toMatchObject({ surface: '#111111', ink: '#f6f6f6', accent: '#f6f6f6' })
  // And on the dark alternate: light chrome on the dark page.
  expect(chromeTheme({ hostInk: 'rgb(192, 202, 245)', hostBackground: 'rgb(26, 27, 38)' })).toMatchObject({ surface: '#c0caf5', ink: '#1a1b26', accent: '#1a1b26' })
  // A white page with black text, an accent too faint to see, and a host whose own pair fails: each falls back, never below a floor.
  const faint = chromeTheme({ hostInk: '#000000', hostBackground: '#ffffff', accent: '#2a2a2a' })
  expect(faint.accent).toBe('#ffffff')
  const unreadable = chromeTheme({ hostInk: '#777777', hostBackground: '#888888', accent: '#5fe3c0' })
  expect(unreadable.surface).toBe('#2c3353')
  for (const theme of [weekboard, site, faint, unreadable, chromeTheme(), chromeTheme({ hostBackground: 'rgba(0, 0, 0, 0)' })]) {
    const measured = pairs(theme)
    expect(measured.text, JSON.stringify(theme)).toBeGreaterThanOrEqual(4.5)
    expect(measured.dim, JSON.stringify(theme)).toBeGreaterThanOrEqual(4.5)
    expect(measured.onAccent, JSON.stringify(theme)).toBeGreaterThanOrEqual(4.5)
    expect(measured.accent, JSON.stringify(theme)).toBeGreaterThanOrEqual(3)
  }
})
