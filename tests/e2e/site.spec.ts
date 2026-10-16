import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { example, inviteExample, promise, intro, landing, guide, agent, hosted } from '../../apps/web/lib/copy'

const artefacts = ['terminal-quiet-window', 'code-window', 'trace-viewer', 'report-rows', 'scenario-card', 'taskbar', 'ease-question', 'invite-link', 'cap-control', 'visitor-invitation', 'pull-request-check', 'hosted-form']
for (const width of [1440, 375]) {
  for (const [name, route] of [['landing', '/'], ['guide', '/docs/getting-started']]) {
    test(`site ${name} at ${width}px: layout, accessibility, fonts and copy`, async ({ page, context }) => {
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
      if (name === 'landing') {
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(promise)
        await expect(page.getByText(intro)).toBeVisible()
        for (const [key, text] of Object.entries(landing)) if (key !== 'fileCaption') await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first()).toBeVisible()
        for (const text of [agent.heading, agent.lead, agent.closing, hosted.heading, hosted.lead, hosted.closing]) await expect(page.getByText(text, { exact: true })).toBeVisible()
        await expect(page.locator('h1')).toHaveCSS('font-size', width === 1440 ? '72px' : '44px')
        for (const artefact of artefacts) await expect(page.locator(`[data-artefact="${artefact}"]`).first()).toBeVisible()
        await expect(page.locator('.hero video')).toHaveCount(0)
        await expect(page.locator('.hero-illustration')).toHaveAttribute('data-motion', 'running')
        await expect(page.getByRole('button', { name: 'Replay frustration gestures' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Get started', exact: true }).first()).toHaveAttribute('href', '/docs/getting-started')
      } else {
        await expect(page.locator('.docs-content > section')).toHaveCount(7)
        await expect(page.locator('[data-artefact="report-rows"]')).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Open the example report and trace.' })).toHaveAttribute('href', '/#comes-back')
        for (const text of [guide.install, guide.try, guide.write, guide.next, guide.once, guide.pr]) await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first()).toBeVisible()
        await page.getByRole('navigation', { name: 'Getting started' }).getByRole('link', { name: /Run it with real people/ }).click()
        await expect(page.locator('#real-people h2')).toBeInViewport()
      }
      if (process.env.CAPTURE_SITE === '1') {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(route)
        await page.evaluate(() => document.fonts.ready)
        await mkdir('design/screens', { recursive: true })
        await page.screenshot({ path: `design/screens/${name}-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 80 })
        if (name === 'landing' && width === 1440) for (const artefact of artefacts) await page.locator(`[data-artefact="${artefact}"]`).first().screenshot({ path: `design/screens/d2-${artefact}-1440.png` })
      }
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      const label = name === 'landing' ? 'landing.ui.test.ts' : 'ui-tests/first.ui.test.ts'
      const copy = page.getByRole('button', { name: `Copy ${label}`, exact: true })
      await copy.focus(); await page.keyboard.press('Enter')
      await expect(copy.locator('xpath=ancestor::figure').getByRole('status')).toHaveText('Copied')
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(name === 'landing' ? example : inviteExample)
    })
  }
  test(`reduced motion and interactive recordings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.waitForTimeout(1500)
    await expect(page.locator('.hero-illustration')).toHaveAttribute('data-motion', 'still')
    await expect(page.locator('.trace-texture')).toHaveAttribute('data-motion', 'still')
    await expect(page.getByRole('button', { name: 'Texture still' })).toBeDisabled()
    // Every CSS animation and transition on the page, not only the hero, is stopped.
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0)
    const still = await page.locator('.trace-texture').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
    await page.waitForTimeout(250)
    expect(await page.locator('.trace-texture').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(still)
    expect(await page.locator('.gesture-scenes').evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0)
    await page.getByRole('button', { name: 'Replay frustration gestures' }).click()
    expect(await page.locator('.gesture-scenes').evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0)
    await expect(page.locator('.types-once pre')).toHaveCSS('animation-name', 'none')
    const trace = page.locator('.trace-viewer').first()
    await trace.getByRole('button', { name: /00:23/ }).click()
    await expect.poll(() => trace.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeCloseTo(23, 0)
    await expect(trace.locator('[aria-current="step"]')).toContainText('00:23')
    await trace.getByRole('slider', { name: 'Seek session' }).fill('41')
    await expect(trace.locator('[aria-current="step"]')).toContainText('00:41')
    const report = page.locator('.report-rows').first()
    for (let i = 0; i < 4; i++) {
      if (i > 0) await report.locator('.report-toggle').nth(i).click()
      const reel = report.locator('video')
      expect(await reel.evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
      await report.getByRole('button', { name: 'Play problem moment', exact: true }).click()
      await expect.poll(() => reel.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0)
      await report.getByRole('button', { name: 'Pause problem moment', exact: true }).click()
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await report.locator('.report-toggle').nth(1).click()
    await expect.poll(() => report.locator('video').evaluate((video: HTMLVideoElement) => !video.paused)).toBe(true)
    for (const [row, person, at, label] of [[0, 'p1', 4, 'P1 00:04'], [0, 'p2', 6, 'P2 00:06'], [1, 'p4', 41, 'P4 00:41'], [0, 'p5', 9, 'P5 00:09']] as const) {
      const toggle = report.locator('.report-toggle').nth(row)
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
      await report.getByRole('button', { name: label, exact: true }).click()
      await expect(report.locator('video')).toHaveAttribute('src', `/sessions/${person}.webm`)
      await expect.poll(() => report.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThanOrEqual(at)
    }
  })
}

for (const width of [1440, 375]) test(`hover, focus and active never move timeline or controls at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await page.goto('/')
  // The timeline rows first: every row keeps its exact box when the pointer rests on it.
  const rows = page.locator('.trace-timeline li')
  await rows.first().scrollIntoViewIfNeeded()
  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i)
    // Bring the row into view first so the only difference between the two boxes is the hover state.
    await row.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const before = await row.boundingBox()
    await row.hover()
    expect(await row.boundingBox(), `timeline row ${i + 1} hover`).toEqual(before)
  }
  const targets = ['.trace-timeline button', '.report-toggle', '.watch-moment', '.copy-control', '.button', '.visitor-prompt button', '.motion-controls button', '.check-row a', '.hosted-form input[role=switch]', '.hosted-form .button', '.nav-links a']
  for (const selector of targets) {
    const target = page.locator(selector).first()
    await target.scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const before = await target.boundingBox()
    await target.hover()
    expect(await target.boundingBox(), `${selector} hover`).toEqual(before)
    await target.focus()
    expect(await target.boundingBox(), `${selector} focus`).toEqual(before)
    await page.mouse.down()
    expect(await target.boundingBox(), `${selector} active`).toEqual(before)
    await page.mouse.move(0, 0); await page.mouse.up()
  }
})

test('once-only gestures, pausable texture, agent separation, hosted form and complete ratings', async ({ page }) => {
  await page.goto('/')
  const gestures = page.locator('.gesture-scenes')
  expect(await gestures.evaluate(node => node.getAnimations({ subtree: true }).length)).toBeGreaterThan(0)
  // Played once: every gesture finishes within a few seconds each and none repeats.
  await expect.poll(() => gestures.evaluate(node => node.getAnimations({ subtree: true }).every(animation => animation.playState === 'finished')), { timeout: 15000 }).toBe(true)
  expect(await gestures.evaluate(node => node.getAnimations({ subtree: true }).every(animation => animation.effect?.getComputedTiming().iterations === 1))).toBe(true)
  await page.getByRole('button', { name: 'Replay frustration gestures' }).click()
  expect(await page.locator('.gesture-scenes').evaluate(node => node.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'))).toBe(true)
  const texture = page.locator('.trace-texture')
  await page.getByRole('button', { name: 'Pause texture' }).click()
  await expect(texture).toHaveAttribute('data-motion', 'paused')
  const image = await texture.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())
  await page.waitForTimeout(200)
  expect(await texture.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(image)
  await page.getByRole('button', { name: 'Resume texture' }).click()
  await expect.poll(() => texture.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(image)
  // The moment line lives in the rank-1 reel's chrome, never loose in the page flow.
  await expect(page.locator('.reel-frame .reel-chrome').first()).toContainText(landing.moment)
  await expect(page.getByText(landing.moment, { exact: true })).toHaveCount(1)
  await expect(page.locator('.wordmark svg')).toHaveCSS('color', 'rgb(255, 158, 100)')
  const invitation = page.locator('.visitor-prompt')
  // Recognition, apology, then the paid incentive, in that order.
  await expect(invitation.locator('h3')).toHaveText('Looks like this is not going smoothly.')
  await expect(invitation.locator('p')).toHaveText('Sorry about that. Would you show us where it got stuck? Two minutes, and we pay for your time.')
  await expect(invitation.getByRole('button')).toHaveCount(2)
  await expect(page.locator('section[aria-labelledby="agents"]')).toContainText('3 of 5 trials reached the outcome.')
  const trace = page.locator('.trace-viewer')
  const ratings = trace.locator('.session-ratings')
  await expect(ratings.locator('div').filter({ hasText: 'SEQ ease' })).toContainText('3 of 7')
  await expect(ratings.locator('div').filter({ hasText: 'confidence' })).toContainText('6 of 7')
  await expect(ratings.locator('div').filter({ hasText: 'UX-Lite' })).toContainText('usefulness 75/100 · ease 25/100')
  await expect(ratings).toContainText('incorrect · confident failure')
  await expect(trace.locator('.window-chrome')).toContainText('P3 · invite a colleague · panel · MacBook, Chromium · 1280×800 · 1:03')
  await expect(trace).toContainText('Screen: recorded · consent given')
  await expect(trace).toContainText('Voice: not recorded · no consent')
  await expect(trace).toContainText('Webcam: not recorded · no consent')
  const questions = page.locator('[data-artefact="ease-question"]')
  await questions.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(questions.getByText('At the end · UX-Lite')).toBeVisible()
  await questions.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(questions.getByRole('status')).toContainText('Thank you')
  const form = page.locator('.hosted-form')
  await expect(form.getByLabel('Users', { exact: true })).toHaveValue(hosted.users)
  await expect(form.getByLabel('Your link', { exact: true })).toBeChecked()
  await expect(form.getByLabel('A panel', { exact: true })).not.toBeChecked()
  await expect(form.getByLabel('Your visitors', { exact: true })).toBeChecked()
  await form.getByRole('button', { name: 'Start the run' }).click()
  await expect(form.getByRole('status')).toContainText('Example run ready')
})

test('failed playback restores the trace and reel play controls without a pause event', async ({ page }) => {
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
  const trace = page.locator('.trace-viewer').first()
  const report = page.locator('.report-rows').first()
  for (const [container, label] of [[trace, 'P3 session'], [report, 'problem moment']] as const) {
    await container.getByRole('button', { name: `Play ${label}`, exact: true }).click()
    await expect(container.getByRole('button', { name: `Pause ${label}`, exact: true })).toBeVisible()
    await container.locator('video').evaluate((video: HTMLVideoElement & { rejectPlay: () => void }) => video.rejectPlay())
    await expect(container.getByRole('button', { name: `Play ${label}`, exact: true })).toBeVisible()
  }
  // Exercise the effect-driven playback handler as well as both button handlers.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await report.locator('.report-toggle').nth(1).click()
  await expect(report.getByRole('button', { name: 'Pause problem moment', exact: true })).toBeVisible()
  await report.locator('video').evaluate((video: HTMLVideoElement & { rejectPlay: () => void }) => video.rejectPlay())
  await expect(report.getByRole('button', { name: 'Play problem moment', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
