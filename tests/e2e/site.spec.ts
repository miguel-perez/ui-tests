import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { example, intro, terminal } from '../../apps/web/lib/copy'

for (const width of [1440, 375]) {
  for (const [name, route] of [['landing', '/'], ['guide', '/docs/getting-started']]) {
    test(`site ${name} at ${width}px: layout, accessibility, fonts and copy`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.goto(route)
      await page.evaluate(() => document.fonts.ready)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      expect(await page.locator('body').innerText()).not.toMatch(/\b(?:pass|compliant|certified)\b|%|!/i)

      // Check actual visible text, including nav, buttons, code and the footer.
      const fonts = await page.locator('body *').evaluateAll(nodes => [...new Set(nodes
        .filter(node => node.getBoundingClientRect().width && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()))
        .map(node => getComputedStyle(node).fontFamily))])
      expect(fonts.length).toBeGreaterThan(0)
      for (const font of fonts) expect(font).toMatch(/^['"]?(?:__)?Fira[_ ](?:Sans|Code)/)
      await expect(page.locator('pre').first()).toHaveCSS('font-family', /Fira[_ ]Code/)
      const darkBackground = await page.locator('body').evaluate(node => getComputedStyle(node).backgroundColor)
      await page.emulateMedia({ colorScheme: 'light' })
      await expect(page.locator('body')).toHaveCSS('background-color', darkBackground)

      if (name === 'landing') {
        await expect(page.getByText(intro)).toBeInViewport()
        await expect(page.locator('.terminal code')).toHaveText(terminal)
        await expect(page.locator('.rung-1')).toContainText(/Dead click[\s\S]*Deviation[\s\S]*Rehearsal: 0 of 5[\s\S]*Outcome correct/)
        await expect(page.getByRole('link', { name: 'Get started', exact: true })).toHaveAttribute('href', '/docs/getting-started')
        if (width === 1440) {
          const headline = page.getByRole('heading', { level: 1 })
          expect(await headline.evaluate(node => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)))).toBe(2)
        }
      } else {
        await expect(page.locator('.docs-content pre')).toHaveCount(11)
        await expect(page.locator('.docs-content .code-block button')).toHaveCount(11)
        await page.getByRole('navigation', { name: 'Getting started', exact: true }).getByRole('link', { name: 'Read the result' }).click()
        await expect(page).toHaveURL(/#read-the-result$/)
        await expect(page.locator('#read-the-result h2')).toBeInViewport()
        await page.goto(route)
        await page.evaluate(() => document.fonts.ready)
      }

      // Capture the untouched UI, then exercise copying via the keyboard.
      if (process.env.CAPTURE_SITE === '1') {
        await mkdir('design/screens', { recursive: true })
        await page.screenshot({ path: `design/screens/${name}-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 75 })
      }
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      const copy = page.getByRole('button', { name: 'Copy landing.ui.test.ts', exact: true })
      await copy.focus()
      await page.keyboard.press('Enter')
      await expect(copy.locator('xpath=ancestor::div[contains(@class,"code-block")]').getByRole('status')).toHaveText('Copied')
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(example)
    })
  }

  test(`rehearsal taskbar inherits site tokens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    let child: ChildProcess | undefined
    let output = ''
    try {
      child = spawn(process.execPath, [path.resolve('packages/ui-tests/bin/ui-tests.mjs'), '--no-open', '--file', path.resolve('apps/web/landing.ui.test.ts')], {
        cwd: path.resolve('apps/web'), env: { ...process.env, NO_COLOR: '1' },
      })
      child.stdout?.on('data', data => { output += data.toString() })
      child.stderr?.on('data', data => { output += data.toString() })
      child.on('error', error => { output += error.message })
      await expect.poll(() => output, { timeout: 10_000 }).toContain('Player: ')
      await page.goto(/Player: (\S+)/.exec(output)![1])
      await page.getByRole('button', { name: 'I consent' }).click()
      await page.getByRole('button', { name: 'Begin task' }).click()
      const taskbar = page.getByRole('complementary', { name: 'Your task' })
      await expect(taskbar).toBeVisible()
      const tokens = await page.evaluate(() => {
        const probe = document.createElement('span')
        document.body.append(probe)
        probe.style.backgroundColor = 'var(--background)'
        const background = getComputedStyle(probe).backgroundColor
        probe.style.backgroundColor = 'var(--primary)'
        const primary = getComputedStyle(probe).backgroundColor
        probe.remove()
        return { background, primary }
      })
      await expect(taskbar).toHaveCSS('background-color', tokens.background)
      await expect(taskbar.getByRole('button', { name: "I'm done", exact: true })).toHaveCSS('background-color', tokens.primary)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
      await page.getByRole('link', { name: 'Get started', exact: true }).click()
      await expect(page).toHaveURL(/\/docs\/getting-started$/)
      await expect(taskbar).toBeVisible()
      await expect(taskbar).toHaveCSS('background-color', tokens.background)
    } finally {
      if (child && child.exitCode === null) {
        const exited = new Promise<void>(resolve => child!.once('exit', () => resolve()))
        child.kill('SIGTERM')
        await exited
      }
    }
  })
}
