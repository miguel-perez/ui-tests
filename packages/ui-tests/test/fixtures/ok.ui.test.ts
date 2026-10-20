import { study, task } from 'ui-tests'

study('fixture study', { users: 'People who use a fixture' }, () => {
  task('Do the thing', { path: ['/'] }, () => {})
})
