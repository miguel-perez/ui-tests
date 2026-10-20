import { expect, outcome, study, task } from 'ui-tests'

study('plain page fixture', { users: 'People who browse a plain static site', firstLook: false }, () => {
  task('Reach the next page', { path: ['/', '/next.html'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/next.html') })
  })
})
