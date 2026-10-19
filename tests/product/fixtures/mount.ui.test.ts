import { expect, outcome, study, task } from 'ui-tests'

study('mount fixture', { users: 'People who read the landing page', firstLook: false }, () => {
  task('Read the landing page', { path: ['/'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
})
