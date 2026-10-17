import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { inviteExample, inviteFile, compilation, promise, intro, landing, guide, agent, hosted, runs, sources } from '../../apps/web/lib/copy'
import { shown, offences } from '../vocabulary'

/** Every content type's component on the landing page (docs/design/site-schema.md). */
const artefacts = ['terminal-window', 'code-window', 'attempt-view', 'compilation', 'sources', 'checks-box', 'findings-list', 'reel-frame', 'dashboard']
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
  for (const [name, route] of [['landing', '/'], ['guide', '/docs/getting-started']]) {
    test(`site ${name} at ${width}px: layout, accessibility, fonts, themes, highlighting and copy`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(route)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      // Issue #38: the light theme by default, the Tokyo Night alternate under the system setting and under data-theme, axe clean in both.
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 246, 246)')
      await expect(page.locator('body')).toHaveCSS('color', 'rgb(17, 17, 17)')
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(26, 27, 38)')
      expect((await new AxeBuilder({ page }).analyze()).violations, 'dark alternate').toEqual([])
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light' })
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 246, 246)')
      await page.emulateMedia({ colorScheme: 'light' })
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(26, 27, 38)')
      await page.evaluate(() => { delete document.documentElement.dataset.theme })
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 246, 246)')
      const fonts = await page.locator('body *').evaluateAll(nodes => [...new Set(nodes.filter(node => node.getBoundingClientRect().width && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())).map(node => getComputedStyle(node).fontFamily))])
      for (const font of fonts) expect(font).toMatch(/^['"]?(?:__)?Fira[_ ](?:Sans|Code)/)
      await expect(page.locator('pre').first()).toHaveCSS('font-family', /Fira[_ ]Code/)

      // Item 2: only the terminal carries terminal chrome.
      const dots = await page.locator('.window-dots').evaluateAll(nodes => nodes.map(node => !!node.closest('[data-artefact="terminal-window"]')))
      expect(dots.length).toBeGreaterThan(0)
      expect(dots.every(Boolean)).toBe(true)
      // The theme rules (design/artefacts/README.md): the site's own surfaces are white windows on the canvas with the line colour as their edge.
      for (const selector of ['.attempt-view', '.findings-list', '.dashboard', '.reel-frame', '.checks-box', '.hosted-form', '.src-row[aria-expanded="true"]', '.src-well:not([hidden])', '.terminal-window', '.code-window']) {
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
        for (const [key, text] of Object.entries(landing)) if (!['fileCaption', 'moment', 'words', 'scenario', 'priority', 'result', 'reached'].includes(key)) await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first(), key).toBeVisible()
        for (const text of [agent.heading, agent.lead, agent.closing, hosted.heading, hosted.lead, hosted.closing, compilation.heading, compilation.lead]) await expect(page.getByText(text, { exact: true })).toBeVisible()
        // Round six: one section in place of "What the person sees" and "Three commands".
        await expect(page.getByRole('heading', { name: 'What the person sees.' })).toHaveCount(0)
        await expect(page.getByRole('heading', { name: 'Three commands.' })).toHaveCount(0)
        await expect(page.locator('h1')).toHaveCSS('font-size', width === 1440 ? '72px' : '44px')
        for (const artefact of artefacts) await expect(page.locator(`[data-artefact="${artefact}"]`).first(), artefact).toBeVisible()
        // Issue #38, item 2: the hero has no session behind it: no recording, no gestures, no sensors; only the texture.
        await expect(page.locator('.hero video, .hero-session, .hero .sensor, .hero-backdrop figcaption, .hero-backdrop .gesture-scene, .hero-backdrop button')).toHaveCount(0)
        expect(await page.locator('.hero-backdrop > *').evaluateAll(nodes => nodes.map(node => node.className))).toEqual(['trace-texture'])
        await expect(page.locator('.hero-backdrop')).toHaveText('')
        await expect(page.getByRole('button', { name: /frustration gestures|texture/i })).toHaveCount(0)
        // Item 2: block 2 shows one results artefact, the attempt view; the report views live in the pull-request example.
        const comesBack = page.locator('section[aria-labelledby="comes-back"]')
        await expect(comesBack.locator('[data-artefact]')).toHaveCount(1)
        await expect(comesBack.locator('[data-artefact="attempt-view"]')).toHaveCount(1)
        // Issue #22: nothing on the attempt view or in the report rows, the check, the dashboard or the terminals uses the old words.
        expect(offences(await comesBack.innerText(), shown)).toEqual([])
        for (const selector of ['.findings-list', '.checks-box', '.dashboard', '.terminal-window']) for (const text of await page.locator(selector).allInnerTexts()) expect(offences(text, shown), selector).toEqual([])
        await expect(page.locator('section[aria-labelledby="pull-request"] [data-artefact="findings-list"]')).toHaveCount(1)
        // Item 3: the hosted block shows the snippet and a dashboard of several runs; no reels repeated.
        const hostedBlock = page.locator('section[aria-labelledby="hosted"]')
        await expect(hostedBlock.locator('video, [data-artefact="reel-frame"], [data-artefact="attempt-view"], [data-artefact="findings-list"]')).toHaveCount(0)
        await expect(hostedBlock.locator('.dashboard tbody tr')).toHaveCount(runs.length)
        // Round seven: the sources table in place of the three cards, its copy the artefact's, in the order link, visitors, paid panel.
        const people = page.locator('section[aria-labelledby="people"]')
        await expect(people.locator('.option-card')).toHaveCount(0)
        for (const text of [sources.heading, sources.lead]) await expect(people.getByText(text, { exact: true })).toBeVisible()
        await expect(people.locator('.src-row .src-name b')).toHaveText(sources.rows.map(row => row.name))
        await expect(people.locator('.src-cols')).toBeVisible({ visible: width === 1440 })
        const heights = await people.locator('.src-row').evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)))
        if (width === 1440) expect(heights.every(height => height >= 152)).toBe(true)
        // Item 6: the agent block runs against an API.
        await expect(page.locator('section[aria-labelledby="agents"]')).toContainText('Agent run · add a member through the API · 5 trials')
        await expect(page.locator('section[aria-labelledby="agents"]')).toContainText(agent.fileLine)
        await expect(page.getByRole('link', { name: 'Get started', exact: true }).first()).toHaveAttribute('href', '/docs/getting-started')
      } else {
        await expect(page.locator('.step')).toHaveCount(8)
        await expect(page.locator('[data-artefact="findings-list"], [data-artefact="attempt-view"]')).toHaveCount(0)
        // Item 5: the guide's first step offers both ways in.
        await expect(page.locator('#install')).toContainText('On any other site, paste one line instead')
        await expect(page.locator('.guide-head')).toContainText(guide.requirement)
        for (const text of [guide.install, guide.try, guide.write, guide.next, guide.once, guide.pr, guide.agent]) await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first()).toBeVisible()
        // The agent step matches the landing's API example; the hosted form has the screen fields.
        await expect(page.locator('#agent')).toContainText(agent.fileLine)
        for (const [label, value] of [['Did, recently', hosted.screen.did], ['Within', hosted.screen.within], ['Uses any of', hosted.screen.uses], ['Not', hosted.screen.not]]) await expect(page.locator('.hosted-form').getByLabel(label, { exact: true })).toHaveValue(value)
        await page.getByRole('navigation', { name: 'Getting started' }).getByRole('link', { name: /Run it with real people/ }).click()
        await expect(page.locator('#real-people h2')).toBeInViewport()
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

  test(`reduced motion shows stills, and the results views respond to the visitor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForTimeout(1500)
    // Under reduced motion the texture's waves hold one still frame.
    await expect(page.locator('.hero-backdrop')).toHaveAttribute('data-motion', 'still')
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    const still = await page.locator('.trace-texture').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    await page.waitForTimeout(250)
    expect(await page.locator('.trace-texture').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(still)
    await expect(page.locator('.types-once pre')).toHaveCSS('animation-name', 'none')

    // The attempt view (issue #22, item 1): the result, the index worst first, the flow, how it felt, the folds closed, the footer.
    const view = page.locator('.attempt-view')
    await expect(view.locator('.attempt-headline')).toHaveText('Person 3 did not reach the goal.')
    for (const [term, value] of [['Reached the goal?', 'No'], ['How it ended', 'Pressed Done'], ["How sure they'd done it", '6 of 7'], ['Time on this goal', '1 min 3 s']]) await expect(view.locator('.attempt-facts div').filter({ hasText: term })).toContainText(value)
    await expect(view.locator('.attempt-facts')).toContainText('at 1:03')
    await expect(view.locator('.attempt-result .lede')).toHaveText('Pressed Done with 2 invitations pending. The check expects 1 invitation pending.')
    await expect(view.locator('.attempt-index li')).toHaveText([/1\s*Wrong end state at 00:58/, /2\s*Slowed 16 s at 00:03/, /3\s*Confused 13 s at 00:23/])
    await view.locator('.attempt-index a').first().click()
    await expect(page).toHaveURL(/#moment-1$/)
    // The flow: every moment in time order, the three cards set in at their own time, the last row how it ended.
    expect(await view.locator('.attempt-flow > li').evaluateAll(items => items.map(item => item.classList.contains('flow-moment') ? `card ${item.getAttribute('data-n')}` : item.querySelector('time')!.textContent))).toEqual(['00:00', 'card 2', 'card 3', '00:41', '00:46', 'card 1', '01:03'])
    await expect(view.locator('.attempt-flow > li').last()).toContainText('Pressed Done')
    const card = view.locator('#moment-2 .moment-card')
    await expect(card.locator('.moment-steps li')).toHaveText([/00:03\s*Clicked Share · menu open/, /00:05\s*Stopped 7 s on the menu/, /00:12\s*Off your path · opened Link settings/, /00:19\s*Went back to the board/])
    await expect(card.locator('.said')).toContainText('Share seemed like the place for people.')
    await expect(card.locator('.change')).toContainText('Put "Invite a colleague" at the top of the Share menu.')
    await expect(view.locator('#moment-3 .unsaid')).toHaveText('They said nothing about this moment.')
    // The card is 7 of 12 clip and 5 of 12 text, side by side at 1440 and stacked at 375.
    const [clip, text] = await Promise.all([card.locator('.moment-media').boundingBox(), card.locator('.moment-text').boundingBox()])
    if (width === 1440) expect(clip!.width / (clip!.width + text!.width)).toBeCloseTo(7 / 12, 1)
    else expect(text!.y).toBeGreaterThanOrEqual(clip!.y + clip!.height - 1)
    await expect(view.locator('.attempt-felt dl > div')).toHaveText([/How easy was it\?\s*3 of 7\s*7 = very easy · typical 5\.5/, /How sure they'd done it\s*6 of 7\s*7 = completely sure/, /Time on this goal\s*1 min 3 s\s*others: 0:47 to 0:57/])
    await expect(view.locator('.attempt-words')).toContainText("Share seemed like the place for people. When I found it I wasn't sure the first Add did anything, so I pressed it again.")
    for (const fold of await view.locator('details').all()) expect(await fold.evaluate((node: HTMLDetailsElement) => node.open)).toBe(false)
    await view.getByText('Their path and yours').click()
    await expect(view.locator('.attempt-path i.off')).toHaveText(['/board/link (off your path)'])
    await expect(view.locator('.attempt-foot')).toHaveText(/Person 3 of 5 · paid panel.*Uses a spreadsheet for this today.*Desktop · Chromium · window 1280×800.*14 Oct 2026.*Recorded: screen, voice\. Camera: declined\./)
    // No separate player panel and no lane chart: the only videos are the three clips, each inside its card.
    await expect(view.locator('video')).toHaveCount(3)
    await expect(view.locator('.lanes, .session-video, input[type=range]')).toHaveCount(0)
    // The clip plays the real recording in place, from its start second, under reduced motion too; the step list follows it.
    const press = card.getByRole('button', { name: /^Play 00:03 to 00:19/ })
    await press.click()
    const video = card.locator('video')
    await expect(card.getByRole('button', { name: /^Pause 00:03 to 00:19/ })).toBeVisible()
    await expect(card).toHaveClass(/is-playing/)
    expect(await video.evaluate((element: HTMLVideoElement) => element.currentSrc)).toContain('/sessions/p3.webm')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime), { timeout: 10_000 }).toBeGreaterThan(5.2)
    await expect(card.locator('.moment-steps li[aria-current="step"]')).toContainText('00:05')
    expect(await card.locator('.moment-scrub').evaluate(node => parseFloat(getComputedStyle(node).getPropertyValue('--now')))).toBeGreaterThan(10)
    // One clip at a time: pressing another pauses the first.
    await view.locator('#moment-1').getByRole('button', { name: /^Play 00:58 to 01:03/ }).click()
    await expect(view.locator('.moment-card.is-playing')).toHaveCount(1)
    await expect(view.locator('#moment-1 .moment-card')).toHaveClass(/is-playing/)
    expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
    // Pressing it again pauses it.
    await view.locator('#moment-1').getByRole('button', { name: /^Pause 00:58 to 01:03/ }).click()
    await expect(view.locator('.moment-card.is-playing')).toHaveCount(0)
    expect(await view.locator('#moment-1 video').evaluate((element: HTMLVideoElement) => element.paused)).toBe(true)
    // Under reduced motion nothing in the view transitions.
    expect(await view.locator('*').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).transitionDuration.split(', ').every(duration => duration === '0s')))).toBe(true)

    // The findings list: rows expand, reels play on their control, each evidence cell opens that person at that moment.
    const findings = page.locator('.findings-list')
    for (let i = 0; i < 4; i++) {
      if (i > 0) await findings.locator('.finding-toggle').nth(i).click()
      const reel = findings.locator('video')
      expect(await reel.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
      await findings.getByRole('button', { name: 'Play problem moment', exact: true }).click()
      await expect.poll(() => reel.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0)
      await findings.getByRole('button', { name: 'Pause problem moment', exact: true }).click()
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    for (const [person, at, row] of [[1, 4, 3], [2, 6, 3], [4, 41, 1], [5, 9, 3]] as const) {
      await findings.getByRole('button', { name: `Watch Person ${person} at 00:${String(at).padStart(2, '0')}, problem ${row}` }).click()
      await expect(findings.locator('video')).toHaveAttribute('src', `/sessions/p${person}.webm`)
      await expect.poll(() => findings.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(at)
    }
    // Item 12: fixed-width fields first and the free text last, numbers right-aligned, in every page table.
    expect(await findings.locator('.finding-line').first().evaluate(row => [...row.children].map(child => child.className))).toEqual(['num rank', 'num count', 'finding-impact', 'cells', 'finding-toggle'])
    const dashboard = page.locator('.dashboard')
    expect(await dashboard.locator('thead th').allTextContents()).toEqual(['Date', 'People', 'Status', 'Result', 'Run'])
    await expect(dashboard.locator('td.num').first()).toHaveCSS('text-align', 'right')
    await expect(dashboard.locator('tbody tr').first().locator('td').last()).toHaveText(runs[0].name)
  })
}

test('the texture behind the hero moves slowly and continuously in the line colour, and follows the theme', async ({ page }) => {
  await page.goto('/')
  const texture = page.locator('.trace-texture')
  await expect(page.locator('.hero-backdrop')).toHaveAttribute('data-motion', 'running')
  // The waves are drawn in the line colour: on the light ground, #e2e2e2. Every strongly painted pixel is that colour, give or take rounding.
  const offLine = (target: number[]) => texture.evaluate((canvas: HTMLCanvasElement, line) => {
    const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    let painted = 0, worst = 0
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) { painted++; worst = Math.max(worst, ...line.map((value, c) => Math.abs(data[i + c] - value))) }
    return painted > 1000 ? worst : Infinity
  }, target)
  expect(await offLine([226, 226, 226])).toBeLessThanOrEqual(2)
  // It keeps moving: three frames a second apart all differ.
  const frames: string[] = []
  for (let i = 0; i < 3; i++) { frames.push(await texture.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())); await page.waitForTimeout(1000) }
  expect(new Set(frames).size).toBe(3)
  // On the dark alternate the waves take its line colour.
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect.poll(() => offLine([41, 46, 66])).toBeLessThanOrEqual(2)
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('.wordmark svg')).toHaveCSS('color', 'rgb(75, 63, 240)')
  // The header's wordmark is the mark and the name on one line, never painted over by the source logos' masked rule.
  await expect(page.locator('.site-header .wordmark')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('.site-header .wordmark')).toHaveCSS('display', 'flex')
})

for (const width of [1440, 375]) test(`what you write, what they see: one column, the file, six pieces, stepped frames of one height, no console errors at ${width}px`, async ({ page }) => {
  const errors: string[] = []
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const section = page.locator('section.compilation')
  const column = (await section.locator('.compile-column').boundingBox())!
  // One 800px reading column, centred on the grid: 8 of 12 columns at 1440; the whole width of the 327px column at 375.
  if (width === 1440) { expect(column.width).toBe(800); expect(Math.abs(column.x + column.width / 2 - 720)).toBeLessThanOrEqual(1) }
  else expect(column.width).toBe(327)
  // The three commands as cards, in one row at 1440 and stacked at 375.
  const commands = await section.locator('.compile-command').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top))
  expect(commands).toHaveLength(3)
  if (width === 1440) expect(new Set(commands).size).toBe(1); else expect(new Set(commands).size).toBe(3)
  // The whole file, as init writes it, in the site's highlighter.
  const file = section.locator('.lines-window').first()
  expect((await file.locator('li code').allInnerTexts()).join('\n')).toBe(inviteExample)
  // Six pieces in participant order, each with its note, its own lines under their original numbers, a frame and what comes back.
  await expect(section.locator('.compile-piece h3')).toHaveText(compilation.pieces.map(piece => new RegExp(`^${piece.n}${piece.name}`)))
  for (const piece of compilation.pieces) {
    const row = section.locator(`#piece-${piece.id}`)
    await expect(row.locator('.compile-back')).toHaveText(`Comes back${piece.returns}`)
    await expect(row.locator('.compile-frame')).toHaveCount(1)
    if (!piece.lines.length) { await expect(row.locator('.lines-window')).toHaveCount(0); continue }
    const numbers = (await row.locator('.lines-body .ln').allInnerTexts()).filter(Boolean).map(Number)
    expect(numbers).toEqual(piece.lines)
    // A skipped run of lines is one dots row.
    const gaps = piece.lines.filter((n, i) => i && n - piece.lines[i - 1] > 1).length
    await expect(row.locator('.lines-body li.gap')).toHaveCount(gaps)
  }
  // At 375 the code wraps instead of scrolling.
  if (width === 375) for (const body of await section.locator('.lines-body').all()) expect(await body.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  // The stepped frames keep one height through every step, by the sheet's own Next and by the control under the frame.
  for (const [id, count] of [['screener', 6], ['after', 5]] as const) {
    const row = section.locator(`#piece-${id}`), frame = row.locator('.compile-frame'), stepper = row.locator('.stepper')
    await frame.scrollIntoViewIfNeeded()
    const height = (await frame.boundingBox())!.height
    await expect(stepper.locator('.where')).toHaveText(`1 of ${count}`)
    await expect(stepper.getByRole('button', { name: /^Previous/ })).toBeDisabled()
    for (let step = 2; step <= count; step++) {
      await frame.locator('.car-step.is-current .next-step').click()
      await expect(stepper.locator('.where')).toHaveText(`${step} of ${count}`)
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
  await expect(section.locator('#piece-bar .ch-pill')).toHaveCSS('height', '40px')
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
  // The link is open on arrival; opening another closes it.
  expect(await open()).toEqual(['true', 'false', 'false'])
  await expect(wells.locator('visible=true')).toHaveCount(1)
  await rows.nth(1).click()
  expect(await open()).toEqual(['false', 'true', 'false'])
  await expect(section.locator('#visitors-well')).toBeVisible()
  await expect(section.locator('#link-well')).toBeHidden()
  // The well is the real player's invitation, with the one string; a click inside it keeps the row open.
  const { invitationText } = await import('../../packages/ui-tests/src/next')
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
  await section.locator('.src-head h2').click()
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
  await page.goto('/')
  // The flow's rows first: every row keeps its exact box when the pointer rests on it.
  const rows = page.locator('.attempt-flow > li')
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i)
    await row.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const before = await row.boundingBox()
    await row.hover()
    expect(await row.boundingBox(), `flow row ${i + 1} hover`).toEqual(before)
  }
  const targets = ['.moment-press', '.attempt-index a', '.attempt-fold summary', '.finding-toggle', '.cell.hit', '.watch-moment', '.copy-control', '.button', '.src-row:not([aria-expanded="true"])', '.check-row a', '.nav-links a', '.stepper .nextb', '.dashboard tbody tr']
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
})

test('the guide keeps its controls still on hover too', async ({ page }) => {
  await page.goto('/docs/getting-started')
  for (const selector of ['.step-index a', '.hosted-form input[role=switch]', '.hosted-form .button', '.copy-control', '.text-link']) {
    const target = page.locator(selector).first()
    await target.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const before = await target.boundingBox()
    await target.hover()
    expect(await target.boundingBox(), `${selector} hover`).toEqual(before)
    await target.focus()
    expect(await target.boundingBox(), `${selector} focus`).toEqual(before)
  }
  const form = page.locator('.hosted-form')
  await expect(form.getByLabel('Users', { exact: true })).toHaveValue(hosted.users)
  await expect(form.getByLabel('Your link', { exact: true })).toBeChecked()
  await expect(form.getByLabel('A paid panel', { exact: true })).not.toBeChecked()
  const method = form.getByLabel('How you can tell', { exact: true })
  // A change made before the form hydrates is lost in the dev server: retry until the evidence field follows the method.
  await expect(async () => {
    await method.selectOption('Element seen')
    await expect(form.getByLabel('Element', { exact: true })).toBeVisible({ timeout: 500 })
  }).toPass({ timeout: 10_000 })
  await method.selectOption('Page reached')
  await form.getByLabel('Page path', { exact: true }).fill('/settings/team')
  await method.selectOption('Element seen')
  await expect(form.getByLabel('Element', { exact: true })).toHaveValue('')
  await method.selectOption('Page reached')
  await expect(form.getByLabel('Page path', { exact: true })).toHaveValue('/settings/team')
  await form.getByRole('button', { name: 'Start the run' }).click()
  await expect(form.getByRole('status')).toContainText('Example run ready')
})

test('failed playback restores the attempt clip and reel play controls without a pause event', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      this.dispatchEvent(new Event('play'))
      return new Promise<void>((_, reject) => {
        (this as HTMLMediaElement & { rejectPlay: () => void }).rejectPlay = () => reject(new DOMException('Playback denied', 'NotAllowedError'))
      })
    }
  })
  await page.goto('/')
  const view = page.locator('.attempt-view')
  const findings = page.locator('.findings-list')
  for (const [container, play, pause] of [[view, /^Play 00:03 to 00:19/, /^Pause 00:03 to 00:19/], [findings, /^Play problem moment$/, /^Pause problem moment$/]] as const) {
    await container.getByRole('button', { name: play }).click()
    await expect(container.getByRole('button', { name: pause })).toBeVisible()
    const video = container.locator('video').first()
    await expect.poll(() => video.evaluate(element => 'rejectPlay' in element)).toBe(true)
    await video.evaluate((element: HTMLVideoElement & { rejectPlay: () => void }) => element.rejectPlay())
    await expect(container.getByRole('button', { name: play })).toBeVisible()
  }
  // Exercise the effect-driven playback handler as well as both button handlers.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await findings.locator('.finding-toggle').nth(1).click()
  await expect(findings.getByRole('button', { name: 'Pause problem moment', exact: true })).toBeVisible()
  await findings.locator('video').evaluate((video: HTMLVideoElement & { rejectPlay: () => void }) => video.rejectPlay())
  await expect(findings.getByRole('button', { name: 'Play problem moment', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
