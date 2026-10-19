import { study } from 'ui-tests'

study('throwing study', { users: 'Anyone' }, () => {})
throw new Error('boom at the top level')
