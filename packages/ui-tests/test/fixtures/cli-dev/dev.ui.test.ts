import { expect, outcome, setup, study, task } from 'ui-tests'

study('dev fixture', { users: 'People who read docs', purpose: 'find the getting started page' }, () => {
  setup(async ({ request }) => {
    await request.get('/')
    return { start: '/' }
  })
  task('Reach docs', { path: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => { expect(page.url()).toContain('/docs/getting-started') })
  })
})

study('agents only', { users: 'Agents', actors: ['agent'] }, () => {
  task('Call the API', () => {
    outcome(async () => {})
  })
})
