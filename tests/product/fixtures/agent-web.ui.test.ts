import { expect, outcome, study, task } from 'ui-tests'

study('agent web fixture', { users: 'People who read the landing page', firstLook: false, actors: ['human', 'agent'], target: { url: 'http://127.0.0.1:3100' } }, () => {
  task('Open the getting started guide', { path: ['/', '/docs/getting-started'], trials: 1, scenario: 'Open the getting started guide from the landing page.' }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/docs/getting-started') })
  })
})
