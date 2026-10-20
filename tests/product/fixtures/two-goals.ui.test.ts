import { expect, outcome, study, task } from 'ui-tests'

study('two goals fixture', { users: 'people who plan work with a team', purpose: 'plan the week together', firstLook: false }, () => {
  task('Read the landing page', { path: ['/'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
  task('Open the getting started guide', { path: ['/docs/getting-started'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/docs/getting-started') })
  })
})
