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
    for (const text of ['ink', 'muted', 'moment', 'deviation', 'dead', 'pause', 'done', 'note']) {
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
  for (const text of ['ink', 'muted', 'moment', 'deviation', 'dead', 'pause', 'done', 'note']) {
    expect(contrast(tokens[text], strongest), `${text} over the texture`).toBeGreaterThanOrEqual(4.5)
  }
})
