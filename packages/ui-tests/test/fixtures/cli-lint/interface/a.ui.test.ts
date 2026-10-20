import { study, task, outcome } from 'ui-tests'

study('docs', { users: 'people who plan work with a team' }, () => {
  task('click the Docs link and open getting started', () => {
    outcome(async ({ request }) => { await request.get('/x') })
  })
})
