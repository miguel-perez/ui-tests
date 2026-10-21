import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { roles } from '../apps/web/lib/colours'
import { texture } from '../apps/web/lib/texture'
import { mixOklab, over } from './oklab'

/** WCAG relative luminance and contrast of two #rrggbb colours. */
function luminance(hex: string) {
  const rgb = hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
/** The #rrggbb custom properties declared in one block of CSS. */
const declared = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\b/gi)].map(match => [match[1], match[2].toLowerCase()]))

/** The site's token block: the first :root rule of globals.css, the only theme the site carries (issue #43). */
const css = await readFile('apps/web/app/globals.css', 'utf8')
const tokenBlock = /^:root \{[^}]*\}/m.exec(css)![0]
const light = declared(tokenBlock)

/** The text tokens: what the site sets type in on its ground and its windows. */
const text = ['ink', 'muted', 'accent']
/** The data roles: colour that carries meaning (the moment, stop, nothing happened, reached, words) and the code roles. */
const data = ['accent', 'moment', 'blue', 'green', 'teal', 'purple', 'cyan', 'red', 'yellow', 'no', 'yes', 'done', 'note', 'pause', 'deviation', 'dead', 'correct', 'incorrect']

describe('the token block of globals.css', () => {
  it('declares the light theme and names every role', () => {
    expect(tokenBlock).toMatch(/^:root \{\s*color-scheme: light;/)
    expect(light).toMatchObject({ ink: '#111111', accent: '#4b3ff0', line: '#e2e2e2', canvas: '#f6f6f6', surface: '#ffffff' })
    expect(light).toMatchObject({ moment: '#b84d00', pause: '#8b6100', dead: '#bd1f44', done: '#007852', note: '#7a41af', purple: '#7444b4', green: '#27762f', teal: '#00757c' })
    for (const name of [...text, ...data, 'canvas', 'surface', 'raised', 'line', 'comment', 'chip-ink', 'focus']) expect(light[name], name).toMatch(/^#/)
  })

  it('keeps every text token at 4.5:1 on the canvas and the surface, and every data role at 4.5:1 on the canvas', () => {
    for (const ground of ['canvas', 'surface']) for (const name of text) expect(contrast(light[name], light[ground]), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5)
    for (const name of data) expect(contrast(light[name], light.canvas), `${name} on canvas`).toBeGreaterThanOrEqual(4.5)
    // A filled chip, button or mark carries the chip ink at the same floor.
    for (const fill of ['accent', 'moment', 'dead', 'done']) expect(contrast(light['chip-ink'], light[fill]), `chip ink on ${fill}`).toBeGreaterThanOrEqual(4.5)
    // The focus ring is a non-text mark: 3:1 on both grounds.
    for (const ground of ['canvas', 'surface']) expect(contrast(light.focus, light[ground]), `focus on ${ground}`).toBeGreaterThanOrEqual(3)
  })

  it('declares the wave accent as the line with a hint of the accent, and keeps ink and muted at 4.5:1 on it as the texture draws it', async () => {
    // Issue #51: mixed from the line and the accent, so it follows them.
    expect(tokenBlock).toContain('--wave-accent: color-mix(in oklab, var(--line) 82%, var(--accent));')
    const wave = mixOklab(light.line, 0.82, light.accent)
    // A grey with a hint of blue: lighter than the muted text by far, and bluer than the line.
    expect(wave).toBe('#c2c9e9')
    expect(contrast(light.ink, wave), 'ink on the wave accent').toBeGreaterThanOrEqual(4.5)
    // Text never sits on the token at full strength: the texture draws it at most at its top alpha over the canvas, and crossing
    // lines darken rather than compound (apps/web/lib/texture.ts). At that strength muted holds 4.5:1 too.
    const drawn = over(light.canvas, wave, texture.maxAlpha)
    for (const name of ['ink', 'muted']) expect(contrast(light[name], drawn), `${name} on the wave accent as drawn`).toBeGreaterThanOrEqual(4.5)
  })

  it('gives every CLI colour a code role the token block declares', () => {
    for (const name of Object.values(roles)) expect(light[name], name).toMatch(/^#/)
  })
})

describe('the site reads the tokens only', () => {
  it('carries no dark block', () => {
    // Light only, whatever the system setting: no dark block, nothing that switches on the system theme or data-theme.
    expect(css).not.toContain('color-scheme: dark')
    expect(css).not.toMatch(/prefers-color-scheme|data-theme/)
    // Comment is decoration only (it is below the text floor in the light theme): nothing sets type in it.
    expect(css).not.toMatch(/(?:^|[;{]\s*)color:\s*var\(--comment\)/m)
  })

  it('has no literal colour outside the token blocks, except the participant chrome, which is constant over its constant host', async () => {
    const offending: string[] = []
    for (const [, selector, body] of css.replace(tokenBlock, '').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const name = selector.replace(/^[\s\S]*;/, '').trim()
      // The site's own token rule declares custom properties only.
      if (name === ':root' && body.split(';').every(part => !part.trim() || part.trim().startsWith('--'))) continue
      if (name.split(',').every(part => part.trim().startsWith('.ch-'))) continue
      for (const declaration of body.split(';')) {
        const [property] = declaration.split(':')
        if (/mask/.test(property ?? '')) continue
        if (/#[\da-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i.test(declaration)) offending.push(`${name} { ${declaration.trim()} }`)
      }
    }
    expect(offending).toEqual([])
  })

  it('reads neither the system theme nor data-theme anywhere in apps/web outside comments', async () => {
    const offending: string[] = []
    for (const directory of ['apps/web/app', 'apps/web/components', 'apps/web/lib', 'apps/web/scripts', 'apps/web/public']) {
      for (const entry of await readdir(directory, { recursive: true })) {
        if (!/\.(tsx?|m?js|css|html)$/.test(entry)) continue
        const source = (await readFile(path.join(directory, entry), 'utf8')).replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|^\s*\/\/.*$/gm, '')
        for (const match of source.matchAll(/prefers-color-scheme|data-theme|dataset\.theme/g)) offending.push(`${directory}/${entry}: ${match[0]}`)
      }
    }
    expect(offending).toEqual([])
  })

  it('tells the browser the site is light, so form controls, scrollbars and the overscroll ground are light too', async () => {
    expect(await readFile('apps/web/app/layout.tsx', 'utf8')).toMatch(/export const viewport: Viewport = \{ colorScheme: 'light' \}/)
  })

  it('has no literal colour in any component, page or library module', async () => {
    const offending: string[] = []
    for (const directory of ['apps/web/components', 'apps/web/app', 'apps/web/lib']) {
      for (const entry of await readdir(directory, { recursive: true })) {
        // The two colour sources: the terminal's hues and the participant chrome's, each tested on its own.
        if (!/\.tsx?$/.test(entry) || /(^|\/)(colours|player-styles)\.ts$/.test(entry)) continue
        const source = await readFile(path.join(directory, entry), 'utf8')
        for (const match of source.matchAll(/['"`]#[\da-f]{3,8}['"`]|rgba?\(\s*\d/gi)) offending.push(`${entry}: ${match[0]}`)
      }
    }
    expect(offending).toEqual([])
  })

  it('draws the terminal fragments in the code roles, never a literal colour', async () => {
    for (const entry of await readdir('apps/web/generated')) {
      if (!entry.endsWith('.html')) continue
      const html = await readFile(path.join('apps/web/generated', entry), 'utf8')
      expect(html, entry).not.toMatch(/#[\da-f]{6}/i)
      for (const [, name] of html.matchAll(/color:var\(--([\w-]+)\)/g)) expect(Object.values(roles), `${entry}: ${name}`).toContain(name)
    }
  })
})
