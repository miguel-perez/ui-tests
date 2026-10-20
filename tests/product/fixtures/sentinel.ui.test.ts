import { expect, outcome, study, task } from 'ui-tests'

/** The path and the expected answer stay with the author: neither may reach the participant's page, the view or the bundle. */
study('sentinel fixture', { users: 'People who read the landing page', firstLook: false }, () => {
  task('Read the landing page', { path: ['/', '/sentinel-path-7f3a'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toBe('sentinel-answer-91c2') })
  })
})
