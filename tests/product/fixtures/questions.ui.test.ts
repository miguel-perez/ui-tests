import { expect, outcome, study, task } from 'ui-tests'

study('questions fixture', { users: 'people who plan work with a team', purpose: 'plan the week together', firstLook: false }, () => {
  task('Read the landing page', { path: ['/'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
})
