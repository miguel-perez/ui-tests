/** Approved D2 copy. README parity tests cover every exported string. */
export const promise = 'See where people get stuck on what you just shipped.'
export const intro = 'Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.'
export const landing = {
  access: 'Open source. Nothing to sign up for. Runs on your preview or your live site.',
  caption: "Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.",
  moment: 'P3 · 00:03 · looked for Invite in the Share menu',
  words: '“Share is where you add people. I checked there first.”',
  comesBack: 'What comes back.',
  comesBackLead: 'Here is the whole of one run: the file that asked for it, what one person did, and what to fix.',
  fileCaption: 'If you have written a Playwright test, you have written this.',
  result: 'Problems found: 4 across 5 people.',
  priority: 'Problem 1 is one link. Problem 2 is the one to fix first: both people who hit it believed they were finished, and their colleague got the same email twice.',
  closing: 'A run reports the problems it found, or that it found none this time. There is no score and no pass.',
  person: 'What the person sees.',
  personLead: 'Your page, with a small bar over it. Nothing else.',
  scenario: 'Imagine you want to invite a colleague to your board. Work as you normally would, then tell us when you are finished.',
  scenarioLine: "goal('invite a colleague')",
  barLine: 'outcome(...)',
  barCaption: 'It runs on your side after either button.',
  easeCaption: 'the rating and the words land in their trace.',
  personClosing: 'They never see the path you expected or the check you wrote, so nothing you wrote can lead them.',
  people: 'Where the people come from.',
  peopleLead: 'Friends are kind and coworkers know too much. Three ways to reach people who are neither.',
  pr: 'In the pull request.',
  prLead: 'Put `npx ui-tests run` in the job that deploys your preview. Once the attempts are in, a check lands on the pull request with a report page anyone on the team can open. Your other tests prove the code works. This one shows whether a person can use it.',
  prCaption: "the report page opens on the ranked problems, each with the moments to watch and what to change, and every person's trace below.",
  commands: 'Three commands.',
  requirement: 'Node 22 and a Next.js app.',
  commandsClosing: 'The third command runs the example task on you, so you see the card, the bar and your own trace before anyone else does. Open source, with no seats and no account. Your own link and your own visitors cost nothing. The panel is the only thing you pay for, and you set the cap before it starts.',
  ownTest: 'This page runs this test.',
  ownCaption: 'The outcome checks that you reached the guide. If you get stuck on the way there, this page may ask you to say so. That is the third way to find people, running here.',
}
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
export const inviteExample = `import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: 'people who signed up this week and want a colleague on their board',
  purpose: 'plan the week together without emailing screenshots around',
}, () => {
  goal('invite a colleague', { happyPath: ['/board', '/settings/members'] }, () => {
    outcome(async ({ page }) => {
      expect(await page.textContent('main')).toContain('1 invitation pending')
    })
  })
})`
export const problems = [
  { title: 'Looked for Invite in the Share menu and found only link options', count: '4 of 5', quote: '"Share is where you add people."', watch: 'P1 00:04, P2 00:06, P3 00:03, P5 00:09', change: 'Put "Invite a colleague" at the top of the Share menu.', moment: 'P3 · 00:03 → 00:12' },
  { title: 'Pressed Add, saw nothing change, pressed it again; two invitations went out', count: '2 of 5', quote: '"I wasn\'t sure the first one did anything."', watch: 'P3 00:58, P4 00:41', change: 'On press, change the button to "Invited sam@acme.co" and disable it.', moment: 'P3 · 00:58 → 01:04' },
  { title: "Typed the colleague's email into the board search", count: '2 of 5', quote: '"I figured it would find them."', watch: 'P3 00:23, P1 00:30', change: 'When a search matches no cards, offer "Invite someone with this email".', moment: 'P3 · 00:23 → 00:32' },
  { title: 'Stopped at a grey Add button and gave up', count: '1 of 5', quote: '"It looked switched off."', watch: 'P2 00:49', change: 'Keep the button solid. Validate the address on press, with a message.', moment: 'P2 · 00:45 → 00:54' },
] as const
export const sources = [
  ['Your link', 'Anyone you send it to: a customer, a community, the person at the next desk', 'Free', 'As each person finishes'],
  ['A panel', 'People matched to the `users` line in your file, found for you', 'About $54 for a short task, under a cap you set', 'Within 48 hours'],
  ['Your visitors', 'On the hosted version: people already on your live site, invited the moment they are visibly struggling', 'Free', 'As each person finishes'],
] as const
export const commands = { install: 'npm install -D ui-tests', init: 'npx ui-tests init', run: 'npx ui-tests', people: 'npx ui-tests run', report: 'npx ui-tests report k2m9' }
export const rehearsal = 'Rehearsal: 0 of 5 planned attempts recorded.'
export const guide = {
  title: 'Getting started',
  titles: ['Install', 'Set up', 'Try it on yourself', 'Write your own', 'Run it with real people'],
  install: 'You see "ui-tests" in `devDependencies`.',
  try: 'You see a link in the terminal, then in your browser the scenario card, your own page with the bar over it, and the ease question. Press "I\'m done". The terminal prints:',
  write: 'You type, in `ui-tests/first.ui.test.ts`:',
  next: 'You see, on the next `npx ui-tests`, the card now reads: "Imagine you want to invite a colleague to your board. Work as you normally would, then tell us when you are finished."',
  read: 'Read what came back',
  once: 'You type, once the attempts are in:',
  pr: 'Then, for the pull request, put `npx ui-tests run` in the job that deploys your preview. On the next pull request you see the check:',
}
export const ui = { wordmark: 'ui-tests', guide: 'Guide', github: 'GitHub', getStarted: 'Get started', skip: 'Skip to content', navigation: 'Main navigation', steps: 'Getting started', copy: 'Copy', copied: 'Copied', copyError: 'Could not copy. Select and copy the code.', typescript: 'TypeScript', shell: 'Shell', output: 'Output', example: 'Example run' }
