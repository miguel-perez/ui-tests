import { expect, outcome, study, task } from 'ui-tests'

// A limit short enough to reach the offer of more time: it comes at 80% of the limit.
study('more time fixture', { users: 'people who read the landing page', firstLook: false }, () => {
  task('Read the landing page', { path: ['/'], timeLimit: '30 s' }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
})
