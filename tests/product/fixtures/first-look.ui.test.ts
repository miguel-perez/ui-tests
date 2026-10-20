import { expect, outcome, study, task } from 'ui-tests'

study('first look fixture', { users: { are: 'people who plan work with a team', did: 'used a shared tool to plan work', within: '3 months' }, purpose: 'plan the week together' }, () => {
  task('Read the landing page', { path: ['/'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
})
