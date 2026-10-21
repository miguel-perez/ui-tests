import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir, readFile } from 'node:fs/promises'
import { inviteExample, inviteFile, compilation, promise, intro, landing, agent, hosted, sources, whatComesBack, worth } from '../../apps/web/lib/copy'
import { shown, unsaid, offences } from '../vocabulary'
import { texture, travel } from '../../apps/web/lib/texture'
import { mixOklab, over, darken } from '../oklab'

/** Every content type's component on the landing page (docs/design/site-schema.md). */
const artefacts = ['terminal-window', 'what-comes-back', 'compilation', 'sources', 'merge-box', 'check-page', 'worth', 'agents', 'host']
/**
 * Cursor Follies (issue #75) swallow a click that lands on a cursor in trouble, and their stages include the compile tabs, the
 * frames' buttons and the hero's Get started; the scenes are random and run on the wall clock, so on a slow runner a test's click
 * on one of those can be caught instead. A test that clicks them turns the troupe off the way a visitor can, with reduced motion;
 * tests/e2e/follies.spec.ts covers the troupe itself.
 */
const withoutTroupe = (page: Page) => page.emulateMedia({ reducedMotion: 'reduce' })
/** Relative luminance of a computed rgb() colour. */
const luminance = (rgb: string) => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return r * .2126 + g * .7152 + b * .0722 }
/** The distinct colours of the text inside each matched element. */
async function textColours(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const colours = new Set<string>()
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) if (walker.currentNode.textContent?.trim()) colours.add(getComputedStyle(walker.currentNode.parentElement!).color)
    return { text: node.textContent?.trim().slice(0, 60), colours: [...colours] }
  }))
}

for (const width of [1440, 375]) {
  for (const [name, route] of [['landing', '/']]) {
    test(`site ${name} at ${width}px: layout, accessibility, fonts, themes, highlighting and copy`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(route)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      // Issue #43: light only; the system setting and data-theme are in tests/e2e/theme.spec.ts.
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 246, 246)')
      await expect(page.locator('body')).toHaveCSS('color', 'rgb(17, 17, 17)')
      const fonts = await page.locator('body *').evaluateAll(nodes => [...new Set(nodes.filter(node => node.getBoundingClientRect().width && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())).map(node => getComputedStyle(node).fontFamily))])
      for (const font of fonts) expect(font).toMatch(/^['"]?(?:__)?Fira[_ ](?:Sans|Code)/)
      await expect(page.locator('pre').first()).toHaveCSS('font-family', /Fira[_ ]Code/)

      // Item 2: only the terminal carries terminal chrome.
      const dots = await page.locator('.window-dots').evaluateAll(nodes => nodes.map(node => !!node.closest('[data-artefact="terminal-window"]')))
      expect(dots.length).toBeGreaterThan(0)
      expect(dots.every(Boolean)).toBe(true)
      // The theme rules (design/artefacts/README.md): the site's own surfaces are white windows on the canvas with the line colour as their edge.
      for (const selector of ['.attempt-view', '.run-report', '.host-window', '.pr-gh', '.src-row[aria-expanded="true"]', '.src-well:not([hidden])', '.terminal-window', '.code-window']) {
        for (const surface of await page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) expect(surface, `${selector} is white`).toBe('rgb(255, 255, 255)')
      }
      for (const edge of await page.locator('.window').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).borderTopColor))) expect(edge).toBe('rgb(226, 226, 226)')
      // Insets inside a window take the raised grey, as the artefacts draw them.
      for (const surface of await page.locator('.src-fill, .attempt-diff').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) expect(surface).toBe('rgb(239, 239, 239)')
      expect(await page.locator('.theme-light').count()).toBe(0)
      // The participant chrome over the light Weekboard is its inverse: Weekboard's ink, opaque, never a panel colour of the page or the app.
      const panels = new Set(['rgb(246, 246, 246)', 'rgb(255, 255, 255)', 'rgb(239, 239, 239)', 'rgb(225, 226, 231)', 'rgb(238, 240, 245)'])
      for (const selector of ['.ch-sheet', '.ch-pill', '.sources .uit-join', '.sources .uit-invite']) {
        for (const surface of await page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) {
          expect(surface, `${selector} is the inverse of Weekboard`).toBe('rgb(44, 51, 83)')
          expect(panels.has(surface)).toBe(false)
        }
      }
      // The one accent Weekboard's author sets, mint, never the app's orange.
      // The frames are the light Weekboard page in its own grey, unchanged on the light site.
      for (const frame of await page.locator('.compile-frame, .src-frame').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) expect(frame).toBe('rgb(225, 226, 231)')
      for (const accent of await page.locator('.ch-btn.pri, .ch-pill .done, .sources .uit-primary').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) expect(accent).toBe('rgb(95, 227, 192)')
      // Issue #35, item 6: the label on the mint takes the chrome's accent ink, #14251f, as the artefacts draw it, in the real player too.
      for (const ink of await page.locator('.ch-btn.pri, .ch-pill .done, .sources .uit-primary').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color))) expect(ink).toBe('rgb(20, 37, 31)')
      // Terminal and code windows: white with black type.
      for (const ink of await page.locator('.terminal-body, .code-body').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color))) expect(luminance(ink)).toBeLessThan(.01)
      // Every component that owns chrome carries "Example run" at most once.
      for (const count of await page.locator('[data-artefact]').evaluateAll(nodes => nodes.map(node => [...node.querySelectorAll('.example-label')].filter(label => label.closest('[data-artefact]') === node).length))) expect(count).toBeLessThanOrEqual(1)
      // Item 10: no code, shell block or terminal output is monochrome.
      const ink = 'rgb(17, 17, 17)'
      for (const fragment of await textColours(page, '.code-inline')) expect(fragment.colours.some(colour => colour !== ink), `inline ${fragment.text}`).toBe(true)
      for (const fragment of await textColours(page, '.terminal-body pre')) expect(fragment.colours.length, `terminal ${fragment.text}`).toBeGreaterThanOrEqual(2)
      for (const fragment of await textColours(page, '.code-body .shiki')) expect(fragment.colours.length, `code ${fragment.text}`).toBeGreaterThanOrEqual(3)

      if (name === 'landing') {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(promise)
        await expect(page.getByText(intro)).toBeVisible()
        for (const [key, text] of Object.entries(landing)) if (!['fileCaption', 'moment', 'words', 'scenario', 'priority', 'result', 'reached', 'closing'].includes(key)) await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first(), key).toBeVisible()
        for (const text of [agent.heading, agent.lead, hosted.heading, hosted.lead.replaceAll('`', ''), hosted.closing, compilation.heading, compilation.lead, whatComesBack.heading]) await expect(page.getByText(text, { exact: true })).toBeVisible()
        // Round six: one section in place of "What the person sees" and "Three commands".
        await expect(page.getByRole('heading', { name: 'What the person sees.' })).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'Three commands.' })).toHaveCount(0)
        await expect(page.locator('h1')).toHaveCSS('font-size', width === 1440 ? '72px' : '44px')
        for (const artefact of artefacts) await expect(page.locator(`[data-artefact="${artefact}"]`).first(), artefact).toBeVisible()
        // Issue #38, item 2: the hero has no session behind it: no recording, no gestures, no sensors. Issue #51: and no texture of its
        // own; the page's texture runs behind it as behind everything else, and holds nothing but its canvas tiles.
        await expect(page.locator('.hero video, .hero-session, .hero .sensor, .hero canvas, .hero-backdrop, .trace-texture')).toHaveCount(0)
        expect(new Set(await page.locator('.page-texture').evaluate(node => [...node.children, ...node.shadowRoot!.children].map(child => `${child.tagName} ${child.className}`)))).toEqual(new Set(['CANVAS page-texture-tile']))
        await expect(page.locator('.page-texture')).toHaveText('')
        await expect(page.getByRole('button', { name: /frustration gestures|texture/i })).toHaveCount(0)
        // Issue #46, item 2: "What comes back." in place of the attempt view block and "In the pull request": the check, its page and,
        // since issue #62, the replay; the report and the one-person attempt view are not on the site.
        const comesBack = page.locator('section[aria-labelledby="comes-back"]')
        for (const piece of ['merge-box', 'check-page']) await expect(comesBack.locator(`[data-artefact="${piece}"]`)).toHaveCount(1)
        await expect(comesBack.locator('#the-replay .replay-moment')).toBeVisible()
        await expect(page.locator('[data-artefact="run-report"], .run-report')).toHaveCount(0)
        await expect(page.locator('[data-artefact="attempt-view"], [data-artefact="pull-request"], section[aria-labelledby="pull-request"]')).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'In the pull request.' })).toHaveCount(0)
        // The page order: hero, what comes back, what you write, where the people come from, what a run is worth (issue #53), the agent
        // section, the host section.
        expect(await page.locator('main section[aria-labelledby]').evaluateAll(nodes => nodes.filter(node => !node.parentElement?.closest('section')).map(node => node.getAttribute('aria-labelledby')))).toEqual(['promise', 'comes-back', 'what-you-write', 'people', 'worth', 'agents', 'hosted'])
        // Issue #53, item 3: nothing on the page weighs the run in the words the research rules out.
        expect(offences(await page.locator('body').innerText(), unsaid)).toEqual([])
        // Issue #22: nothing in the report rows, the check or the terminals uses the old words.
        for (const selector of ['section[aria-labelledby="comes-back"]', '.terminal-window']) for (const text of await page.locator(selector).allInnerTexts()) expect(offences(text, shown), selector).toEqual([])
        await expect(page.locator('.checks-box, .findings-list, [data-artefact="checks-box"], [data-artefact="findings-list"]')).toHaveCount(0)
        // The host section is the artefact's: two unnumbered pieces, the terminal exactly as drawn and the script tag with its tab, then
        // the closing line. No dashboard, no form and no reels; nothing names ui-tests.com as a host.
        const hostBlock = page.locator('section[aria-labelledby="hosted"]')
        await expect(hostBlock.locator('video, table, form, [data-artefact="attempt-view"], [data-artefact="run-report"], [data-artefact="dashboard"]')).toHaveCount(0)
        await expect(page.locator('[data-artefact="dashboard"], .dashboard')).toHaveCount(0)
        await expect(hostBlock.locator('.piece-intro h3')).toHaveText([hosted.command.name, hosted.line.name])
        for (const h3 of await hostBlock.locator('.piece-intro h3').all()) expect(await h3.evaluate(node => [node.getAttribute('data-n'), getComputedStyle(node, '::before').content])).toEqual([null, 'none'])
        for (const text of [hosted.command.intro, hosted.line.intro]) await expect(hostBlock.getByText(text, { exact: true })).toBeVisible()
        const [terminal, tag] = await hostBlock.locator('.host-window').all()
        await expect(terminal.locator('figcaption')).toHaveText(hosted.command.tab.join(''))
        expect(await terminal.locator('pre').innerText()).toBe(hosted.terminal)
        expect((await terminal.locator('pre').innerText()).split('\n')[0]).toBe('$ npx ui-tests serve')
        await expect(tag.locator('figcaption')).toHaveText(hosted.line.tab.join(''))
        expect(await tag.locator('pre').innerText()).toBe(hosted.snippet)
        expect(hosted.snippet).toMatch(/^<script data-ui-tests="https:\/\/tests\.weekboard\.example">/)
        for (const fragment of await textColours(page, '.host-term, .host-snip')) expect(fragment.colours.length, `host ${fragment.text}`).toBeGreaterThanOrEqual(3)
        await expect(hostBlock.locator('.caption')).toHaveText(hosted.closing)
        expect(await hostBlock.innerText()).not.toMatch(/ui-tests\.com|hosted version|our servers|we store|our wallet/i)
        // Round seven: the sources table in place of the three cards, its copy the artefact's, in the order link, visitors, paid panel.
        const people = page.locator('section[aria-labelledby="people"]')
        await expect(people.locator('.option-card')).toHaveCount(0)
        for (const text of [sources.heading, sources.lead]) await expect(people.getByText(text, { exact: true })).toBeVisible()
        await expect(people.locator('.src-row .src-name b')).toHaveText(sources.rows.map(row => row.name))
        await expect(people.locator('.src-cols')).toBeVisible({ visible: width === 1440 })
        const heights = await people.locator('.src-row').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)))
        if (width === 1440) expect(heights.every(height => height >= 152)).toBe(true)
        // Issue #49, item 1: the agent section is the artefact's tiles; the old terminal, its caption, the goal snippet and the
        // agent check's name are off the landing, and nothing says "instead of a person".
        const agents = page.locator('section[aria-labelledby="agents"]')
        await expect(agents.locator('.agents-tile')).toHaveCount(3)
        await expect(agents.locator('pre, code, .terminal-window, .code-window, .caption')).toHaveCount(0)
        await expect(agents).not.toContainText(agent.closing)
        expect(await page.locator('main').innerText()).not.toMatch(/ui-tests \(agent\)|instead of a person/)
        // The hero's two actions: the repository, and the getting-started page, the one link into /docs; no report links.
        await expect(page.locator('.hero .actions a')).toHaveCount(2)
        await expect(page.locator('.hero .actions a').first()).toHaveAttribute('href', 'https://github.com/miguel-perez/ui-tests')
        await expect(page.locator('.hero .actions a').nth(1)).toHaveText(landing.start)
        await expect(page.locator('a[href^="/docs"]')).toHaveCount(1)
        await expect(page.locator('a[href^="/docs"]')).toHaveAttribute('href', '/docs/getting-started/')
        await expect(page.locator('a[href^="/r/"]')).toHaveCount(0)
      }
      if (process.env.CAPTURE_SITE === '1') {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' })
        await page.goto(route)
        await page.evaluate(() => document.fonts.ready)
        await mkdir('design/screens', { recursive: true })
        await page.screenshot({ path: `design/screens/${name}-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 80 })
      }
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      const copy = page.getByRole('button', { name: `Copy ${inviteFile}`, exact: true })
      await copy.focus(); await page.keyboard.press('Enter')
      await expect(copy.locator('xpath=ancestor::figure').getByRole('status')).toHaveText('Copied')
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(inviteExample)
    })
  }

  test(`reduced motion shows stills at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForTimeout(1500)
    // Under reduced motion the texture's waves hold one still frame, its clock at zero.
    await expect(page.locator('.page-texture')).toHaveAttribute('data-motion', 'still')
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    const still = await page.locator('.page-texture-tile').first().evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    await page.waitForTimeout(500)
    expect(await page.locator('.page-texture-tile').first().evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(still)
    expect(await page.locator('.page-texture').evaluate(node => (node as HTMLElement & { clock: number }).clock)).toBe(0)
    await expect(page.locator('.types-once pre')).toHaveCSS('animation-name', 'none')
  })
}

/** The canvas colour, and the strongest pixel the texture may paint: a grey line and a blue centre crossing at the top alpha. */
const ground = [246, 246, 246]
const strongest = (() => {
  const wave = mixOklab('#e2e2e2', 0.82, '#4b3ff0')
  return darken(over('#f6f6f6', '#e2e2e2', texture.maxAlpha), over('#f6f6f6', wave, texture.maxAlpha)).match(/[\da-f]{2}/gi)!.map(value => parseInt(value, 16))
})()

/** What the texture's tiles paint between `top` and `bottom` (document px): how many pixels, how many blue and grey, and the darkest. */
function pixels(page: Page, top: number, bottom: number) {
  return page.evaluate(([top, bottom, ground]) => {
    let painted = 0, blue = 0, grey = 0, tiles = 0
    const darkest = [255, 255, 255]
    for (const tile of document.querySelector('.page-texture')!.shadowRoot!.querySelectorAll('canvas')) {
      const y = tile.offsetTop, height = tile.offsetHeight
      if (!tile.width || y >= bottom || y + height <= top) continue
      tiles++
      const scale = tile.width / tile.clientWidth, from = Math.max(0, top - y), to = Math.min(height, bottom - y)
      const { data } = tile.getContext('2d')!.getImageData(0, Math.floor(from * scale), tile.width, Math.max(1, Math.floor((to - from) * scale)))
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
        if (ground[0] - Math.min(r, g, b) <= 2) continue
        painted++
        if (b - r >= 6) blue++; else if (Math.abs(b - r) <= 2) grey++
        for (let c = 0; c < 3; c++) darkest[c] = Math.min(darkest[c], data[i + c])
      }
    }
    return { painted, blue, grey, darkest, tiles }
  }, [top, bottom, ground] as const)
}

// Issue #51, item 1: the waves behind the whole page, in the document, on the landing, at both widths.
for (const width of [1440, 375]) for (const [name, route, parts] of [['landing', '/', '.hero, [data-section], .site-footer']] as const) {
  test(`the waves run behind every section and the footer of the ${name} at ${width}px, at the device pixel ratio`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    const layer = page.locator('.page-texture')
    await expect(layer).toHaveAttribute('data-motion', 'running')
    // In the document, not fixed: at its top, under the content, as wide as the page and as tall as the whole document.
    const box = await layer.evaluate(node => { const style = getComputedStyle(node), rect = node.getBoundingClientRect(); return { position: style.position, events: style.pointerEvents, z: style.zIndex, top: rect.top + scrollY, width: Math.round(rect.width), height: Math.round(rect.height), page: document.documentElement.scrollHeight, view: document.documentElement.clientWidth } })
    expect(box).toMatchObject({ position: 'absolute', events: 'none', z: '-1', top: 0, width: box.view, height: box.page })
    // A tall page is not one huge canvas: far from the window the tiles are released.
    expect(await page.locator('.page-texture-tile').evaluateAll(tiles => tiles.some(tile => (tile as HTMLCanvasElement).width === 0))).toBe(true)
    const areas = await page.locator(parts).evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { name: node.getAttribute('data-section') ?? node.className, top: rect.top + scrollY, bottom: rect.bottom + scrollY } }))
    expect(areas.length).toBeGreaterThan(1)
    for (const area of areas) {
      await page.evaluate(top => scrollTo(0, top), area.top)
      await page.waitForTimeout(120)
      const seen = await pixels(page, area.top, Math.min(area.bottom, area.top + 1000))
      expect(seen.tiles, `${area.name}: a painted tile behind it`).toBeGreaterThan(0)
      expect(seen.painted, `${area.name}: lines behind it`).toBeGreaterThan(500)
      expect(seen.grey, `${area.name}: grey lines`).toBeGreaterThan(0)
      // Never stronger than a line at the top of the alpha range: crossing lines darken, they do not compound.
      for (let c = 0; c < 3; c++) expect(seen.darkest[c], `${area.name}: channel ${c} of the darkest pixel`).toBeGreaterThanOrEqual(strongest[c] - 2)
    }
    // At the device pixel ratio: each painted tile's backing store is its css size times the ratio.
    expect(await page.locator('.page-texture-tile').evaluateAll(tiles => tiles.filter(tile => (tile as HTMLCanvasElement).width).every(tile => (tile as HTMLCanvasElement).width === Math.round(tile.clientWidth * devicePixelRatio)))).toBe(true)
  })
}

test('the waves are drawn at a device pixel ratio of two, and released far from the window', async ({ browser }) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto('/')
  await expect.poll(() => page.locator('.page-texture-tile').evaluateAll(nodes => nodes.some(node => (node as HTMLCanvasElement).width > 0))).toBe(true)
  const tiles = await page.locator('.page-texture-tile').evaluateAll(nodes => nodes.map(node => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height, css: node.clientHeight, drawn: (node as HTMLCanvasElement).width > 0 })))
  for (const tile of tiles.filter(tile => tile.drawn)) expect(tile).toMatchObject({ width: 2880, height: tile.css * 2 })
  expect(tiles.filter(tile => !tile.drawn).every(tile => tile.height === 0)).toBe(true)
  // The texture never changes the markup as it moves, so a click that did nothing still reads as one to the recorder.
  const markup = await page.evaluate(() => document.querySelector('.page-texture')!.outerHTML)
  await page.waitForTimeout(600)
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => document.querySelector('.page-texture')!.outerHTML)).toBe(markup)
  expect(tiles.filter(tile => tile.drawn).length).toBeLessThan(tiles.length / 2)
  await context.close()
})

test('the waves move visibly but slowly, grey with a blue centre, and stay light under either system setting', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const layer = page.locator('.page-texture')
  await expect(layer).toHaveAttribute('data-motion', 'running')
  const clock = () => layer.evaluate(node => (node as HTMLElement & { clock: number }).clock)
  await expect.poll(clock).toBeGreaterThan(0)
  // Over two seconds the clock runs two seconds, and in that time a sampled line point travels at least 16px, at most 32.
  const read = async () => ({ clock: await clock(), frame: await page.locator('.page-texture-tile').first().evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()) })
  const before = await read()
  await page.waitForTimeout(2000)
  const after = await read()
  expect(after.clock - before.clock).toBeGreaterThan(1500)
  expect(after.frame).not.toBe(before.frame)
  for (const index of [3, 20, 40]) {
    let most = 0
    for (let x = 0; x <= 1440; x += texture.step) most = Math.max(most, travel(index, x, before.clock / 1000, before.clock / 1000 + 2))
    expect(most, `row ${index}`).toBeGreaterThanOrEqual(16)
    expect(most, `row ${index}`).toBeLessThanOrEqual(32)
  }
  // Grey carries the lines and the blue is a tint at their centres: both are on the page, the grey the more.
  const seen = await pixels(page, 0, 1000)
  expect(seen.blue).toBeGreaterThan(100)
  expect(seen.grey).toBeGreaterThan(seen.blue)
  // Under a dark system setting the site stays light, and so do the waves (issue #43).
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(500)
  const dark = await pixels(page, 0, 1000)
  for (let c = 0; c < 3; c++) expect(dark.darkest[c]).toBeGreaterThanOrEqual(strongest[c] - 2)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('.wordmark svg').first()).toHaveCSS('color', 'rgb(75, 63, 240)')
  // The header's wordmark is the mark and the name on one line, never painted over by the source logos' masked rule.
  await expect(page.locator('.site-header .wordmark')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.site-header .wordmark')).toHaveCSS('display', 'flex')
})

for (const width of [1440, 375]) test(`what you write, what they see: the commands, one step at a time by tab, key and hash, each at its own height with no code, then the file, stepped frames of one height, no console errors at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height: 1000 })
  await withoutTroupe(page)
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const section = page.locator('section.compilation')
  // Issue #68: the five commands by cost, one stacked list, one row each in this order, the command on the left and what it does on
  // the right at 1440, stacked inside its row at 375; nothing under the list, and `npx ui-tests run` nowhere.
  const rows = section.locator('.compile-command')
  await expect(rows.locator('code')).toHaveText(compilation.commands.map(({ command }) => `$ ${command}`))
  expect(compilation.commands.map(({ command }) => command)).toEqual(['npm install -D ui-tests', 'npx ui-tests init', 'npx ui-tests', 'npx ui-tests recruit', 'npx ui-tests check'])
  await expect(rows.locator(':scope > span')).toHaveText(compilation.commands.map(({ does }) => does))
  const commands = await rows.evaluateAll(nodes => nodes.map(node => { const [code, does] = [...node.children].map(child => child.getBoundingClientRect()); return { top: node.getBoundingClientRect().top, side: does.left > code.right, below: does.top >= code.bottom - 1 } }))
  expect(new Set(commands.map(row => row.top)).size).toBe(5)
  expect(commands.every(row => width === 1440 ? row.side : row.below)).toBe(true)
  await expect(section.locator('.compile-note')).toHaveCount(0)
  expect(await page.locator('body').innerText()).not.toContain('ui-tests run')
  // Issue #54: the whole file, as init writes it, in the site's highlighter, after the steps' previous and next row, across all
  // twelve columns with --space-2 above it; the only code window in the section.
  await expect(section.locator('.lines-window')).toHaveCount(1)
  const file = section.locator('.lines-window')
  expect((await file.locator('li code').allInnerTexts()).join('\n')).toBe(inviteExample)
  expect(await file.evaluate(node => node.previousElementSibling?.classList.contains('compile-stepper') && !node.nextElementSibling)).toBe(true)
  const [stepper, fileBox, commandsBox] = await Promise.all([section.locator('.compile-stepper').boundingBox(), file.boundingBox(), section.locator('.compile-commands').boundingBox()])
  expect(Math.round(fileBox!.y - (stepper!.y + stepper!.height))).toBe(width === 1440 ? 48 : 36)
  expect([Math.round(fileBox!.x), Math.round(fileBox!.width)]).toEqual([Math.round(commandsBox!.x), Math.round(commandsBox!.width)])
  // Issue #46, item 3: a tab strip, 1 Consent to 6 After the task, and one step visible at a time.
  const tabs = section.getByRole('tab')
  await expect(tabs).toHaveText(compilation.pieces.map(piece => `${piece.n}${piece.tab}`))
  const open = async () => ({ selected: await tabs.evaluateAll(nodes => nodes.findIndex(node => node.getAttribute('aria-selected') === 'true')), visible: await section.locator('[role="tabpanel"]:visible').count() })
  expect(await open()).toEqual({ selected: 0, visible: 1 })
  // Issue #54: the panel takes each step's own height at every width, and nothing in the section is sticky. The closed steps are out
  // of the layout and inert, never in the tab order.
  const stage = section.locator('.compile-steps'), heights: number[] = []
  for (let i = 0; i < compilation.pieces.length; i++) {
    await tabs.nth(i).click()
    const [panel, step] = await Promise.all([stage.boundingBox(), section.locator('.compile-step.is-current').boundingBox()])
    expect(Math.round(panel!.height)).toBe(Math.round(step!.height))
    heights.push(Math.round(panel!.height))
  }
  expect(new Set(heights).size, `step heights ${heights}`).toBeGreaterThan(1)
  expect(await section.locator('*').evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).position === 'sticky').length)).toBe(0)
  expect(await section.locator('.compile-step:not(.is-current)').evaluateAll(nodes => nodes.every(node => (node as HTMLElement).inert && getComputedStyle(node).display === 'none'))).toBe(true)
  await tabs.nth(0).click()
  // Each step: its number, name and note on the left, and no code; a frame and what comes back on the right, and no after-Done box.
  for (const [i, piece] of compilation.pieces.entries()) {
    await tabs.nth(i).click()
    expect(await open()).toEqual({ selected: i, visible: 1 })
    await expect(page).toHaveURL(new RegExp(`#step${piece.n}$`))
    const row = section.locator(`#piece-${piece.id}`)
    await expect(row).toBeVisible()
    await expect(row.locator('.compile-intro h3')).toHaveText(new RegExp(`^${piece.n}${piece.name}`))
    await expect(row.locator('.compile-back')).toHaveText(`Comes back${piece.returns}`)
    await expect(row.locator('.compile-frame[data-figure]')).toHaveCount(1)
    // The text on the left, the screen on the right: a 5/7 pair at 1440, stacked at 375.
    const [left, main] = await Promise.all([row.locator('.compile-left').boundingBox(), row.locator('.compile-main').boundingBox()])
    if (width === 1440) { expect(Math.round(left!.width)).toBe(510); expect(Math.round(main!.x)).toBe(630) } else expect(main!.y).toBeGreaterThanOrEqual(left!.y + left!.height - 1)
    await expect(row.locator('.lines-window, pre, code.shiki, .lines-body')).toHaveCount(0)
    // Issue #62, item 4: no step carries the worked-out box, step 2 included; its text, screen and "Comes back" line stay.
    await expect(row.locator('.compile-check, dl')).toHaveCount(0)
    await expect(row).not.toContainText('Worked out on your side')
    expect(await row.innerText()).not.toContain('After Done')
  }
  // At 375 the file's code wraps instead of scrolling.
  if (width === 375) expect(await file.locator('.lines-body').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  // Arrow keys, Home and End move between the tabs and take the focus with them.
  await tabs.nth(5).focus()
  await page.keyboard.press('ArrowLeft'); expect((await open()).selected).toBe(4); await expect(tabs.nth(4)).toBeFocused()
  await page.keyboard.press('Home'); expect((await open()).selected).toBe(0); await expect(tabs.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowRight'); expect((await open()).selected).toBe(1)
  await page.keyboard.press('End'); expect((await open()).selected).toBe(5); await expect(tabs.nth(5)).toBeFocused()
  await expect(tabs.nth(5)).toHaveAttribute('tabindex', '0'); await expect(tabs.nth(0)).toHaveAttribute('tabindex', '-1')
  // Previous and next under the pair, named for the steps they open.
  const nav = section.getByRole('navigation', { name: 'Previous and next step' })
  await expect(nav.locator('.sprev')).toHaveText(`←Previous step: 5${compilation.pieces[4].tab}`)
  // At the last step next is disabled and hidden, so it keeps its place but is not offered.
  await expect(nav.locator('.snext')).toBeDisabled()
  await expect(nav.locator('.snext')).toBeHidden()
  await nav.getByRole('button', { name: /^Previous step: /, exact: false }).click()
  expect((await open()).selected).toBe(4)
  await nav.getByRole('button', { name: /^Next step: / }).click()
  expect((await open()).selected).toBe(5)
  // On a phone the strip scrolls sideways inside itself, never the page.
  if (width === 375) {
    expect(await section.locator('.compile-tabs').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  // The stepped frames keep one height through every step, by the sheet's own Next and by the control under the frame.
  for (const [id, count, step] of [['screener', 6, 2], ['after', 5, 6]] as const) {
    await tabs.nth(step - 1).click()
    const row = section.locator(`#piece-${id}`), frame = row.locator('.compile-frame'), stepper = row.locator('.stepper')
    // The tab's panel finishes switching before the frame is measured; on a slow runner it can lag the click.
    await expect(tabs.nth(step - 1)).toHaveAttribute('aria-selected', 'true')
    await expect(frame).toBeVisible()
    await expect(stepper.locator('.where')).toHaveText(`1 of ${count}`)
    await frame.scrollIntoViewIfNeeded()
    const height = (await frame.boundingBox())!.height
    await expect(stepper.locator('.where')).toHaveText(`1 of ${count}`)
    await expect(stepper.getByRole('button', { name: /^Previous/ })).toBeDisabled()
    for (let n = 2; n <= count; n++) {
      await frame.locator('.car-step.is-current .next-step').click()
      await expect(stepper.locator('.where')).toHaveText(`${n} of ${count}`)
      expect((await frame.boundingBox())!.height).toBe(height)
      await expect(frame.locator('.car-step.is-current')).toHaveCount(1)
      await expect(frame.locator('.car-step')).toHaveCount(count)
    }
    await expect(stepper.getByRole('button', { name: /^Next/ })).toBeDisabled()
    await stepper.getByRole('button', { name: /^Previous/ }).click()
    await expect(stepper.locator('.where')).toHaveText(`${count - 1} of ${count}`)
    expect((await frame.boundingBox())!.height).toBe(height)
  }
  await expect(section.locator('#piece-after .car-step').first()).toContainText('Overall, how difficult or easy did you find this task?')
  await expect(section.locator('#piece-card')).toContainText(landing.scenario)
  await tabs.nth(4).click()
  await expect(section.locator('#piece-bar .ch-pill')).toHaveCSS('height', '40px')
  expect((await new AxeBuilder({ page }).include('section.compilation').analyze()).violations).toEqual([])
  // A plain hash opens its step on load, and the strip is in view.
  await page.goto('/#step4')
  await expect(section.locator('#piece-card')).toBeVisible()
  expect(await open()).toEqual({ selected: 3, visible: 1 })
  await expect(section.locator('.compile-tabs')).toBeInViewport()
  expect(errors).toEqual([])
})

for (const width of [1440, 375]) test(`the sources table opens one row at a time, closes on Escape and an outside click, and keeps its header at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(String(error)))
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/')
  const section = page.locator('section[aria-labelledby="people"]')
  const rows = section.locator('.src-row'), wells = section.locator('.src-well')
  const open = async () => (await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-expanded'))))
  // Issue #49, item 4: no row is open on arrival; the first click opens one, and opening another closes it.
  expect(await open()).toEqual(['false', 'false', 'false'])
  await expect(wells.locator('visible=true')).toHaveCount(0)
  await rows.nth(0).click()
  expect(await open()).toEqual(['true', 'false', 'false'])
  await expect(wells.locator('visible=true')).toHaveCount(1)
  await rows.nth(1).click()
  expect(await open()).toEqual(['false', 'true', 'false'])
  await expect(section.locator('#visitors-well')).toBeVisible()
  await expect(section.locator('#link-well')).toBeHidden()
  // The well is the real player's invitation, with the one string; a click inside it keeps the row open.
  const { invitationText } = await import('../../apps/web/components/player/invitation')
  const invitation = section.locator('#visitors-well .uit-invite')
  await expect(invitation).toHaveAttribute('role', 'dialog')
  expect((await invitation.innerText()).replace(/\s+/g, ' ')).toContain(invitationText)
  await section.locator('#visitors-well .src-caveat').click()
  expect(await open()).toEqual(['false', 'true', 'false'])
  // Escape closes it, and so does a click outside the well.
  await page.keyboard.press('Escape')
  expect(await open()).toEqual(['false', 'false', 'false'])
  await rows.nth(2).click()
  await expect(section.locator('#paid-panel-well')).toBeVisible()
  await expect(section.locator('#paid-panel-well [role="img"][aria-label="Prolific"]')).toBeVisible()
  await expect(section.locator('#paid-panel-well [role="img"][aria-label="CloudResearch Connect"]')).toBeVisible()
  await section.locator('.section-head h2').click()
  expect(await open()).toEqual(['false', 'false', 'false'])
  // The join screen is the real player's: its words, what is recorded and Start.
  await rows.nth(0).click()
  const join = section.locator('#link-well .uit-join')
  await expect(join).toContainText('Weekboard asked for your help with one thing on their site.')
  await expect(join.getByRole('button', { name: 'Start' })).toBeVisible()
  // The open row and its well run edge to edge on the surface: their paint covers the whole window width.
  const edge = await section.locator('#link-well').evaluate(node => { const style = getComputedStyle(node); return { clip: style.clipPath, shadow: style.boxShadow } })
  expect(edge.clip).toContain('inset')
  expect(edge.shadow).toMatch(/0px 0px 0px \d+px/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  const header = section.locator('.src-cols')
  if (width === 1440) {
    // Scrolled past, the header sticks to the top of the window on the canvas, and the stuck state shows.
    await rows.nth(0).click()
    await page.evaluate(() => { const table = document.querySelector('.src-table')!; scrollTo(0, table.getBoundingClientRect().top + scrollY + 160) })
    await expect(header).toHaveClass(/is-stuck/)
    expect(Math.round((await header.boundingBox())!.y)).toBe(0)
  } else {
    // On a phone the header goes and each cell carries its column's name.
    await expect(header).toBeHidden()
    await expect(rows.nth(0).locator('.src-k').first()).toBeVisible()
    await expect(rows.nth(0).locator('.src-k').first()).toHaveText('Who')
  }
  expect((await new AxeBuilder({ page }).include('section[aria-labelledby="people"]').analyze()).violations).toEqual([])
  expect(errors).toEqual([])
})

for (const width of [1440, 375]) test(`hover, focus and active never move anything at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/#step2')
  await still(page, ['.copy-control', '.button', '.src-row:not([aria-expanded="true"])', '.pr-chk a', '.nav-links a', '.compile-tabs button[aria-selected="false"]', '.compile-stepnav .snext', '.stepper .nextb'])
})

/** Each target keeps its exact box on hover, and buttons and links on focus and press too. */
async function still(page: Page, targets: string[]) {
  for (const selector of targets) {
    const target = page.locator(selector).first()
    await target.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const before = await target.boundingBox()
    await target.hover()
    expect(await target.boundingBox(), `${selector} hover`).toEqual(before)
    if (await target.evaluate(node => node.matches('button, a, input'))) {
      await target.focus()
      expect(await target.boundingBox(), `${selector} focus`).toEqual(before)
      await page.mouse.down()
      expect(await target.boundingBox(), `${selector} active`).toEqual(before)
      await page.mouse.move(0, 0); await page.mouse.up()
    }
  }
}

for (const width of [1440, 375]) test(`the agent section is the artefact, word for word: the command under the heading, the lead, three tiles and no code at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const section = page.locator('section[aria-labelledby="agents"]')
  // Issue #49, item 1: the words of design/artefacts/agents-section.html, verbatim.
  const { parseHTML } = await import('linkedom')
  const artefact = parseHTML(`<html><body>${await readFile('design/artefacts/agents-section.html', 'utf8')}</body></html>`).document
  const text = (node: Element | null) => node!.textContent!.replace(/\s+/g, ' ').trim()
  await expect(section.getByRole('heading', { level: 2 })).toHaveText(text(artefact.querySelector('.head h1')))
  await expect(section.locator('.agents-cmd')).toHaveText(text(artefact.querySelector('.head .cmd')))
  await expect(section.locator('.section-head [data-lead]')).toHaveText(text(artefact.querySelector('.head p')))
  const tiles = [...artefact.querySelectorAll('.tile')]
  await expect(section.locator('.agents-tile h3')).toHaveText(tiles.map(tile => text(tile.querySelector('h2'))))
  await expect(section.locator('.agents-tile h3 span')).toHaveText(tiles.map(tile => text(tile.querySelector('h2 span'))))
  await expect(section.locator('.agents-tile p')).toHaveText(tiles.map(tile => text(tile.querySelector('p'))))
  await expect(section.locator('.agents-tile p b')).toHaveText(tiles.flatMap(tile => [...tile.querySelectorAll('p b')].map(text)))
  // Each tile's icon in the accent, 56px; no terminal, no code block, no result line.
  for (const icon of await section.locator('.agents-icon').all()) {
    await expect(icon).toHaveCSS('color', 'rgb(75, 63, 240)')
    expect(Math.round((await icon.boundingBox())!.width)).toBe(56)
  }
  await expect(section.locator('pre, code, .terminal-window, .code-window, video')).toHaveCount(0)
  // The command sits under the heading in the first five columns; the lead in the right seven, ending flush at 1344 (issue #65); the
  // tiles across twelve, one row at 1440.
  const [heading, command, lead] = await Promise.all([section.locator('h2').boundingBox(), section.locator('.agents-cmd').boundingBox(), section.locator('[data-lead]').boundingBox()])
  expect(command!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height - 1)
  const boxes = await section.locator('.agents-tile').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(r => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width) })))
  const figure = (await section.locator('.agents-tiles').boundingBox())!
  if (width === 1440) {
    expect([Math.round(command!.x), Math.round(lead!.x + lead!.width)]).toEqual([96, 1344])
    expect(lead!.x).toBeGreaterThanOrEqual(630 - 2)
    expect([Math.round(figure.x), Math.round(figure.width)]).toEqual([96, 1248])
    expect(new Set(boxes.map(box => box.y)).size).toBe(1)
    expect(boxes.map(box => box.width)).toEqual([400, 400, 400])
  } else {
    expect(lead!.y).toBeGreaterThanOrEqual(command!.y + command!.height - 1)
    expect(boxes.every(box => box.x === 16 && box.width === 343)).toBe(true)
    expect(boxes.every((box, i) => i === 0 || box.y > boxes[i - 1].y)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect((await new AxeBuilder({ page }).include('section[aria-labelledby="agents"]').analyze()).violations).toEqual([])
  expect(errors).toEqual([])
})

/** A paragraph's words with each field read as its value, as the page and the artefact both show them; the no-break spaces kept. */
const said = (node: Element) => { const copy = node.cloneNode(true) as Element; for (const input of copy.querySelectorAll('input')) input.replaceWith(input.getAttribute('value') ?? (input as HTMLInputElement).value); return copy.textContent!.replace(/[ \t\n\r]+/g, ' ').trim() }

for (const width of [1440, 375]) test(`what a run is worth is the artefact, word for word: one sentence, its arithmetic and the sources at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const section = page.locator('section[aria-labelledby="worth"]')
  // Issue #53, item 1: the words of design/artefacts/roi-section.html, verbatim, and the same in the copy the README carries.
  const { parseHTML } = await import('linkedom')
  const artefact = parseHTML(`<html><body>${await readFile('design/artefacts/roi-section.html', 'utf8')}</body></html>`).document
  const note = artefact.querySelector('.claim footer')!.cloneNode(true) as Element
  note.querySelector('.srcs')!.remove()
  const read = (selector: string) => section.locator(selector).evaluate(node => { const copy = node.cloneNode(true) as Element; for (const input of copy.querySelectorAll('input')) input.replaceWith((input as HTMLInputElement).value); return copy.textContent!.replace(/[ \t\n\r]+/g, ' ').trim() })
  await expect(section.getByRole('heading', { level: 2 })).toHaveText(artefact.querySelector('h1')!.textContent!)
  expect(worth.heading).toBe(artefact.querySelector('h1')!.textContent)
  expect(await read('.worth-say')).toBe(said(artefact.querySelector('.claim p')!))
  expect(await read('.worth-say')).toBe(worth.sentence)
  expect(await read('.worth-arithmetic')).toBe(said(note))
  expect(await read('.worth-arithmetic')).toBe(worth.arithmetic)
  const links = [...artefact.querySelectorAll('.srcs a')].map(link => ({ name: link.textContent, href: link.getAttribute('href') }))
  expect(worth.sources).toEqual(links)
  await expect(section.locator('.worth-sources a')).toHaveText(links.map(link => link.name!))
  expect(await section.locator('.worth-sources a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual(links.map(link => link.href))
  // No figure and no calculator: only the heading, the sentence, the arithmetic and the sources.
  await expect(section.locator('[data-figure], figure, form, button, select, video, img, svg, table')).toHaveCount(0)
  await expect(section.locator('.worth-say b')).toHaveCSS('font-weight', '500')
  await expect(section.locator('.worth-say b')).toHaveCSS('color', 'rgb(17, 17, 17)')
  await expect(section.locator('.worth-say .worth-time')).toHaveCSS('color', 'rgb(184, 77, 0)')
  await expect(section.locator('.worth-say .worth-time')).toHaveCSS('font-weight', '500')
  await expect(section.locator('.worth-say')).toHaveCSS('font-size', width === 1440 ? '23px' : '20px')
  await expect(section.locator('.worth-arithmetic')).toHaveCSS('text-wrap', /pretty/)
  // The four given numbers are fields set as the arithmetic's code, labelled as the artefact labels them, each as wide as what it holds.
  const fields = section.locator('.worth-arithmetic code input')
  const given = [...artefact.querySelectorAll('.claim footer input')].map(input => ({ value: input.getAttribute('value'), label: input.getAttribute('aria-label') }))
  expect(given).toHaveLength(4)
  expect(Object.values(worth.given)).toEqual(given)
  expect(await fields.evaluateAll(nodes => nodes.map(node => ({ value: (node as HTMLInputElement).value, label: node.getAttribute('aria-label') })))).toEqual(given)
  for (const field of await fields.all()) {
    await expect(field).toHaveAttribute('type', 'text')
    await expect(field).toHaveCSS('border-bottom-style', 'dashed')
    await expect(field).toHaveCSS('font-family', /Fira[_ ]Code/)
    expect(await field.evaluate((node: HTMLInputElement) => Math.abs(node.scrollWidth - node.clientWidth) <= 1 && node.clientWidth < 80)).toBe(true)
  }
  // On the grid: the heading in the five, the sentence and the arithmetic in the right seven, the arithmetic no wider than the sentence
  // and, at 1440, 600px and two lines.
  const [heading, say, arithmetic] = await Promise.all(['h2', '.worth-say', '.worth-arithmetic'].map(selector => section.locator(selector).boundingBox()))
  expect(arithmetic!.width).toBeLessThanOrEqual(say!.width + 0.5)
  if (width === 1440) {
    expect([Math.round(heading!.x), Math.round(say!.x), Math.round(arithmetic!.x)]).toEqual([96, 630, 630])
    expect(Math.round(arithmetic!.width)).toBe(600)
    expect(await section.locator('.worth-arithmetic').evaluate(node => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)))).toBe(2)
  } else {
    expect([Math.round(heading!.x), Math.round(say!.x)]).toEqual([16, 16])
    expect(say!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height)
  }
  expect((await new AxeBuilder({ page }).include('section[aria-labelledby="worth"]').analyze()).violations).toEqual([])

  // Item 1: a new price recomputes the sentence and the arithmetic on every keystroke; minutes under 90, hours to one place above.
  const price = section.getByRole('textbox', { name: worth.given.price.label })
  await price.fill('')
  await price.pressSequentially('120')
  await expect(section.locator('.worth-say')).toContainText('Five people cost about $120, about 77\u00a0minutes of a US developer')
  await expect.poll(() => read('.worth-arithmetic')).toContain('$120 ÷ $93 = 1.29 h, about 77\u00a0minutes.')
  await price.press('Backspace')
  await expect(section.locator('.worth-say b')).toHaveText('$12')
  await price.fill('200')
  await expect(section.locator('.worth-say .worth-time')).toHaveText('2.2\u00a0hours')
  expect(await price.evaluate((node: HTMLInputElement) => node.style.getPropertyValue('--n'))).toBe('3')
  // The given numbers drive the derived ones: the share moves the rate in both places.
  const share = section.getByRole('textbox', { name: worth.given.share.label })
  await share.fill('50')
  await expect.poll(() => read('.worth-arithmetic')).toBe('The arithmetic: $135,980 ÷ 2,080 h = $65 an hour in wages. Wages are 50% of what employers pay, so about $131 an hour. $200 ÷ $131 = 1.53 h, about 1.5\u00a0hours.')
  // A number is written back in the artefact's format on leaving its field; nothing is stored, so a reload restores the defaults.
  const pay = section.getByRole('textbox', { name: worth.given.pay.label })
  await pay.fill('100000')
  await pay.blur()
  await expect(pay).toHaveValue('100,000')
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0)
  await page.reload()
  await expect(section.locator('.worth-say')).toHaveText(worth.sentence)
  await expect.poll(() => read('.worth-arithmetic')).toBe(worth.arithmetic)
  expect(errors).toEqual([])
})

test('the run\'s time never breaks across a line, in the sentence or the arithmetic, at any width', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const times = page.locator('section[aria-labelledby="worth"] .worth-time')
  await expect(times).toHaveText(['39\u00a0minutes', '39\u00a0minutes'])
  for (const width of [320, 340, 360, 375, 390, 414, 480, 600, 700, 768, 820, 900, 1024, 1180, 1280, 1366, 1440, 1600]) {
    await page.setViewportSize({ width, height: 900 })
    // One line box each: the number and the word, and the full stop after the arithmetic's, stay together.
    expect(await times.evaluateAll(nodes => nodes.map(node => node.getClientRects().length)), `at ${width}px`).toEqual([1, 1])
    expect(await times.last().evaluate(node => { const range = document.createRange(); range.setStart(node.firstChild!, 0); range.setEnd(node.nextSibling!, 1); return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size }), `the full stop at ${width}px`).toBe(1)
  }
})

for (const width of [1440, 375]) test(`the hero's Get started opens the getting-started page: the commands, the tag, the server and the study, accessible and in the site's fonts at ${width}px`, async ({ page }) => {
  const { gettingStarted } = await import('../../apps/web/lib/getting-started')
  await page.setViewportSize({ width, height: 1000 })
  await withoutTroupe(page)
  await page.goto('/')
  await page.locator('.hero .actions').getByRole('link', { name: landing.start }).click()
  await page.waitForURL('**/docs/getting-started/')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(gettingStarted.title)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  const blocks = await page.locator('.docs-code pre').allInnerTexts()
  for (const step of gettingStarted.steps) {
    if ('command' in step) expect(blocks).toContain(step.command)
    if ('tag' in step) {
      expect(blocks).toContain(step.tag)
      expect(blocks).toContain(step.docker)
      expect(await page.locator('.docs-setups li').allInnerTexts()).toEqual(step.setups.map(setup => `${setup.name}: ${setup.line}`))
    }
    if ('code' in step) expect(blocks).toContain(step.code)
  }
  expect(blocks).toContain(gettingStarted.clone.commands.join('\n'))
  expect(offences(await page.locator('main').innerText(), shown)).toEqual([])
  await expect(page.locator('pre').first()).toHaveCSS('font-family', /Fira[_ ]Code/)
})

test('getting started links to the agents page, which introduces agent runs as a capability test and is accessible', async ({ page }) => {
  await page.goto('/docs/getting-started/')
  await page.getByRole('link', { name: agent.heading }).click()
  await page.waitForURL('**/docs/agents/')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(agent.heading)
  await expect(page.locator('main')).toContainText('capability test, not a usability one')
  await expect(page.locator('main')).toContainText('An agent passing says nothing about people.')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.goto('/')
  expect(await page.locator('main').innerText()).not.toContain('ui-tests (agent)')
})
