import { test, expect, type Page } from '@playwright/test'
import { writeFile, mkdir } from 'node:fs/promises'

/**
 * The page grid (design/artefacts/README.md, "The page grid, in one place"; issue #46, item 1). Every landing and guide section sits on
 * the 1248px container: at 1440 its heading starts at 96, its lead at 630 where it has one, and every figure takes all twelve columns
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

for (const [name, route, count] of [['landing', '/', 5], ['guide', '/docs/getting-started', 10]] as const) {
  test(`the ${name} sits on one grid at 1440: headings at 96, leads at 630, figures 1248 or 714`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    const sections = await read(page)
    expect(sections).toHaveLength(count)
    for (const { section, heading, lead, figures } of sections) {
      expect(near(heading.x, 96), `${section} heading at ${heading.x}`).toBe(true)
      expect(heading.width, `${section} heading in the first five columns`).toBeLessThanOrEqual(512)
      if (lead) expect(near(lead.x, 630), `${section} lead at ${lead.x}`).toBe(true)
      for (const figure of figures) expect((near(figure.x, 96) && near(figure.width, 1248)) || (near(figure.x, 630) && near(figure.width, 714)), `${section} figure at ${figure.x}, ${figure.width} wide`).toBe(true)
      if (figures.length) expect([1248, 714].some(width => near(Math.max(...figures.map(figure => figure.width)), width)), `${section} widest figure`).toBe(true)
    }
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    if (name === 'landing') {
      // Six sections in order (the hero, then these five), and the whole page no taller than 9,000px.
      expect(sections.map(section => section.section)).toEqual(['what-comes-back', 'compilation', 'sources', 'agents', 'hosted'])
      expect(height).toBeLessThanOrEqual(9000)
    }
    readings[`${name}-1440`] = { height, sections: sections.map(({ section, heading, lead, figures }) => ({ section, heading: heading.x, lead: lead?.x ?? null, widest: figures.length ? Math.max(...figures.map(figure => figure.width)) : null, figures: figures.map(figure => `${figure.x}+${figure.width}`) })) }
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

test.afterAll(async () => {
  // The readings go to the PR description beside the column map; ignored runtime output, never committed.
  if (!Object.keys(readings).length) return
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/grid-readings.json', JSON.stringify(readings, null, 2))
})
