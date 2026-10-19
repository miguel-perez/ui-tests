import { study, task } from 'ui-tests'

study('other study', { users: 'People who use a fixture' }, () => {
  task('Other thing', { path: ['/'] }, () => {})
})
