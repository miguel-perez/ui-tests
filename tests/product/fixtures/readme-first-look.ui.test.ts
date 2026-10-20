import { expect, outcome, study, task } from 'ui-tests'

study('readme first look fixture', { users: { are: 'people who plan work with a team', did: 'used a shared tool to plan work', within: '3 months' }, purpose: 'plan the week together', firstLook: { page: 'https://github.com/acme/app#readme' } }, () => {
  task('Read the landing page', { path: ['/'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
})
