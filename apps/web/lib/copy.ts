export const promise = 'Usability testing that runs like your unit tests. Define the goal and the happy path. It recruits the people, runs it, and reports the problems they hit.'
export const ladder = [
  ['Functional and reliable', 'Yours: make it work and keep it working.'],
  ['Usable', 'Measured here: effectiveness, efficiency and satisfaction in a specified context of use (ISO 9241-11).'],
  ['Desirable', 'Measured here: does this fit what people need?'],
  ['Pleasurable', 'Measured here: how does the experience feel?'],
] as const
export const sections = [
  ['What you write', 'The people, their purpose, a goal and an observable outcome.'],
  ['What is derived', 'The scenario, timing, sample plan, impression stage and fit questions.'],
  ['What you get back', 'An outcome, the first issue signals, a sentence and a trace.'],
] as const
export const example = `import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'developers who ship UI and have no researcher',
  purpose: 'find out whether people can use what I built, without a researcher',
}, () => {
  goal('start trying ui-tests', { happyPath: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => {
      expect(page.url()).toContain('/docs/getting-started')
    })
  })
})`
export const commands = { install: 'npm install -D ui-tests', init: 'npx ui-tests init', dev: 'npm run dev', run: 'npx ui-tests' }
export const progress = 'Work in progress. Today: local self-rehearsals, snapshot outcomes, issue signals and a trace. Recruitment, multi-person studies, impression and fit questions at run time, and aggregated findings do not work yet.'
