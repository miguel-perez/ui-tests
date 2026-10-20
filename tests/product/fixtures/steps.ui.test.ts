import { expect, outcome, study, task } from 'ui-tests'

study('steps fixture', { users: 'People who read the landing page', firstLook: false }, () => {
  task('Look at the guide, then come back', () => {
    task('Open the guide', async ({ page }) => { expect(page.url()).toContain('/docs/getting-started') })
    task('Come back to the first page', async ({ page }) => { expect(new URL(page.url()).pathname).toBe('/') })
    outcome(async ({ page }) => { expect(new URL(page.url()).pathname).toBe('/') })
  })
})
