import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** Issue #43: the site is light only. The landing renders the light canvas and ink whatever the system setting. */
const routes = [['landing', '/']]

/** The light ground, a light document colour scheme and the light meta, measured on the page as it renders. */
async function expectLight(page: Page, label: string) {
  await expect(page.locator('body'), label).toHaveCSS('background-color', 'rgb(246, 246, 246)')
  await expect(page.locator('body'), label).toHaveCSS('color', 'rgb(17, 17, 17)')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), label).toBe('light')
  await expect(page.locator('meta[name="color-scheme"]'), label).toHaveAttribute('content', 'light')
}

for (const width of [1440, 375]) {
  for (const [name, route] of routes) {
    test(`site ${name} at ${width}px: light under a light and a dark system setting, whatever data-theme says, axe clean in both`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      for (const colorScheme of ['dark', 'light'] as const) {
        await page.emulateMedia({ colorScheme })
        await page.goto(route)
        await page.evaluate(() => document.fonts.ready)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expectLight(page, `${colorScheme} system setting`)
        expect((await new AxeBuilder({ page }).analyze()).violations, `${colorScheme} system setting`).toEqual([])
        // No data-theme attribute changes it.
        for (const theme of ['dark', 'light']) {
          await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
          await expectLight(page, `${colorScheme} system setting, data-theme="${theme}"`)
        }
        await page.evaluate(() => { delete document.documentElement.dataset.theme })
      }
    })
  }
}
