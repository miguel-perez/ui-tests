import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { example, inviteExample, promise, intro, landing, guide, agent, hosted, runs } from '../../apps/web/lib/copy'
import { shown, offences } from '../vocabulary'

/** Every content type's component on the landing page (docs/design/site-schema.md). */
const artefacts = ['terminal-window', 'code-window', 'attempt-view', 'player-card', 'player-bar', 'player-questions', 'invite-link', 'cap-control', 'visitor-invitation', 'checks-box', 'findings-list', 'reel-frame', 'dashboard']
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
      const fonts = await page.locator('body *').evaluateAll(nodes => [...new Set(nodes.filter(node => node.getBoundingClientRect().width && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())).map(node => getComputedStyle(node).fontFamily))])
      for (const font of fonts) expect(font).toMatch(/^['"]?(?:__)?Fira[_ ](?:Sans|Code)/)
      await expect(page.locator('pre').first()).toHaveCSS('font-family', /Fira[_ ]Code/)
      const background = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor)
      await page.emulateMedia({ colorScheme: 'light' })
      await expect(page.locator('body')).toHaveCSS('background-color', background)

      // Item 2: only the terminal carries terminal chrome.
      const dots = await page.locator('.window-dots').evaluateAll(nodes => nodes.map(node => !!node.closest('[data-artefact="terminal-window"]')))
      expect(dots.length).toBeGreaterThan(0)
      expect(dots.every(Boolean)).toBe(true)
      // The theme rules (design/artefacts/README.md): product surfaces dark on the dark page, terminals and code windows dark.
      for (const selector of ['.attempt-view', '.findings-list', '.dashboard', '.reel-frame', '.option-mini', '.hosted-form', '.option-card']) {
        for (const surface of await page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) expect(luminance(surface), `${selector} is dark`).toBeLessThan(.05)
      }
      expect(await page.locator('.theme-light').count()).toBe(0)
      // The participant chrome over the light Weekboard is its inverse: Weekboard's ink, opaque, never a panel colour of the page or the app.
      const panels = new Set(['rgb(26, 27, 38)', 'rgb(31, 35, 53)', 'rgb(225, 226, 231)', 'rgb(238, 240, 245)'])
      for (const selector of ['.uit-card', '.uit-pill', '.uit-questions']) {
        for (const surface of await page.locator(selector).evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) {
          expect(surface, `${selector} is the inverse of Weekboard`).toBe('rgb(44, 51, 83)')
          expect(panels.has(surface)).toBe(false)
        }
      }
      // The one accent Weekboard's author sets, mint, never the app's orange.
      for (const accent of await page.locator('.uit-card .uit-primary').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) expect(accent).toBe('rgb(95, 227, 192)')
      for (const surface of await page.locator('.terminal-window, .code-window').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor))) expect(luminance(surface)).toBeLessThan(.05)
      // Every component that owns chrome carries "Example run" at most once.
      for (const count of await page.locator('[data-artefact]').evaluateAll(nodes => nodes.map(node => [...node.querySelectorAll('.example-label')].filter(label => label.closest('[data-artefact]') === node).length))) expect(count).toBeLessThanOrEqual(1)
      // Item 10: no code, shell block or terminal output is monochrome.
      const ink = 'rgb(192, 202, 245)'
      for (const fragment of await textColours(page, '.code-inline')) expect(fragment.colours.some(colour => colour !== ink), `inline ${fragment.text}`).toBe(true)
      for (const fragment of await textColours(page, '.terminal-body pre')) expect(fragment.colours.length, `terminal ${fragment.text}`).toBeGreaterThanOrEqual(2)
      for (const fragment of await textColours(page, '.code-body .shiki')) expect(fragment.colours.length, `code ${fragment.text}`).toBeGreaterThanOrEqual(3)

      if (name === 'landing') {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(promise)
        await expect(page.getByText(intro)).toBeVisible()
        for (const [key, text] of Object.entries(landing)) if (!['fileCaption', 'moment', 'words', 'scenario', 'priority', 'result', 'reached'].includes(key)) await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first(), key).toBeVisible()
        for (const text of [agent.heading, agent.lead, agent.closing, hosted.heading, hosted.lead, hosted.closing]) await expect(page.getByText(text, { exact: true })).toBeVisible()
        await expect(page.locator('h1')).toHaveCSS('font-size', width === 1440 ? '72px' : '44px')
        for (const artefact of artefacts) await expect(page.locator(`[data-artefact="${artefact}"]`).first(), artefact).toBeVisible()
        // Item 1: the faded session is back with its poster; no labelled gestures, no replay or pause controls.
        await expect(page.locator('.hero video')).toHaveAttribute('poster', '/sessions/p3.jpg')
        await expect(page.locator('.hero-backdrop figcaption, .hero-backdrop .gesture-scene, .hero-backdrop button')).toHaveCount(0)
        // Nothing behind the hero is written: the sensors and gestures carry no labels.
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
        // Item 11: the sources are three equal cards, not a table.
        await expect(page.locator('section[aria-labelledby="people"] table')).toHaveCount(0)
        const cards = await page.locator('.option-card').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
        expect(cards).toHaveLength(3)
        if (width === 1440) expect(new Set(cards).size).toBe(1)
        // Item 6: the agent block runs against an API.
        await expect(page.locator('section[aria-labelledby="agents"]')).toContainText('Agent run · add a member through the API · 5 trials')
        await expect(page.locator('section[aria-labelledby="agents"]')).toContainText(agent.fileLine)
        await expect(page.getByRole('link', { name: 'Get started', exact: true }).first()).toHaveAttribute('href', '/docs/getting-started')
      } else {
        await expect(page.locator('.step')).toHaveCount(8)
        await expect(page.locator('[data-artefact="findings-list"], [data-artefact="attempt-view"]')).toHaveCount(0)
        // Item 5: the guide's first step offers both ways in.
        await expect(page.locator('#install')).toContainText('On any other site, paste one line instead')
        await expect(page.locator('.guide-head')).toContainText(landing.requirement)
        for (const text of [guide.install, guide.try, guide.write, guide.next, guide.once, guide.pr, guide.agent]) await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first()).toBeVisible()
        // The agent step matches the landing's API example; the hosted form has the screen fields.
        await expect(page.locator('#agent')).toContainText(agent.fileLine)
        for (const [label, value] of [['Did, recently', hosted.screen.did], ['Within', hosted.screen.within], ['Uses any of', hosted.screen.uses], ['Not', hosted.screen.not]]) await expect(page.locator('.hosted-form').getByLabel(label, { exact: true })).toHaveValue(value)
        await page.getByRole('navigation', { name: 'Getting started' }).getByRole('link', { name: /Run it with real people/ }).click()
        await expect(page.locator('#real-people h2')).toBeInViewport()
      }
      if (process.env.CAPTURE_SITE === '1') {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
        await page.goto(route)
        await page.evaluate(() => document.fonts.ready)
        await mkdir('design/screens', { recursive: true })
        await page.screenshot({ path: `design/screens/${name}-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 80 })
      }
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      const label = name === 'landing' ? 'landing.ui.test.ts' : 'ui-tests/first.ui.test.ts'
      const copy = page.getByRole('button', { name: `Copy ${label}`, exact: true })
      await copy.focus(); await page.keyboard.press('Enter')
      await expect(copy.locator('xpath=ancestor::figure').getByRole('status')).toHaveText('Copied')
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(name === 'landing' ? example : inviteExample)
    })
  }

  test(`reduced motion shows stills, and the results views respond to the visitor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForTimeout(1500)
    // Item 1: under reduced motion the session is its poster with that frame's sensor, and the texture holds still.
    await expect(page.locator('.hero-backdrop')).toHaveAttribute('data-motion', 'still')
    expect(await page.locator('.hero video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
    await expect(page.locator('.hero .sensor.poster')).toHaveCSS('opacity', '1')
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

test('the hero session plays dim and slow with in-context sensors only, and the texture moves', async ({ page }) => {
  await page.goto('/')
  const video = page.locator('.hero video')
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused), { timeout: 10_000 }).toBe(true)
  expect(await video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(.6)
  expect(Number(await page.locator('.hero-session').evaluate(node => getComputedStyle(node).opacity))).toBeLessThanOrEqual(.25)
  // A sensor pulses where the system detects a moment: a small mark in the moment hue, nothing written.
  const backdrop = page.locator('.hero-backdrop')
  const markup = await backdrop.evaluate(node => node.outerHTML)
  await expect.poll(() => page.locator('.hero .sensor').evaluateAll(nodes => nodes.some(node => node.getAnimations().length > 0)), { timeout: 15_000 }).toBe(true)
  await expect(page.locator('.hero .sensor').first()).toHaveText('')
  await expect(page.locator('.hero .sensor').first()).toHaveCSS('border-color', 'rgb(255, 158, 100)')
  // The pulse is an animation, not new markup, so a recorder still sees a dead click on this page as dead.
  expect(await backdrop.evaluate(node => node.outerHTML)).toBe(markup)
  const texture = page.locator('.trace-texture')
  const image = await texture.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  await expect.poll(() => texture.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(image)
  await expect(page.locator('.wordmark svg')).toHaveCSS('color', 'rgb(255, 158, 100)')
})

test('the player surfaces on the page are the real player: card, bar with its confirmations, and one question per screen', async ({ page }) => {
  await page.goto('/')
  const card = page.locator('[data-artefact="player-card"]')
  await expect(card.getByText('Task 1 of 1')).toBeVisible()
  await expect(card.getByText(landing.scenario)).toBeVisible()
  await expect(card.getByText("When you think you've finished, press Done. If you get stuck, press I couldn't do this.")).toBeVisible()
  await card.getByRole('button', { name: 'Start task' }).click()
  const bar = card.getByRole('complementary', { name: 'Example task bar' })
  await expect(bar).toBeVisible()
  // The recording state is the pill's leading segment: dot, time and pause.
  await expect(bar.getByRole('group', { name: 'Recording', exact: true })).toContainText('Screen recorded · Voice off · Webcam off')
  await bar.getByRole('button', { name: 'Pause recording' }).click()
  await expect(bar.getByRole('group', { name: 'Recording', exact: true })).toContainText('Paused')
  await bar.getByRole('button', { name: 'Resume recording' }).click()
  await expect(bar.getByRole('button', { name: 'Done', exact: true })).toHaveCSS('background-color', 'rgb(95, 227, 192)')
  await bar.getByRole('button', { name: "I couldn't do this" }).click()
  await expect(bar.getByRole('group', { name: 'Leave this task before trying it?' })).toBeVisible()
  await bar.getByRole('button', { name: 'Stay and try' }).click()
  await bar.getByRole('button', { name: 'Done', exact: true }).click()
  await bar.getByRole('button', { name: "Yes, I've finished" }).click()
  const questions = card.locator('.uit-questions')
  await expect(questions.getByText('Question 1 of 4')).toBeVisible()
  await questions.getByRole('radio', { name: '2', exact: true }).check()
  await expect(questions.getByText('Question 1 of 5')).toBeVisible()
  await questions.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(questions.getByLabel('What made it difficult?')).toBeVisible()
  await expect(questions.getByRole('button', { name: 'Talk instead' })).toBeVisible()
  await questions.getByRole('button', { name: 'Skip' }).click()
  await page.keyboard.press('4'); await expect(questions.getByRole('radio', { name: '4', exact: true })).toBeChecked()
  await page.keyboard.press('Enter')
  await page.keyboard.press('5'); await page.keyboard.press('Enter')
  await expect(questions.getByText('Question 5 of 5')).toBeVisible()
  await questions.getByRole('button', { name: 'Send answers' }).click()
  await expect(card.getByRole('status')).toContainText('example run, so your answers and any recording were not saved')
  const bars = page.locator('[data-artefact="player-bar"]')
  await expect(bars.getByRole('complementary', { name: 'Example task bar' })).toBeVisible()
  await bars.getByRole('button', { name: 'Show task' }).click()
  await expect(bars.locator('.uit-task')).toContainText(landing.scenario)
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
  const targets = ['.moment-press', '.attempt-index a', '.attempt-fold summary', '.finding-toggle', '.cell.hit', '.watch-moment', '.copy-control', '.button', '.visitor-prompt button', '.check-row a', '.nav-links a', '.uit-card button', '.option-card', '.dashboard tbody tr']
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
