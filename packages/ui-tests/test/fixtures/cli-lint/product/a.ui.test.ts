import { study, task, outcome } from 'ui-tests'

study('s', { users: 'people who plan work', purpose: 'get example.test working' }, () => {
  task('invite Sam', () => {
    outcome(async ({ request }) => { await request.get('/x') })
  })
})
