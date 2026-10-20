import { study, task } from 'ui-tests'

study('minutes fixture', { users: { are: 'People who read the landing page', did: 'read a landing page', within: '3 months' }, firstLook: false }, () => {
  task('Look around the site', { minutes: 2 })
})
