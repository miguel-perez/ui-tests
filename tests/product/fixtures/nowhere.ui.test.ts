import { expect, outcome, study, task } from 'ui-tests'

study('nowhere fixture', { users: 'People who read the landing page', firstLook: false }, () => {
  task('Find the page about nothing', { path: ['/', '/nowhere'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/nowhere') })
  })
})
