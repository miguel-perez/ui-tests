/** All public site words and examples live here and are mirrored in README.md. */
export const headline = ['See what', 'stopped them.'] as const
export const promise = headline.join(' ')
export const intro = 'For developers who test code, ship UI and have no researcher. Find where people get stuck, with issue signals, a sentence that says what the evidence means, and a trace to inspect.'
export const landing = {
  eyebrow: 'Usability testing, in your repo',
  premise: 'Your tests say the code works. Watching someone use it tells you whether the experience makes sense. Start with a local rehearsal of the task you want to observe.',
  access: 'Open source. Nothing to sign up for. Local rehearsals are free. The plan: free with your own participants, pay only for a panel, no seats.',
  ladderTitle: 'From working to making sense.',
  ladderIntro: 'Friends can like the idea and still get stuck using it. Look at what happens when someone tries.',
  exampleLabel: 'Example issue signals',
  issues: ['Dead click · 00:12 · “Install” did not respond.', 'Deviation · 00:28 · A visit to /pricing interrupted the path.'],
  interpretation: 'Five people can uncover problems. They cannot establish a rate. A problem-catching run reports problems found, or none found at this n.',
  outcome: 'Outcome correct · Final URL: /docs/getting-started.',
  planned: 'Derived now; questions are not asked at run time yet.',
  contextTitle: 'Write the goal. Leave room to get lost.',
  contextIntro: 'This is the test for this page. The happy path stays with the outcome check; the person doing the task only sees the scenario.',
  pipelineTitle: 'Part of the build loop.',
  pipelineIntro: 'Name the people and what they came to do. Rehearse the task. Inspect what got in the way.',
}
export const ladder = [
  ['Functional and reliable', 'Your code tests tell you whether it works and keeps working. Keep those tests. This is the next question.'],
  ['Usable', 'Effectiveness, efficiency and satisfaction in a specified context of use (ISO 9241-11). Watch where the task breaks down, not just where it ends.'],
  ['Desirable', 'Does this help the people you built it for do something they need to do?'],
  ['Pleasurable', 'How does it feel to use? A finished task can still leave someone frustrated.'],
] as const
export const sections = [
  ['What you write', 'Who the people are, what they need to do, and what you can observe when they finish. A goal, not a set of directions.'],
  ['What is derived', 'A scenario from the goal, timing and a sample plan. Impression and fit questions are derived too, ready for a later stage.'],
  ['What you get back', 'Issue signals to investigate, a sentence that puts the sample in context, and a trace. The snapshot outcome says where the attempt ended.'],
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
export const progress = 'Work in progress. Today: local self-rehearsals, snapshot outcomes, issue signals and a trace. Recruitment, multi-person runs, impression and fit questions at run time, aggregated findings and the pull-request check do not work yet.'
export const standard = 'The record is evidence for the people clauses of ISO 9241-210.'
export const rehearsal = 'Rehearsal: 0 of 5 planned attempts recorded.'
export const terminal = `Player: http://localhost:3000/ui-tests/00000000-0000-4000-8000-000000000000?token=0000000000000000000000000000000000000000000000000000000000000000
Trace: http://127.0.0.1:43210/00000000-0000-4000-8000-000000000000/0000000000000000000000000000000000000000000000000000000000000000
Run: 00000000-0000-4000-8000-000000000000
Outcome: correct
Rehearsal: 0 of 5 planned attempts recorded.`
export const ui = {
  wordmark: 'ui-tests', guide: 'Guide', github: 'GitHub', getStarted: 'Get started', viewGithub: 'View on GitHub',
  skip: 'Skip to content', navigation: 'Main navigation', steps: 'Getting started', onPage: 'On this page',
  copy: 'Copy', copied: 'Copied', copyError: 'Could not copy. Select and copy the code.',
  terminalLabel: 'Local rehearsal · example identifiers', tip: 'Before you start',
  progress: 'Work in progress',
  typescript: 'TypeScript', shell: 'Shell', output: 'Output',
}
export const guide = {
  title: 'Your first local rehearsal',
  intro: 'Try the task yourself before asking anyone else. A rehearsal checks the setup and shows you the evidence you will be able to inspect.',
  requirement: 'Use Node 22 or newer and a Next.js App Router application. Run this locally in development mode.',
  titles: ['Install', 'Init and mount', 'Write the test', 'Run dev mode', 'Read the result'],
  install: 'Add ui-tests as a development dependency in your application. It keeps the task definition beside the code you are building.',
  init: 'Init writes the config, example test and Vitest exclusion, preserving existing author files. Mount the integration in your root layout so the taskbar stays with the person as they navigate.',
  player: 'Mount the player at app/ui-tests/[run]/page.tsx. It asks for consent and presents the scenario before the task begins.',
  collector: 'Mount the development collector at app/api/ui-tests/route.ts. It records the local attempt so you can inspect what happened.',
  write: 'Save this as landing.ui.test.ts. Name the people and their goal in words they would use.',
  scenario: 'The scenario comes from the goal, not the happy path, so it does not give away the route. The lint rejects interface words in a goal because telling someone which button to click hides whether they could find it.',
  config: 'Set the local target in ui-tests.config.ts so the player knows which application to open.',
  run: 'Start your app, then run the rehearsal in another terminal from the application directory. The CLI opens the player and a separate local trace viewer.',
  participate: 'Give consent, read the scenario and begin the task. Use “I’m done” or “I can’t do this”, then answer the ease and confidence questions even if you stopped.',
  clone: 'To rehearse this repository from a clean clone:',
  result: 'Look at the issue moments first. The trace shows what happened, when it happened, and the expected and actual evidence. A signal is a place to investigate, not a verdict about a person.',
  isolation: 'The outcome runs in the CLI against the saved URL and DOM, not in your app. This keeps the expected answer and the checking code out of the participant’s experience.',
  sentence: 'The sentence says “0 of 5 planned attempts” because a self-rehearsal does not count as evidence from other people. Five is a plan for finding problems, not a measured rate.',
  finish: 'A minutes-only goal produces issues without a result sentence. Stop the viewer with Ctrl+C. Local records stay in .ui-tests/.',
}
export const snippets = {
  layout: `import { UiTests } from 'ui-tests/next'

export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}<UiTests /></body></html>
}`,
  player: `import { Player } from 'ui-tests/next'
export default async function Page({ params, searchParams }: {
  params: Promise<{ run: string }>
  searchParams: Promise<{ token?: string }>
}) {
  return <Player runId={(await params).run} token={(await searchParams).token} />
}`,
  collector: `import { createCollector } from 'ui-tests/server'
export const runtime = 'nodejs'
export const GET = createCollector()
export const POST = GET`,
  config: `import { defineConfig } from 'ui-tests'
export default defineConfig({ target: { url: process.env.PREVIEW_URL ?? 'http://localhost:3000' } })`,
  run: `${commands.dev}\n# In another terminal\n${commands.run}`,
  clone: `npm ci
npm run dev
# In another terminal
cd apps/web
npx ui-tests`,
  inspect: `npx ui-tests lint
# Replace RUN_ID with the run ID printed by the CLI.
npx ui-tests verify RUN_ID`,
}
