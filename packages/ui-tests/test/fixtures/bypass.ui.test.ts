import { expect, outcome, study, task } from 'ui-tests'

study('bypass fixture', { users: 'People behind a protected preview' }, () => {
  task('Read the members', () => {
    outcome(async ({ request, setup }) => {
      // A call to another origin first: it must never see the bypass secret.
      await request.get(setup.elsewhere as string)
      expect((await request.get('/api/members')).status()).toBe(200)
    })
  })
})
