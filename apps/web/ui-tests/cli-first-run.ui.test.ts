import { study, task, outcome, expect } from 'ui-tests'

// The agent study of PRD 04: a capability test, not usability. It admits the agent only, so `npx ui-tests` (people) never picks it up.
study('first run', {
  users: 'developers trying ui-tests for the first time',
  purpose: 'find out whether people can use what I built',
  actors: ['agent'],
  target: { cli: 'npx ui-tests' },
}, () => {
  task('install ui-tests and get a result on the example', {
    path: ['npm i -D ui-tests', 'npx ui-tests'],
    trials: 5,
  }, () => {
    outcome(async ({ workspace }) => {
      expect(workspace.file('.ui-tests/runs/*/report.json')).toExist()
    })
  })
})
