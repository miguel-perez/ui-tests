import { study, task } from 'ui-tests'

study('minutes fixture', { users: 'People who read the landing page', firstLook: false }, () => {
  task('Look around the site', { minutes: 2 })
})
