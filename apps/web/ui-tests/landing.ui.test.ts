import { study, task, outcome, expect } from 'ui-tests'

study('getting started', {
  users: {
    did: 'shipped a user interface you built yourself',
    role: ['Developer', 'Designer', 'Founder'],
  },
  purpose: 'find out whether people can use what I built, without a researcher',
}, () => {
  task('start trying ui-tests', { path: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => {
      expect(page.url()).toContain('/docs/getting-started')
    })
  })
})
