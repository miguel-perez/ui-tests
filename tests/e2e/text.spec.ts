import { test, expect, type Page } from '@playwright/test'

/**
 * How text wraps and how wide it runs (issue #65, items 1 and 2). On the landing, at 1440 and 375:
 *
 * - No orphans. Every text block wider than 120px (a paragraph, a list item, a heading, a caption, a quote, a definition) that runs
 *   to two or more lines ends on at least two words. A block's words are the ones whose nearest block is it, so a list item holding a
 *   paragraph is not read twice; a non-breaking space separates two words. A time or a code alone on the last line is allowed (the
 *   report's moment chips), and blocks inside `pre`, `code`, tables and terminals are not text to wrap.
 * - A reading measure. No paragraph runs wider than 72ch, measured on its longest line in its own font, except the worth section's
 *   arithmetic, which keeps its 600px by design, and the drawn surfaces' own lines: the report window's crumbs, legend and footer and
 *   the replay rail's two ends. The check page on GitHub is a surface too, but its intro is a running paragraph and is measured.
 */
const blocks = 'p, li, h1, h2, h3, h4, figcaption, blockquote, dd, dt, caption'
const skipped = 'pre, code, table, .terminal-window, .terminal-body, .code-window, .host-window, .lines-body, [aria-hidden="true"], .sr-only'
const exempt = '.worth-note, .caption-code, .window:not(.pr-cp), .replay-rail'

type Orphan = { block: string; text: string; last: string; lines: number }
type Wide = { block: string; text: string; ch: number }

/** The blocks that end on a single word. */
function orphans(page: Page): Promise<Orphan[]> {
  return page.evaluate(({ blocks, skipped }) => {
    const found: Orphan[] = []
    const label = (node: Element) => `${node.tagName.toLowerCase()}${typeof node.className === 'string' && node.className ? `.${node.className.trim().split(/\s+/).join('.')}` : ''}`
    const words = new Map<Element, { text: Text; start: number; end: number; code: boolean }[]>()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
      // A text's block is its nearest ancestor that is not laid out inline: a step's number set as a block over its heading is its own.
      let block = node.parentElement
      while (block && /^(inline|contents)/.test(getComputedStyle(block).display)) block = block.parentElement
      if (!block || !block.matches(blocks) || block.closest(skipped)) continue
      const code = !!node.parentElement!.closest('code, kbd, a[href^="http"]')
      const list = words.get(block) ?? []
      // Every run of non-space, split at any space including a non-breaking one.
      for (const match of node.data.matchAll(/[^\s]+/g)) list.push({ text: node, start: match.index, end: match.index + match[0].length, code })
      words.set(block, list)
    }
    for (const [block, list] of words) {
      const rect = block.getBoundingClientRect(), style = getComputedStyle(block)
      if (rect.width <= 120 || style.display === 'none' || style.visibility === 'hidden' || !list.length) continue
      // A word's line is where its last fragment sits; a word glued to the next by punctuation in another element is one word.
      const placed: { word: string; code: boolean; top: number; bottom: number; right: number; left: number }[] = []
      for (const { text, start, end, code } of list) {
        const range = document.createRange()
        range.setStart(text, start); range.setEnd(text, end)
        const rects = [...range.getClientRects()].filter(box => box.width > 0)
        if (!rects.length) continue
        const box = rects.at(-1)!
        placed.push({ word: text.data.slice(start, end), code, top: box.top, bottom: box.bottom, left: box.left, right: box.right })
      }
      if (!placed.length) continue
      // Lines: words whose vertical centres fall within half a line of each other.
      const lines: (typeof placed)[] = []
      for (const word of placed) {
        const centre = (word.top + word.bottom) / 2, line = lines.find(line => Math.abs((line[0].top + line[0].bottom) / 2 - centre) < (line[0].bottom - line[0].top) / 2)
        if (line) line.push(word); else lines.push([word])
      }
      if (lines.length < 2) continue
      const last = lines.reduce((low, line) => line[0].top > low[0].top ? line : low)
      // Pieces of one word touch: "<b>Done</b>." is one word on the line.
      const joined = [...last].sort((a, b) => a.left - b.left).reduce<(typeof placed)[]>((runs, word) => {
        const run = runs.at(-1)
        if (run && word.left - run.at(-1)!.right < 1) run.push(word); else runs.push([word])
        return runs
      }, [])
      if (joined.length > 1) continue
      const word = joined[0].map(piece => piece.word).join('')
      // A time or a code alone at the end of a line is allowed: the report's moment chips, an inline code or a link's address.
      if (joined[0].some(piece => piece.code)) continue
      if (/^\d{1,2}:\d{2}[.,)]?$/.test(word) || /^(?=.*\d)(?=.*[a-z])[a-z0-9]+$/i.test(word)) continue
      found.push({ block: label(block), text: (block.textContent ?? '').trim().slice(0, 80), last: word, lines: lines.length })
    }
    return found
  }, { blocks, skipped })
}

/** The paragraphs that run wider than the measure, in ch of their own font. */
function wide(page: Page, limit: number): Promise<Wide[]> {
  return page.evaluate(({ skipped, exempt, limit }) => {
    const found: Wide[] = []
    for (const node of document.querySelectorAll('p')) {
      if (node.closest(skipped) || node.closest(exempt)) continue
      const style = getComputedStyle(node)
      // A paragraph laid out as a row of items (the report's share line and its control) is not running text.
      if (style.display === 'none' || style.visibility === 'hidden' || /flex|grid/.test(style.display)) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const rects = [...range.getClientRects()].filter(box => box.width > 0)
      if (!rects.length) continue
      const width = Math.max(...rects.map(box => box.right)) - Math.min(...rects.map(box => box.left))
      const probe = document.createElement('span')
      probe.style.cssText = 'position:absolute;visibility:hidden;width:1ch;height:0;padding:0;border:0'
      node.append(probe)
      const ch = probe.getBoundingClientRect().width
      probe.remove()
      const measure = Math.round(width / ch * 10) / 10
      if (measure > limit) found.push({ block: `${node.tagName.toLowerCase()}${node.className ? `.${String(node.className).trim().split(/\s+/).join('.')}` : ''}`, text: (node.textContent ?? '').trim().slice(0, 80), ch: measure })
    }
    return found
  }, { skipped, exempt, limit })
}

const pages = [['landing', '/']] as const

for (const [page, route] of pages) for (const width of [1440, 375]) {
  test(`the ${page} has no orphan and no paragraph over 72ch at ${width}`, async ({ page: tab }) => {
    await tab.setViewportSize({ width, height: 1000 })
    await tab.goto(route)
    await tab.evaluate(() => document.fonts.ready)
    expect(await orphans(tab)).toEqual([])
    expect(await wide(tab, 72)).toEqual([])
  })
}

test('the text test sees an orphan, a word joined to it by a non-breaking space, and a paragraph over 72ch', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => {
    const section = document.querySelector('[data-section]')!
    section.insertAdjacentHTML('beforeend', '<p data-probe="orphan">Some words on the first line<br>alone</p>')
    section.insertAdjacentHTML('beforeend', '<p data-probe="joined">Some words on the first<br>line\u00a0alone</p>')
    section.insertAdjacentHTML('beforeend', `<p data-probe="wide" style="max-width:none">${'A paragraph that runs across the whole container, '.repeat(6)}</p>`)
  })
  const found = await orphans(page)
  expect(found.map(orphan => orphan.last)).toContain('alone')
  expect(found.filter(orphan => orphan.last === 'alone')).toHaveLength(1)
  expect((await wide(page, 72)).map(paragraph => paragraph.text)).toEqual([expect.stringContaining('A paragraph that runs')])
})
