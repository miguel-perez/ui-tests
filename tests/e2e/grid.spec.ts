import { test, expect, type Page } from '@playwright/test'
import { writeFile, mkdir } from 'node:fs/promises'

/**
 * The page grid (issue #46, item 1). Every landing and guide section sits on
 * the 1248px container: at 1440 its heading starts at 96; a landing section's lead, where it has one, keeps to 64ch inside the right
 * seven and ends flush with the container at 1344 (the host section's rule since issue #56, every section's since issue #65), and a
 * guide step's lead starts at 630 over the figures it introduces in the right seven; every figure takes all twelve columns
 * (96, 1248 wide) or the right seven (630, 714 wide), so the widest is 1248 or 714; at 375 everything is one 343px column, 16px in,
 * with no horizontal scroll. A section is a `[data-section]`; its heading, lead and figures are the `[data-heading]`, `[data-lead]`
 * and outermost `[data-figure]` that belong to it and not to a section inside it.
 */
type Box = { x: number; y: number; width: number; height: number }
type Reading = { section: string; heading: Box; lead: Box | null; figures: Box[] }

async function read(page: Page): Promise<Reading[]> {
  return page.locator('[data-section]').evaluateAll(sections => sections.map(section => {
    const own = (selector: string) => [...section.querySelectorAll(selector)].filter(node => node.closest('[data-section]') === section)
    const box = (node: Element) => { const r = node.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.top + scrollY), width: Math.round(r.width * 10) / 10, height: Math.round(r.height) } }
    const [heading] = own('[data-heading]'), [lead] = own('[data-lead]')
    const figures = own('[data-figure]').filter(node => !node.parentElement?.closest('[data-figure]')).map(box).filter(figure => figure.width > 0)
    return { section: section.getAttribute('data-section')!, heading: box(heading), lead: lead ? box(lead) : null, figures }
  }))
}

const near = (value: number, target: number) => Math.abs(value - target) <= 2
const readings: Record<string, unknown> = {}

for (const [name, route, count] of [['landing', '/', 6]] as const) {
  test(`the ${name} sits on one grid at 1440: headings at 96, leads ${name === 'landing' ? 'ending at 1344' : 'at 630'}, figures 1248 or 714`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    const sections = await read(page)
    expect(sections).toHaveLength(count)
    for (const { section, heading, lead, figures } of sections) {
      expect(near(heading.x, 96), `${section} heading at ${heading.x}`).toBe(true)
      expect(heading.width, `${section} heading in the first five columns`).toBeLessThanOrEqual(512)
      if (lead && name === 'landing') {
        // Issue #65, item 3: every lead keeps to 64ch in the right seven and ends flush with the container's right edge.
        expect(near(lead.x + lead.width, 1344), `${section} lead ends at ${lead.x + lead.width}`).toBe(true)
        expect(lead.x, `${section} lead in the right seven`).toBeGreaterThanOrEqual(630 - 2)
      } else if (lead) expect(near(lead.x, 630), `${section} lead at ${lead.x}`).toBe(true)
      for (const figure of figures) expect((near(figure.x, 96) && near(figure.width, 1248)) || (near(figure.x, 630) && near(figure.width, 714)), `${section} figure at ${figure.x}, ${figure.width} wide`).toBe(true)
      if (figures.length) expect([1248, 714].some(width => near(Math.max(...figures.map(figure => figure.width)), width)), `${section} widest figure`).toBe(true)
    }
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    if (name === 'landing') {
      // Seven sections in order (the hero, then these six; issue #53 puts what a run is worth before the agents), and the whole page no taller than 9,000px.
      expect(sections.map(section => section.section)).toEqual(['what-comes-back', 'compilation', 'sources', 'worth', 'agents', 'hosted'])
      expect(height).toBeLessThanOrEqual(9000)
      // Every section but "How it works." has a lead, and each was held to 1344 above.
      expect(sections.filter(section => section.lead).map(section => section.section)).toEqual(['compilation', 'sources', 'worth', 'agents', 'hosted'])
    }
    readings[`${name}-1440`] = { height, sections: sections.map(({ section, heading, lead, figures }) => ({ section, heading: heading.x, lead: lead?.x ?? null, leadRight: lead ? Math.round(lead.x + lead.width) : null, widest: figures.length ? Math.max(...figures.map(figure => figure.width)) : null, figures: figures.map(figure => `${figure.x}+${figure.width}`) })) }
  })

  test(`the ${name} is one column at 375 with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const sections = await read(page)
    for (const { section, heading, lead, figures } of sections) {
      expect(near(heading.x, 16), `${section} heading at ${heading.x}`).toBe(true)
      if (lead) {
        expect(near(lead.x, 16), `${section} lead at ${lead.x}`).toBe(true)
        expect(lead.y, `${section} lead under its heading`).toBeGreaterThanOrEqual(heading.y + heading.height)
      }
      for (const figure of figures) expect(near(figure.x, 16) && near(figure.width, 343), `${section} figure at ${figure.x}, ${figure.width} wide`).toBe(true)
    }
    readings[`${name}-375`] = { height: await page.evaluate(() => document.documentElement.scrollHeight), sections: sections.map(({ section, heading, lead, figures }) => ({ section, heading: heading.x, lead: lead?.x ?? null, figures: figures.map(figure => `${figure.x}+${figure.width}`) })) }
  })
}

// Issue #51, item 3: no separators and one rhythm in three steps, --space-1 24, --space-2 48 and --space-3 96, which on a phone are
// 24, 36 and 64. Every section opens with --space-3; a head is followed by --space-2; nothing else spaces a section's top-level
// children but those steps; the last section closes with --space-3; the hero keeps --space-3 above and below.
for (const [name, route] of [['landing', '/']] as const) for (const width of [1440, 375]) {
  test(`the ${name} keeps one rhythm and no separators at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    const [one, two, three] = width === 1440 ? [24, 48, 96] : [24, 36, 64]
    const sections = await page.locator('[data-section]').evaluateAll(nodes => nodes.map(node => {
      const style = getComputedStyle(node), motif = (pseudo: string) => getComputedStyle(node, pseudo).content
      const head = node.querySelector(':scope > .section-head'), next = head?.nextElementSibling
      const children = [...node.children].map((child, i) => { const own = getComputedStyle(child); return { i, top: parseFloat(own.marginTop), bottom: parseFloat(own.marginBottom), name: child.className } })
      return { name: node.getAttribute('data-section'), top: parseFloat(style.paddingTop), border: parseFloat(style.borderBottomWidth) + parseFloat(style.borderTopWidth), before: motif('::before'), after: motif('::after'), gap: head && next ? Math.round(next.getBoundingClientRect().top - head.getBoundingClientRect().bottom) : null, children, block: node.classList.contains('block') }
    }))
    expect(sections.length).toBeGreaterThan(4)
    for (const section of sections) {
      expect(section.top, `${section.name} opens with --space-3`).toBe(three)
      expect(section.border, `${section.name} has no rule`).toBe(0)
      expect([section.before, section.after], `${section.name} has no motif`).toEqual(['none', 'none'])
      if (section.gap !== null) expect(section.gap, `${section.name}: from its head to its first figure`).toBe(two)
      if (section.block) for (const child of section.children) {
        expect(child.bottom, `${section.name} > ${child.name}`).toBe(0)
        expect(child.i ? [one, two] : [0], `${section.name} > ${child.name}`).toContain(child.top)
      }
    }
    if (name === 'landing') {
      expect(sections.filter(section => section.gap !== null)).toHaveLength(5)
      await expect(page.locator('.hero-grid')).toHaveCSS('padding-top', `${three}px`)
      await expect(page.locator('.hero-grid')).toHaveCSS('padding-bottom', `${three}px`)
      await expect(page.locator('.block').last()).toHaveCSS('padding-bottom', `${three}px`)
    } else await expect(page.locator('.guide')).toHaveCSS('padding-bottom', `${three}px`)
  })
}

// Issue #51, item 4: the footer on every page, on the grid: the wordmark at 96 and the links ending flush at 1344 at 1440; one column
// at 375, the links left-aligned.
for (const route of ['/']) for (const width of [1440, 375]) {
  test(`the footer of ${route} sits on the grid at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    const footer = page.getByRole('contentinfo')
    await expect(footer).toHaveCount(1)
    const links = footer.getByRole('navigation').getByRole('link')
    await expect(links).toHaveText(['miguel.design', 'Open source MIT licence', 'Report a bug or suggest an improvement'])
    expect(await links.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))).toEqual(['https://miguel.design', 'https://github.com/miguel-perez/ui-tests/blob/main/LICENSE', 'https://github.com/miguel-perez/ui-tests/issues/new'])
    await expect(footer.getByRole('link', { name: /github/i })).toHaveCount(0)
    for (const link of await links.all()) {
      await expect(link).toHaveCSS('color', 'rgb(87, 87, 87)')
      await expect(link).toHaveCSS('font-size', '14px')
    }
    await expect(footer).toHaveCSS('padding-top', width === 1440 ? '48px' : '36px')
    await expect(footer).toHaveCSS('padding-bottom', width === 1440 ? '48px' : '36px')
    const wordmark = await footer.locator('.wordmark').boundingBox(), boxes = await links.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(({ x, right, top, bottom }) => ({ x, right, top, bottom })))
    const left = Math.min(...boxes.map(box => box.x)), right = Math.max(...boxes.map(box => box.right))
    if (width === 1440) {
      expect(near(wordmark!.x, 96), `wordmark at ${wordmark!.x}`).toBe(true)
      expect(near(right, 1344), `links end at ${right}`).toBe(true)
      expect(near(boxes.at(-1)!.right, 1344), 'the last link ends flush').toBe(true)
      expect(left, 'links in the right seven').toBeGreaterThanOrEqual(630 - 2)
    } else {
      expect(near(wordmark!.x, 16), `wordmark at ${wordmark!.x}`).toBe(true)
      expect(near(left, 16), `links start at ${left}`).toBe(true)
      expect(right).toBeLessThanOrEqual(359 + 1)
      expect(Math.min(...boxes.map(box => box.top)), 'links under the wordmark').toBeGreaterThanOrEqual(wordmark!.y + wordmark!.height)
    }
  })
}

test.afterAll(async () => {
  // The readings go to the PR description beside the column map; ignored runtime output, never committed.
  if (!Object.keys(readings).length) return
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/grid-readings.json', JSON.stringify(readings, null, 2))
})
