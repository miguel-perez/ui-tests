import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { texture } from '../apps/web/lib/texture'

function luminance(hex: string) {
  const rgb = hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x,y) + .05) / (Math.min(x,y) + .05) }
it('keeps every readable Tokyo Night token AA on both surfaces and reserves comment for decoration', async () => {
  const css = await readFile('apps/web/app/globals.css', 'utf8')
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+): (#[\da-f]{6})/g)].map(match => [match[1], match[2]]))
  for (const background of ['canvas', 'surface']) {
    for (const text of ['ink', 'muted', 'moment', 'path', 'dead', 'pause', 'done', 'note']) {
      expect(contrast(tokens[text], tokens[background]), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast('#9ece6a', tokens[background])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(tokens.comment, tokens[background])).toBeLessThan(4.5)
  }
  expect(css).not.toMatch(/(?:^|[;{]\s*)color:\s*var\(--comment\)/m)
})

it('keeps every text token AA over the strongest pixel of the background texture', async () => {
  const css = await readFile('apps/web/app/globals.css', 'utf8')
  const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+): (#[\da-f]{6})/g)].map(match => [match[1], match[2]]))
  const channels = (hex: string) => hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16))
  const stroke = channels(texture.stroke), canvas = channels(tokens.canvas)
  const strongest = '#' + canvas.map((value, i) => Math.round(value + (stroke[i] - value) * texture.maxAlpha).toString(16).padStart(2, '0')).join('')
  for (const text of ['ink', 'muted', 'moment', 'path', 'dead', 'pause', 'done', 'note']) {
    expect(contrast(tokens[text], strongest), `${text} over the texture`).toBeGreaterThanOrEqual(4.5)
  }
})

it('draws the participant chrome as the inverse of its host, with every rendered pair at its floor', async () => {
  const { chromeTheme, weekboardChrome, parseColour, contrast } = await import('../packages/ui-tests/src/player-styles')
  const css = await readFile('apps/web/app/globals.css', 'utf8')
  // There is no light product theme on the site any more.
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
  // The site itself, as a host: light chrome on the dark page; without an accent, the chrome's own text colour.
  const site = chromeTheme({ hostInk: 'rgb(192, 202, 245)', hostBackground: 'rgb(26, 27, 38)' })
  expect(site).toMatchObject({ surface: '#c0caf5', ink: '#1a1b26', accent: '#1a1b26' })
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
