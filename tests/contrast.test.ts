import { describe, expect, it } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { roles } from '../packages/ui-tests/src/colours'

/** WCAG relative luminance and contrast of two #rrggbb colours. */
function luminance(hex: string) {
  const rgb = hex.match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
}
const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
/** The #rrggbb custom properties declared in one block of CSS. */
const declared = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\b/gi)].map(match => [match[1], match[2].toLowerCase()]))

const file = await readFile('design/artefacts/tokens.css', 'utf8')
const light = declared(/^:root \{([^}]*)\}/m.exec(file)![1])
const system = declared(/@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}/.exec(file)![1])
const chosen = declared(/^:root\[data-theme="dark"\] \{([^}]*)\}/m.exec(file)![1])
const themes = { light, dark: chosen }

/** The text tokens: what the site sets type in on its ground and its windows. */
const text = ['ink', 'muted', 'accent']
/** The data roles: colour that carries meaning (the moment, stop, nothing happened, reached, words) and the code roles. */
const data = ['accent', 'moment', 'blue', 'green', 'teal', 'purple', 'cyan', 'red', 'yellow', 'no', 'yes', 'done', 'note', 'pause', 'deviation', 'dead', 'correct', 'incorrect']

describe('the token file (design/artefacts/tokens.css), which the artefacts render in the viewer\'s theme', () => {
  it('declares the light theme first and the same dark alternate under the system setting and under data-theme', () => {
    expect(file).toMatch(/^:root \{\s*color-scheme: light;/m)
    expect(light).toMatchObject({ ink: '#111111', accent: '#4b3ff0', line: '#e2e2e2', canvas: '#f6f6f6', surface: '#ffffff' })
    expect(light).toMatchObject({ moment: '#b84d00', pause: '#8b6100', dead: '#bd1f44', done: '#007852', note: '#7a41af', purple: '#7444b4', green: '#27762f', teal: '#00757c' })
    expect(system).toEqual(chosen)
    expect(chosen).toMatchObject({ canvas: '#1a1b26', ink: '#c0caf5', accent: '#7aa2f7', moment: '#ff9e64' })
    // Every theme names every role, so no role falls back to the other theme's value.
    for (const name of [...text, ...data, 'canvas', 'surface', 'raised', 'line', 'comment', 'chip-ink', 'focus']) for (const [theme, tokens] of Object.entries(themes)) expect(tokens[name], `${name} in ${theme}`).toMatch(/^#/)
  })

  for (const [theme, tokens] of Object.entries(themes)) {
    it(`keeps every text token at 4.5:1 on the canvas and the surface, and every data role at 4.5:1 on the canvas, in the ${theme} theme`, () => {
      for (const ground of ['canvas', 'surface']) for (const name of text) expect(contrast(tokens[name], tokens[ground]), `${name} on ${ground}`).toBeGreaterThanOrEqual(4.5)
      for (const name of data) expect(contrast(tokens[name], tokens.canvas), `${name} on canvas`).toBeGreaterThanOrEqual(4.5)
      // A filled chip, button or mark carries the chip ink at the same floor.
      for (const fill of ['accent', 'moment', 'dead', 'done']) expect(contrast(tokens['chip-ink'], tokens[fill]), `chip ink on ${fill}`).toBeGreaterThanOrEqual(4.5)
      // The focus ring is a non-text mark: 3:1 on both grounds.
      for (const ground of ['canvas', 'surface']) expect(contrast(tokens.focus, tokens[ground]), `focus on ${ground}`).toBeGreaterThanOrEqual(3)
    })
  }

  it('gives every CLI colour a code role the token file declares in both themes', () => {
    for (const name of Object.values(roles)) for (const [theme, tokens] of Object.entries(themes)) expect(tokens[name], `${name} in ${theme}`).toMatch(/^#/)
  })
})

/** The light block of the token file, word for word: the only theme the site carries (issue #43). */
const lightBlock = /^:root \{[^}]*\}/m.exec(file)![0]

describe('the site reads the tokens only', () => {
  it('carries the light block of tokens.css verbatim as the token block of globals.css, and no dark block', async () => {
    const css = await readFile('apps/web/app/globals.css', 'utf8')
    expect(css).toContain(lightBlock)
    // Light only, whatever the system setting: neither dark block, nothing that switches on the system theme or data-theme.
    expect(css).not.toContain('color-scheme: dark')
    expect(css).not.toMatch(/prefers-color-scheme|data-theme/)
    for (const value of [chosen.canvas, chosen.ink, chosen.surface]) expect(css).not.toContain(value)
    // Comment is decoration only (it is below the text floor in the light theme): nothing sets type in it.
    expect(css).not.toMatch(/(?:^|[;{]\s*)color:\s*var\(--comment\)/m)
  })

  it('has no literal colour outside the token blocks, except the participant chrome, which is constant over its constant host', async () => {
    const css = (await readFile('apps/web/app/globals.css', 'utf8')).replace(lightBlock, '')
    const offending: string[] = []
    for (const [, selector, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
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
        if (!/\.(tsx?|m?js|css|html)$/.test(entry) || entry.startsWith('demo/')) continue
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
        if (!/\.tsx?$/.test(entry)) continue
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
