import { study, task, outcome, expect } from 'ui-tests'

// The agent study of PRD 04: a capability test, not usability. It admits the agent only, so `npx ui-tests` (people) never picks it up.
// The cli harness gives each trial an empty npm project, offline, where it may run `npm i -D ui-tests` and `npx ui-tests …` and
// nothing else: no app is served there, so the result an agent can reach is the first one a developer gets, the example study
// set up by `init` and checked by `lint`, written to a file the outcome reads.
study('first run', {
  users: 'developers trying ui-tests for the first time',
  purpose: 'find out whether people can use what I built',
  actors: ['agent'],
  target: { cli: 'npx ui-tests' },
}, () => {
  task('install ui-tests and get a result on the example', {
    scenario: 'This is a new, empty project. Install ui-tests in it, set it up with its example study, and check that study with ui-tests, saving the result of the check as ui-tests-lint.json in the project.',
    path: ['npm i -D ui-tests', 'npx ui-tests init', 'npx ui-tests lint --out ui-tests-lint.json'],
    trials: 5,
  }, () => {
    outcome(async ({ workspace }) => {
      expect(workspace.file('ui-tests.config.ts')).toExist()
      const result = workspace.file('ui-tests-lint.json')
      expect(result).toExist()
      // The check read the example study `init` wrote: its plan starts with the study's name.
      const studies = (JSON.parse(result ?? '{}') as { studies?: { plan?: string[] }[] }).studies ?? []
      expect(studies.map(s => s.plan?.[0])).toEqual(['Study: invite flow'])
    })
  })
})
