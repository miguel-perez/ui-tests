// Captures every block of both pages at 1440 and 375 and measures it against docs/design/grid-plan.md.
// Run against a running site, with Playwright's bundled Chromium:
//   PLAYWRIGHT_BROWSERS_PATH=0 UI_HARNESS_ROOT=/path/to/ui-harness node apps/web/scripts/measure-blocks.mjs
// Writes design/screens/blocks/<page>-<block>-<width>.png and design/screens/grid-readings.json.
// The ui-harness layout rows (grid quality, balance, density, white space, regularity) are feedback, not a gate;
// the plan's own rule is checked here: empty area in a block never exceeds the area of its artefacts.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const base = process.env.SITE_BASE_URL ?? 'http://localhost:3000'
const harness = process.env.UI_HARNESS_ROOT
const pages = [
  { name: 'landing', route: '/', blocks: [['L1', 'main > section.hero'], ...['comes-back', 'what-you-write', 'people', 'pull-request', 'agents', 'hosted'].map((id, i) => [`L${i + 2}`, `section.block[aria-labelledby="${id}"]`])] },
  { name: 'guide', route: '/docs/getting-started', blocks: [['G0', '.guide-head'], ...['install', 'set-up', 'try-it', 'write-your-own', 'real-people', 'agent', 'paste', 'fill'].map((id, i) => [`G${i + 1}`, `#${id}`])] },
]
/** The typed content of a block: what the grid plan places. Everything else inside a block is either part of these or empty. */
const content = '.guide-head > *, .hero-copy, .hero-artefact, .section-head h2, .section-head p, .src-head h2, .src-head p, [data-artefact], .caption, .terms, .actions, .step-head, .step-label, .mount-steps, .step-see > p, .step-type > p'

const browser = await chromium.launch()
const readings = []
await mkdir('design/screens/blocks', { recursive: true })
for (const width of [1440, 375]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
  for (const { name, route, blocks } of pages) {
    await page.goto(base + route, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    for (const [id, selector] of blocks) {
      const block = page.locator(selector).first()
      await block.scrollIntoViewIfNeeded()
      const file = `design/screens/blocks/${name}-${id}-${width}.png`
      await block.screenshot({ path: file })
      const measured = await block.evaluate((root, contentSelector) => {
        const frame = root.getBoundingClientRect(), style = getComputedStyle(root)
        // The block's region without its vertical rhythm padding: the 96px above and below belong between blocks.
        const top = frame.top + parseFloat(style.paddingTop), height = frame.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        const rel = r => [Math.round(r.left - frame.left), Math.round(r.top - top), Math.round(r.width), Math.round(r.height)]
        const boxes = []
        for (const el of root.querySelectorAll('*')) {
          if (el.closest('svg') && el.tagName.toUpperCase() !== 'SVG') continue
          const s = getComputedStyle(el), r = el.getBoundingClientRect()
          if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0 || r.width < 2 || r.height < 2) continue
          const tag = el.tagName.toUpperCase()
          const imageLike = ['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'IFRAME'].includes(tag), control = ['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(tag)
          const text = el.children.length === 0 && el.textContent.trim().length > 0
          const paints = s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== 'none'
          const empty = el.children.length === 0 && !text && !imageLike && !control
          if (empty && !paints) continue
          // The background session and texture sit behind the hero and are not placed content.
          if (el.closest('.hero-backdrop')) continue
          const leaf = el.children.length === 0 || imageLike || control
          boxes.push([tag, ...rel(r), leaf ? 1 : 0, text ? 1 : 0, imageLike ? 1 : 0])
        }
        // Union of the typed content's boxes on a 4px raster, against the block's area.
        const cell = 4, gw = Math.ceil(frame.width / cell), gh = Math.ceil(height / cell), grid = new Uint8Array(gw * gh)
        const placed = [...root.querySelectorAll(contentSelector)].filter(el => !el.parentElement.closest(contentSelector) || el.parentElement.closest(contentSelector) === root)
        for (const el of placed) {
          const [x, y, w, h] = rel(el.getBoundingClientRect())
          for (let yy = Math.max(0, Math.floor(y / cell)); yy < Math.min(gh, Math.ceil((y + h) / cell)); yy++) for (let xx = Math.max(0, Math.floor(x / cell)); xx < Math.min(gw, Math.ceil((x + w) / cell)); xx++) grid[yy * gw + xx] = 1
        }
        const filled = grid.reduce((sum, value) => sum + value, 0) * cell * cell, area = gw * gh * cell * cell
        return { width: Math.round(frame.width), height: Math.round(height), boxes, contentArea: filled, emptyArea: area - filled }
      }, content)
      readings.push({ page: name, block: id, width, capture: file, height: measured.height, contentArea: measured.contentArea, emptyArea: measured.emptyArea, emptyWithinRule: measured.emptyArea <= measured.contentArea, boxes: measured.boxes })
    }
  }
  await page.close()
}
await browser.close()

if (harness) {
  // The register's layout rows, computed by its own code on the block's leaf boxes with the block as the region.
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(harness, '_pipeline'))})
from harness.layout import layout_metrics, reading
rows = json.load(sys.stdin)
def said(k, m):
    # The register's reading() cannot word a block with a single text gap; the value is still reported.
    try: return reading(k, m)
    except TypeError: return ''
out = []
for r in rows:
    leaves = [b for b in r['boxes'] if b[5] == 1]
    m = layout_metrics(leaves, r['width'], r['height'])
    out.append({k: m[k] for k in ('grid_quality', 'ngo_balance', 'ngo_density', 'white_space', 'ngo_regularity')} | {'reading': {k: said(k, m) for k in ('grid_quality', 'ngo_balance', 'white_space', 'ngo_regularity')}})
print(json.dumps(out))`
  const metrics = JSON.parse(execFileSync('python3', ['-I', '-c', script], { input: JSON.stringify(readings.map(r => ({ boxes: r.boxes, width: r.width, height: r.height }))), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
  readings.forEach((reading, i) => { reading.harness = metrics[i] })
}
for (const reading of readings) delete reading.boxes
await writeFile('design/screens/grid-readings.json', JSON.stringify({ measured: new Date().toISOString().slice(0, 10), harness: harness ? 'ui-harness harness.layout.layout_metrics' : null, readings }, null, 2) + '\n')
for (const r of readings) console.log(`${r.page.padEnd(8)} ${r.block.padEnd(3)} ${String(r.width).padStart(4)}  content ${String(r.contentArea).padStart(8)}  empty ${String(r.emptyArea).padStart(8)}  ${r.emptyWithinRule ? 'ok' : 'EMPTY EXCEEDS CONTENT'}${r.harness ? `  grid ${r.harness.grid_quality} balance ${r.harness.ngo_balance} density ${r.harness.ngo_density} white ${r.harness.white_space} regularity ${r.harness.ngo_regularity}` : ''}`)
if (readings.some(r => !r.emptyWithinRule)) process.exitCode = 1
