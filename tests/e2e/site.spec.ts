import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'
import { example, inviteExample, promise, intro, landing, guide } from '../../apps/web/lib/copy'

const artefacts = ['terminal-quiet-window', 'code-window', 'trace-viewer', 'report-rows', 'scenario-card', 'taskbar', 'ease-question', 'invite-link', 'cap-control', 'visitor-invitation', 'pull-request-check']
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
        for (const text of Object.values(landing)) await expect(page.getByText(text.replaceAll('`', ''), { exact: true }).first()).toBeVisible()
        await expect(page.locator('h1')).toHaveCSS('font-size', width === 1440 ? '72px' : '44px')
        for (const artefact of artefacts) await expect(page.locator(`[data-artefact="${artefact}"]`).first()).toBeVisible()
        const hero = page.locator('.hero-video')
        await expect(hero).toHaveAttribute('poster', '/sessions/p3.jpg')
        await expect(hero).toHaveAttribute('preload', 'none')
        await expect.poll(() => hero.evaluate((video: HTMLVideoElement) => !video.paused && video.playbackRate === 0.6)).toBe(true)
        await expect(page.getByRole('link', { name: 'Get started', exact: true }).first()).toHaveAttribute('href', '/docs/getting-started')
      } else {
        await expect(page.locator('.docs-content > section')).toHaveCount(5)
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
    const hero = page.locator('.hero-video')
    expect(await hero.evaluate((video: HTMLVideoElement) => video.paused && !video.getAttribute('src'))).toBe(true)
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
      await reel.evaluate((video: HTMLVideoElement) => video.play())
      await expect.poll(() => reel.evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0)
      await reel.evaluate((video: HTMLVideoElement) => video.pause())
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
