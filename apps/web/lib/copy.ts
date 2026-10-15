/** The one-line promise. The README and the landing page use these words verbatim. */
export const promise = 'Usability testing that runs like your unit tests. Define the goal and the happy path. It recruits the people, runs it, and reports the problems they hit.'
/** The quality ladder: functional and reliable are yours; usable, desirable and pleasurable are measured here. */
export const ladder = [
  ['Functional and reliable', 'Yours: make it work and keep it working.'],
  ['Usable', 'Measured here: effectiveness, efficiency and satisfaction in a specified context of use (ISO 9241-11).'],
  ['Desirable', 'Measured here: does this fit what people need?'],
  ['Pleasurable', 'Measured here: how does the experience feel?'],
] as const
/** What you write, what is derived, what you get back. */
export const sections = [
  ['What you write', 'The people, their purpose, a goal and an observable outcome.'],
  ['What is derived', 'The scenario, timing, sample plan, impression stage and fit questions.'],
  ['What you get back', 'An outcome, the first issue signals, a sentence and a trace.'],
] as const
/** The landing context as shown on the site and in the README. */
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
/** The install, init and dev-mode commands shown in the guide. */
export const commands = { install: 'npm install -D ui-tests', init: 'npx ui-tests init', dev: 'npm run dev', run: 'npx ui-tests' }
/** The work-in-progress note: what works today and what does not. */
export const progress = 'Work in progress. Today: local self-rehearsals, snapshot outcomes, issue signals and a trace. Recruitment, multi-person studies, impression and fit questions at run time, and aggregated findings do not work yet.'
