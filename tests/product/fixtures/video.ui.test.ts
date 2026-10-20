import { expect, outcome, study, task } from 'ui-tests'

study('video fixture', { users: 'People who read the landing page', firstLook: false, record: 'video' }, () => {
  task('Read the landing page', { path: ['/'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/') })
  })
})
