import { test, expect, type Page } from '@playwright/test'

/**
 * No rules anywhere on the page (issue #62, item 2). Every element wider
 * than 500px on the landing, at 1440 and 375, is walked: none outside a drawn surface may show a top or bottom border, be
 * an `hr`, or be a filled strip 1 to 2px tall, nor may its ::before or ::after. At 375 the column is 343px, so nothing is 500 wide:
 * there the walk takes every element wider than 300px, the width of a rule across the column. Hairlines stay inside the drawn surfaces
 * below: a window (terminal, code, host and file windows, GitHub's merge box and check page), the Weekboard frames and their chrome, the
 * open source row's well, the compile commands' list (one drawn box since issue #68), the agent tiles, an inline code chip, the replay's moment card and its rail, which is
 * the drawing itself.
 */
const surfaces = ['.window', '.pr-gh', '.compile-frame', '.src-frame', '.src-well', '.compile-commands', '.compile-command', '.agents-tile', '.code-inline', '.replay-moment', '.replay-rail', '.ch-sheet', '.ch-pill', '.terminal-window', '.code-window', '.host-window']

type Rule = { element: string; what: string; width: number }

/** The rules on the page outside the drawn surfaces, as `tag.class: what`. */
function rules(page: Page): Promise<Rule[]> {
  return page.evaluate(surfaces => {
    const found: Rule[] = [], wide = Math.min(500, innerWidth - 75)
    const name = (node: Element) => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${typeof node.className === 'string' && node.className ? `.${node.className.trim().split(/\s+/).join('.')}` : ''}`
    const painted = (colour: string) => colour !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(colour)
    const edge = (style: CSSStyleDeclaration, side: 'Top' | 'Bottom') => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== 'none' && style[`border${side}Style`] !== 'hidden' && painted(style[`border${side}Color`])
    const strip = (style: CSSStyleDeclaration, height: number) => height >= 0.5 && height <= 2.5 && (painted(style.backgroundColor) || style.backgroundImage !== 'none')
    for (const node of document.querySelectorAll('body *')) {
      if (node.closest(surfaces.join(', '))) continue
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      if (rect.width <= wide || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
      const what: string[] = []
      if (node.tagName === 'HR') what.push('hr')
      if (edge(style, 'Top')) what.push(`border-top ${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`)
      if (edge(style, 'Bottom')) what.push(`border-bottom ${style.borderBottomWidth} ${style.borderBottomStyle} ${style.borderBottomColor}`)
      if (strip(style, rect.height)) what.push(`a ${rect.height}px strip`)
      for (const pseudo of ['::before', '::after']) {
        const own = getComputedStyle(node, pseudo)
        if (own.content === 'none' || own.display === 'none') continue
        // A pseudo-element counts at its own width: a numbered badge before a step is not a rule.
        const height = parseFloat(own.height), width = own.width === 'auto' ? rect.width : parseFloat(own.width)
        if (width <= wide) continue
        if (edge(own, 'Top') || edge(own, 'Bottom')) what.push(`${pseudo} border`)
        if (strip(own, height)) what.push(`${pseudo} ${height}px strip`)
      }
      if (what.length) found.push({ element: name(node), what: what.join(', '), width: Math.round(rect.width) })
    }
    return found
  }, surfaces)
}

/** Opens every closed fold the visitor can open, so a rule inside one is seen: the sources table's first row. */
async function openRows(page: Page) {
  const row = page.locator('.src-row').first()
  if (await row.count()) { await row.click(); await expect(row).toHaveAttribute('aria-expanded', 'true') }
}

for (const [name, route] of [['landing', '/']] as const) for (const width of [1440, 375]) {
  test(`the ${name} has no rule outside a drawn surface at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    expect(await rules(page)).toEqual([])
    // Hovering a source row and opening one draws its gradient and its surface, never a line.
    await openRows(page)
    expect(await rules(page)).toEqual([])
    // The test sees a rule when there is one: a border on a section, an hr and a 1px strip are each found.
    await page.addStyleTag({ content: '[data-section] { border-top: 1px solid #e2e2e2 }' })
    expect((await rules(page)).map(rule => rule.what)).toContain('border-top 1px solid rgb(226, 226, 226)')
  })
}

test('the rule test finds an hr and a 1px strip outside a surface, and leaves the surfaces alone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  expect(await rules(page)).toEqual([])
  await page.evaluate(() => {
    const block = document.querySelector('[data-section]')!
    block.insertAdjacentHTML('beforeend', '<hr data-probe="hr"><div data-probe="strip" style="height:1px;background:#e2e2e2"></div>')
    document.querySelector('.window')!.insertAdjacentHTML('beforeend', '<hr data-probe="inside">')
  })
  const found = await rules(page)
  expect(found.map(rule => rule.what)).toEqual(expect.arrayContaining([expect.stringContaining('hr'), 'a 1px strip']))
  // The hr inside the window is not reported: only the one in the section is.
  expect(found.filter(rule => rule.element === 'hr')).toHaveLength(1)
})
