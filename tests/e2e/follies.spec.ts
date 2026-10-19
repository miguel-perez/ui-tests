import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { FolliesState } from '../../apps/web/components/cursor-follies'
import { heroStages, keepOut, rules, stages } from '../../apps/web/lib/follies'

/**
 * Issue #75: the cursor follies on the landing. The canvas keeps its state in a `follies` property, never in the markup; these tests
 * read it there. Catches go through the page as clicks do. The model (waves, keep-outs, spots, gating, casting) is in tests/follies.test.ts.
 */
const layer = 'canvas.cursor-follies'
const follies = (page: Page) => page.locator(layer).evaluate(node => (node as HTMLCanvasElement & { follies: FolliesState }).follies)
/** Opens the landing at a size with motion allowed and the pointer parked in the corner, away from every stage. */
async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.mouse.move(width - 2, height - 2)
}
/** The scale the troupe draws at: 3 units, or 2.5 under 700px. */
const scale = (page: Page) => page.evaluate(() => document.documentElement.clientWidth < 700 ? 2.5 : 3)

/**
 * Catches the first cursor in trouble that is in view: the pointer events of a click at the middle of its body, dispatched in the same
 * task as its position is read, so a cursor that swings fast is still where the click lands. Returns the stage it was caught on.
 */
function catchOne(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas.cursor-follies') as HTMLCanvasElement & { follies: FolliesState }
    const k = document.documentElement.clientWidth < 700 ? 2.5 : 3
    const actor = canvas.follies.actors.find(actor => actor.trouble)
    if (!actor) return null
    const x = actor.x + 5 * k - scrollX, y = actor.y + 10 * k - scrollY
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null
    const target = document.elementFromPoint(x, y) ?? document.body
    const init = { clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true, button: 0, pointerType: 'mouse', isPrimary: true, view: window }
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) target.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init))
    return actor.stage
  })
}
/** Whether any idle cursor's box, plus the 10px margin, overlaps a keep-out rect, read in one task with the rects themselves. */
function restingOnContent(page: Page, keep: string, margin: number) {
  return page.evaluate(({ keep, margin }) => {
    const canvas = document.querySelector('canvas.cursor-follies') as HTMLCanvasElement & { follies: FolliesState }
    const k = document.documentElement.clientWidth < 700 ? 2.5 : 3
    const keeps = [...document.querySelectorAll(keep)].map(node => node.getBoundingClientRect()).filter(r => r.width && r.height).map(r => ({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }))
    const idle = canvas.follies.actors.filter(actor => actor.mode === 'idle')
    const hits = idle.flatMap(actor => {
      const box = { x: actor.x - 6, y: actor.y - 6, w: 12 * k + 14, h: 20 * k + 14 }
      return keeps.filter(r => box.x < r.x + r.w + margin && box.x + box.w > r.x - margin && box.y < r.y + r.h + margin && box.y + box.h > r.y - margin).map(r => ({ actor, r }))
    })
    return { idle: idle.length, hits }
  }, { keep, margin })
}

test('the layer is one canvas, fixed over the window, drawn only: no panel, no text, no controls, and no change to the markup', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(String(error)))
  // Every change to the markup, so a change the layer made would be seen.
  await page.addInitScript(() => {
    const log: string[] = []
    ;(window as unknown as { mutations: string[] }).mutations = log
    const name = (node: Node) => node instanceof Element ? `${node.tagName.toLowerCase()}${node.className && typeof node.className === 'string' ? `.${node.className.split(' ')[0]}` : ''}` : node.nodeName
    const observer = new MutationObserver(records => { for (const record of records) log.push(`${record.type} ${name(record.target)} ${record.attributeName ?? ''} ${[...record.addedNodes].map(name).join(',')}`) })
    // From the end of the parse: the canvas the server sent arrives while the document is parsed, and is not a change.
    document.addEventListener('DOMContentLoaded', () => observer.observe(document, { subtree: true, childList: true, attributes: true }))
  })
  // The server's markup carries the canvas once, empty, with nothing but its class and aria-hidden.
  const html = await (await request.get('/')).text()
  expect(html.match(/<canvas[^>]*cursor-follies[^>]*>/g)).toEqual(['<canvas class="cursor-follies" aria-hidden="true">'])
  expect(html).toContain('<canvas class="cursor-follies" aria-hidden="true"></canvas>')
  expect(html).not.toMatch(/cf-panel|cf-tpl|Cursor Follies|data-cf-/)

  await open(page, 1440, 900)
  const canvas = page.locator(layer)
  await expect(canvas).toHaveCount(1)
  await expect(canvas).toHaveAttribute('aria-hidden', 'true')
  await expect(canvas).toHaveCSS('position', 'fixed')
  await expect(canvas).toHaveCSS('pointer-events', 'none')
  expect(await canvas.evaluate(node => { const r = node.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })).toEqual([0, 0, 1440, 900])
  // Only on the landing.
  expect(await page.evaluate(() => document.querySelectorAll('canvas').length - document.querySelectorAll('.page-texture canvas').length)).toBe(1)

  // The markup is watched from the end of the parse, so a change the layer makes while it mounts is seen too.
  await expect.poll(async () => (await follies(page)).actors.length, { timeout: 2000 }).toBe(1)
  // A scene starts on the hero; the page around it shows nothing of the layer.
  await expect.poll(async () => (await follies(page)).actors.some(actor => actor.mode === 'performing'), { timeout: 8000 }).toBe(true)
  await expect.poll(async () => (await follies(page)).actors.some(actor => actor.trouble), { timeout: 8000 }).toBe(true)
  await expect(page.locator('.cf-panel, [data-cf-speed], #cf-catch, cf-overlay')).toHaveCount(0)
  expect(await canvas.evaluate(node => [node.childNodes.length, node.getAttributeNames().sort(), node.textContent])).toEqual([0, ['aria-hidden', 'class', 'height', 'width'], ''])
  expect(await page.getByRole('button', { name: /catch|restart|skip|speed|cursors|follies|keep-out|principle/i }).count()).toBe(0)
  expect(await page.locator('body').innerText()).not.toMatch(/Cursor Follies|wave \d|keep-out|Squash|Anticipation/)
  // The page's own texture still runs underneath, and the page is axe clean with the troupe on it.
  await expect(page.locator('.page-texture')).toHaveAttribute('data-motion', 'running')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  // A catch, then the layer's markup is as it was: no attribute on the canvas but its size, nothing added to the document, no style on
  // the root or the body.
  await expect.poll(() => catchOne(page), { timeout: 5000, intervals: [50] }).not.toBeNull()
  await expect.poll(async () => (await follies(page)).wave, { timeout: 15_000 }).toBe(2)
  await page.waitForTimeout(1500)
  const mutations = await page.evaluate(() => (window as unknown as { mutations: string[] }).mutations)
  const ours = mutations.filter(line => /canvas\.cursor-follies/.test(line) && !/^attributes canvas\.cursor-follies (width|height) $/.test(line))
  expect(ours).toEqual([])
  expect(mutations.filter(line => /^attributes (html|body)\b/.test(line) && !/^attributes html class/.test(line))).toEqual([])
  expect(await page.evaluate(() => [document.documentElement.getAttribute('style'), document.body.getAttribute('style')])).toEqual([null, null])
  expect(errors).toEqual([])
})

test('at 1440x900 one cursor appears within 2s, a scene starts on a hero stage within 8s, and catching it brings a wave of two', async ({ page }) => {
  await open(page, 1440, 900)
  await expect.poll(async () => (await follies(page)).actors.length, { timeout: 2000, intervals: [100] }).toBe(1)
  expect((await follies(page)).wave).toBe(1)
  await expect.poll(async () => (await follies(page)).actors.find(actor => actor.mode === 'performing')?.stage ?? null, { timeout: 8000, intervals: [100] }).not.toBeNull()
  const { actors } = await follies(page)
  expect(heroStages).toContain(actors[0].stage)
  // Caught while in trouble: the logomark, the bow, offstage; then two.
  await expect.poll(async () => (await follies(page)).actors.some(actor => actor.trouble), { timeout: 8000, intervals: [100] }).toBe(true)
  await expect.poll(() => catchOne(page), { timeout: 5000, intervals: [50] }).not.toBeNull()
  await expect.poll(async () => (await follies(page)).actors.some(actor => actor.trouble), { timeout: 2000 }).toBe(false)
  await expect.poll(async () => (await follies(page)).wave, { timeout: 15_000 }).toBe(2)
  await expect.poll(async () => (await follies(page)).actors.filter(actor => actor.mode !== 'gone').length, { timeout: 10_000 }).toBe(2)
  await expect(page).toHaveURL(/\/$/)
})

test('a visitor who stays at the top at 1440x900 sees all four exits within the first four scenes', async ({ page }) => {
  test.setTimeout(150_000)
  await open(page, 1440, 900)
  const scenes: string[] = []
  // Let every scene play to its end; record each scene's stage as it starts.
  await expect.poll(async () => {
    const state = await follies(page)
    for (const actor of state.actors) if (actor.mode === 'performing' && actor.stage && !scenes.includes(actor.stage)) scenes.push(actor.stage)
    return Object.values(state.exits).reduce((a, b) => a + b, 0)
  }, { timeout: 130_000, intervals: [200] }).toBe(4)
  const { exits, wave } = await follies(page)
  expect(exits).toEqual({ confusion: 1, frustration: 1, hook: 1, spinner: 1 })
  expect(scenes).toHaveLength(4)
  for (const scene of scenes) expect(heroStages).toContain(scene)
  // Nothing was caught, so the troupe is still on its first wave.
  expect(wave).toBe(1)
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('three waves caught bring one happy cursor that never enters a stage', async ({ page }) => {
  test.setTimeout(240_000)
  await open(page, 1440, 900)
  // The driver catches every cursor in trouble. The hero's stages each play once until they leave the view, so it moves the view from
  // stage to stage whenever nothing is on, the way a reader scrolls.
  await page.evaluate(() => addEventListener('click', event => { if ((event.target as Element).closest?.('a')) event.preventDefault() }, { capture: true }))
  const order = ['.hero', ...stages.map(stage => stage.sel).filter(sel => !heroStages.includes(sel))]
  let at = 0, quiet = 0
  const caught: string[] = []
  await expect.poll(async () => {
    const stage = await catchOne(page)
    if (stage) caught.push(stage)
    const state = await follies(page)
    if (state.wave === 'happy') return state.wave
    quiet = state.actors.some(actor => actor.mode === 'performing') ? 0 : quiet + 1
    if (quiet > 15) {
      quiet = 0; at = (at + 1) % order.length
      await page.evaluate(sel => { const el = document.querySelector(sel); if (el) scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + scrollY - (innerHeight - Math.min(innerHeight - 40, el.getBoundingClientRect().height)) / 2), behavior: 'instant' }) }, order[at])
    }
    return state.wave
  }, { timeout: 220_000, intervals: [200] }).toBe('happy')
  expect(caught.length).toBe(1 + 2 + 3)
  // One cursor, very happy, that stays and never acts out a problem, wherever the reader goes. The last wave's cursors have left.
  await expect.poll(async () => { const { actors } = await follies(page); return actors.length === 1 && actors[0].stage === null }, { timeout: 10_000 }).toBe(true)
  for (let i = 0; i < 40; i++) {
    const state = await follies(page)
    expect(state.wave).toBe('happy')
    expect(state.actors.length).toBeLessThanOrEqual(1)
    for (const actor of state.actors) { expect(actor.stage).toBeNull(); expect(actor.mode).not.toBe('performing'); expect(actor.trouble).toBe(false) }
    if (i === 20) await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
    await page.waitForTimeout(250)
  }
})

test('at 390x844 the same first scene runs on the hero', async ({ page }) => {
  await open(page, 390, 844)
  await expect.poll(async () => (await follies(page)).actors.length, { timeout: 2000, intervals: [100] }).toBe(1)
  await expect.poll(async () => (await follies(page)).actors.find(actor => actor.mode === 'performing')?.stage ?? null, { timeout: 8000, intervals: [100] }).toBe('.hero .actions')
  expect((await follies(page)).actors[0].fate).toBe('hesitation')
})

for (const [width, height] of [[1440, 900], [390, 844]]) test(`at ${width}x${height} no resting cursor sits on a keep-out rect plus its margin, sampled every 250ms for 10s`, async ({ page }) => {
  await open(page, width, height)
  // Where no stage is wholly in view the cursors rest and roam instead of performing: the view is moved to such a place first, then to
  // the top, where they rest between scenes.
  const quiet = await page.evaluate(({ selectors, height }) => {
    const spans = selectors.map(selector => document.querySelector(selector)).filter(Boolean).map(node => { const r = node!.getBoundingClientRect(); return [r.top + scrollY, r.bottom + scrollY] })
    const tops: number[] = []
    for (let top = 0; top < document.documentElement.scrollHeight - height; top += 50) if (!spans.some(([a, b]) => a >= top + 4 && b <= top + height - 4)) tops.push(top)
    return tops
  }, { selectors: stages.map(stage => stage.sel), height })
  expect(quiet.length).toBeGreaterThan(0)
  let idle = 0
  for (const top of [quiet[0], 0]) {
    await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), top)
    for (let i = 0; i < 20; i++) {
      const sample = await restingOnContent(page, keepOut, rules.margin)
      expect(sample.hits).toEqual([])
      idle += sample.idle
      await page.waitForTimeout(250)
    }
  }
  expect(idle).toBeGreaterThan(0)
})

test('under reduced motion there are no cursors', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator(layer)).toHaveCount(1)
  for (let i = 0; i < 12; i++) {
    expect((await follies(page)).actors).toEqual([])
    await page.waitForTimeout(250)
  }
})

test('with an uncontained ui-tests task bar on the page from the start, no cursor appears', async ({ page }) => {
  // A task bar from the first paint: nothing, ever.
  await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.insertAdjacentHTML('beforeend', '<aside data-research-taskbar class="uit uit-bar"></aside>')))
  await open(page, 1440, 900)
  for (let i = 0; i < 16; i++) { expect((await follies(page)).actors).toEqual([]); await page.waitForTimeout(250) }
})

test('a live surface injected mid-scene clears the cursors within a second; a contained one does not', async ({ page }) => {
  await open(page, 1440, 900)
  await expect.poll(async () => (await follies(page)).actors.some(actor => actor.mode === 'performing'), { timeout: 8000 }).toBe(true)
  // A contained invitation, as the sources table shows one, is a picture: the scene plays on.
  await page.evaluate(() => document.documentElement.insertAdjacentHTML('beforeend', '<section class="uit uit-invite uit-contained" data-research-taskbar></section>'))
  await page.waitForTimeout(600)
  expect((await follies(page)).actors.length).toBeGreaterThan(0)
  await page.evaluate(() => document.documentElement.insertAdjacentHTML('beforeend', '<section class="uit uit-invite" data-research-taskbar></section>'))
  await expect.poll(async () => (await follies(page)).actors, { timeout: 1000, intervals: [100] }).toEqual([])
  await page.waitForTimeout(3000)
  expect((await follies(page)).actors).toEqual([])
})

test('clicks go through to the page: Get started navigates while a cursor is on the page, and a click on a cursor in trouble over a link does not', async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, 1440, 900)
  // The nav's Guide link hosts the rage click, the second scene at the top: the cursor sits on the link and clicks it, and a real
  // click on it there catches it and goes no further.
  await expect.poll(async () => (await follies(page)).actors.some(actor => actor.trouble && actor.fate === 'rage click'), { timeout: 60_000, intervals: [100] }).toBe(true)
  const k = await scale(page)
  const { actors } = await follies(page)
  const actor = actors.find(actor => actor.trouble)!
  const point = { x: actor.x + 4, y: actor.y + 4 }
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x - scrollX, y - scrollY)?.closest('a')?.getAttribute('href'), point)).toBe('/docs/getting-started')
  expect(Math.hypot(point.x - (actor.x + 5 * k), point.y - (actor.y + 10 * k))).toBeLessThan(15 * k)
  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => (await follies(page)).actors.some(actor => actor.trouble), { timeout: 2000 }).toBe(false)
  await page.waitForTimeout(1000)
  await expect(page).toHaveURL(/\/$/)
  // With a cursor on the page that is not in trouble, Get started navigates as before.
  await page.mouse.move(1438, 898)
  await expect.poll(async () => { const state = await follies(page); return state.actors.length > 0 && !state.actors.some(actor => actor.trouble) }, { timeout: 20_000, intervals: [100] }).toBe(true)
  await page.getByRole('link', { name: 'Get started', exact: true }).first().click()
  await expect(page).toHaveURL(/\/docs\/getting-started$/)
})
