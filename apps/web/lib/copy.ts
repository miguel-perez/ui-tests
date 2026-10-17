import { exampleFile, exampleFileName } from 'ui-tests/example'

/** Approved D2 copy. README parity tests cover every exported string. */
export const promise = 'See where people get stuck on what you just shipped.'
export const intro = 'Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.'
export const landing = {
  access: 'Open source. Nothing to sign up for. Runs on your preview or your live site.',
  caption: "Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.",
  moment: 'Person 3 · 00:58 · pressed Add twice',
  words: '“I wasn’t sure the first Add did anything, so I pressed it again.”',
  comesBack: 'What comes back.',
  comesBackLead: 'Here is one person’s attempt at one goal as it comes back: whether they reached it, the moments that got in the way, each playing in place, and how it felt.',
  fileCaption: 'If you have written a Playwright test, you have written this.',
  result: 'Problems found: 4 across 5 people.',
  reached: 'Reached the goal: 2 of 5.',
  afterGoal: 'After the goal, typically: Would it help them? 4 of 5 · Easy to use? 2 of 5',
  priority: 'Problem 1 is the one to fix first: both people who hit it pressed Done believing they had finished, and their colleague got the same email twice. Problem 3 is one link.',
  closing: 'A run reports the problems it found, or that it found none this time. There is no score and no pass.',
  scenario: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.",
  people: 'Where the people come from.',
  peopleLead: 'Friends are kind and coworkers know too much. Three ways to reach people who are neither.',
  pr: 'In the pull request.',
  prLead: 'Put `npx ui-tests run` in the job that deploys your preview. Once the attempts are in, a check lands on the pull request with a report page anyone on the team can open. Your other tests prove the code works. This one shows whether a person can use it.',
  prCaption: "The report page opens on whether people reached the goal and the ranked problems, each with the moments to watch and what to change, and every person's attempt below.",
}
export const example = `import { context, goal, outcome, expect } from 'ui-tests'

context({
  users: {
    are: 'developers who ship UI and have no researcher',
    did: 'shipped a user interface you built yourself',
    within: '3 months',
    role: ['developer', 'designer', 'founder'],
    not: ['works in UX research'],
  },
  purpose: 'find out whether people can use what I built, without a researcher',
}, () => {
  goal('start trying ui-tests', { happyPath: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => {
      expect(page.url()).toContain('/docs/getting-started')
    })
  })
})`
/** The file `npx ui-tests init` writes, with Weekboard filled in: the landing section, the guide's step 4 and the README show it as written. */
export const inviteExample = exampleFile
export const inviteFile = exampleFileName
/**
 * Compilation (docs/design/site-schema.md; design/artefacts/compile-section.html): the file, then each piece a person meets in order,
 * with the fields and lines that produce it, the note, and what comes back. The screens themselves are drawn by the component.
 */
export const compilation = {
  heading: 'What you write, what they see.',
  lead: 'Every screen a person meets, in the order they meet it, beside the lines of your test that produce it, and what comes back from each. The path you expect and the check you wrote stay on your side, so nothing you wrote can lead them.',
  commands: [
    { command: 'npm install -D ui-tests', does: 'Adds the package.', strong: '' },
    { command: 'npx ui-tests init', does: 'Creates the file below, with the example filled in.', strong: 'the file' },
    { command: 'npx ui-tests run', does: 'Turns it into these screens and puts people in front of them.', strong: 'these screens' },
  ],
  note: '`npx ui-tests` on its own runs every screen on you first, so you see the card, the bar and your own trace before anyone else does.',
  pieces: [
    { n: 1, id: 'consent', name: 'Consent', sub: 'before anything loads', fields: 'video', lines: [12], notes: ['What the person does on the page is always recorded, and the consent says so in plain words. `video: true` adds the screen as a video, which is what needs the browser\'s prompt; without that line the first line of the list is all there is. Voice and camera are always the person\'s choice. The incentive and the purposes are filled in from the run. The colours are Weekboard\'s: the chrome inverts their page and takes the one accent they set.'], returns: 'recorded: actions, screen, voice · camera: declined' },
    { n: 2, id: 'screener', name: 'Who gets in, and how many', sub: 'the sample', fields: 'users · purpose · catch', lines: [4, 5, 6, 7, 8, 9, 10, 11, 17], notes: ['Six questions, one per screen; press Next to see them all. The first three come from `users`: `did` and `within` become a recency question with bands, `uses` a multi-select with one decoy, `not` an item among neutral ones, so nobody can tell what disqualifies. The last three come from `purpose`: when they last needed it, how they do it today, how much it matters. Write `users` as the sentence alone and the first three are drafted from it.', 'The `catch` line sets how many: one in three at 85% confidence means five people, enough to see any problem that hits one person in three with an 87% chance. Leave it out and that is the default. From the paid panel five people cost about $54, under a cap you set before it starts; your own link and your own visitors cost nothing.'], returns: 'screened 20 · matched 5 · fit: 3 of 5 had the need this month · how they do it today, in their words' },
    { n: 3, id: 'impression', name: 'First impression', sub: 'on by default', fields: 'purpose · happyPath', lines: [11, 16], notes: ['The page the task starts on is flashed for 500 ms, then one open question. The start is the first page of the `happyPath` unless the goal names a `start`; name another page for the flash with `impression: { page }` when the task begins behind a login and the purpose lives on the public page. The answers are read against the `purpose`, which the person never sees, and you can re-read any of them. Then the page comes back for one click.'], returns: 'named the purpose: 4 of 5, with their words · first click on your path: 3 of 5' },
    { n: 4, id: 'card', name: 'Scenario card', sub: 'from the goal, never the path', fields: 'users · purpose · beforeEach · goal', lines: [5, 11, 14, 15], notes: ['The situation from `users.are` and `purpose`, the action from the goal\'s name, the name and email from `beforeEach`. Lint rejects any word that appears on a control of your site, so the card cannot hint where to click. Edit it in the trace and pin it with `scenario`.'], returns: 'the exact card text, kept with the run' },
    { n: 5, id: 'bar', name: 'Your page, with the bar, then the check', sub: 'two controls, one check', fields: 'goal · happyPath · video · outcome', lines: [12, 15, 16, 19, 20, 21], notes: ['One small pill in a corner, draggable, that hides while they type in your page. The red dot and the time come from `video`, with a pause; there is no microphone during the task. The summary is the goal\'s name; press it to reread the card. Done asks "Finished this task?" in place. No countdown: the two pages of the `happyPath` set a silent three-minute limit, and the person may ask for more time once. The pill takes your font, inverts your page\'s colours and uses the one accent you set, so it is never mistaken for your site and never carries ours.', 'When they press Done, the `outcome` runs against the page as they left it. What they said does not count; what the page says does. A check that cannot decide returns "couldn\'t tell" and is never rounded either way.'], returns: 'time on this goal · every moment · their path against yours · how it ended · reached the goal: yes / no / couldn\'t tell, with the diff' },
    { n: 6, id: 'after', name: 'After the task', sub: 'not from your file', fields: '', lines: [], notes: ['Five screens, one question each; press Next to see them all. The first two come after every attempt, including the ones that ended with I couldn\'t do this: how easy it was, with nothing preselected, and, at 4 or below, what made it difficult. The last three come once, after all goals: would it help them, is it easy to use, and anything they want to say, typed or spoken. Confidence is asked only when a goal has no check, so Weekboard\'s people never see it.'], returns: 'ease 3 of 7 · what made it difficult, in their words · would it help them 4 of 5 · easy to use 2 of 5 · words and audio' },
  ],
  sample: [['People', '5 from the paid panel, matched to `users`'], ['Chance of seeing a 1-in-3 problem', '87%'], ['Cost', 'about $54 · cap $60 · results within 48 hours']],
  check: [['Person 3, after Done', 'Not reached', 'main contained "2 invitations pending"'], ['Person 5, after Done', 'Reached', '1:12']],
}
/** The run's problems, ranked by impact (blocked, slowed, confused), then by how many people hit them. */
export const problems = [
  { title: 'Pressed Add, saw nothing change, pressed it again; two invitations went out', impact: 'blocked', count: '2 of 5', quote: '"I wasn\'t sure the first one did anything."', watch: 'Person 3 at 00:58, Person 4 at 00:41', change: 'On press, change the button to "Invited sam@acme.co" and disable it.', moment: 'Person 3 · 00:58 → 01:04' },
  { title: "Stopped at a grey Add button and pressed I couldn't do this", impact: 'blocked', count: '1 of 5', quote: '"It looked switched off."', watch: 'Person 2 at 00:49', change: 'Keep the button solid. Validate the address on press, with a message.', moment: 'Person 2 · 00:45 → 00:54' },
  { title: 'Looked for Invite in the Share menu and found only link options', impact: 'slowed', count: '4 of 5', quote: '"Share is where you add people."', watch: 'Person 1 at 00:04, Person 2 at 00:06, Person 3 at 00:03, Person 5 at 00:09', change: 'Put "Invite a colleague" at the top of the Share menu.', moment: 'Person 3 · 00:03 → 00:12' },
  { title: "Typed the colleague's email into the board search", impact: 'confused', count: '2 of 5', quote: '"I figured it would find them."', watch: 'Person 1 at 00:30, Person 3 at 00:23', change: 'When a search matches no cards, offer "Invite someone with this email".', moment: 'Person 3 · 00:23 → 00:32' },
] as const
export const sources = [
  ['Your link', 'Anyone you send it to: a customer, a community, the person at the next desk', 'Free', 'As each person finishes'],
  ['A paid panel', 'People matched to the `users` line in your file, found for you', 'About $54 for a short task, under a cap you set', 'Within 48 hours'],
  ['Your visitors', 'On the hosted version: people already on your live site, invited the moment they are visibly struggling', 'Free', 'As each person finishes'],
] as const
export const commands = { install: 'npm install -D ui-tests', init: 'npx ui-tests init', run: 'npx ui-tests', people: 'npx ui-tests run', report: 'npx ui-tests report k2m9' }
export const rehearsal = 'Rehearsal: 0 of 5 planned attempts recorded.'
export const guide = {
  title: 'Getting started',
  titles: ['Install', 'Set up', 'Try it on yourself', 'Write your own', 'Run it with real people', 'Run it with an agent'],
  requirement: 'Node 22. Paste one line on any site, or install the package in a Next.js app.',
  installIntro: 'In a Next.js app, install the package. On any other site, paste one line instead: Without a repository.',
  install: 'You see "ui-tests" in `devDependencies`.',
  try: 'You see a link in the terminal, then in your browser the consent, a few questions, the first impression, the scenario card, your own page with the bar over it, and the questions after the task, one at a time. Press "Done". The terminal prints:',
  write: 'You open `ui-tests/invite.ui.test.ts`, the file `init` wrote with the Weekboard example filled in, and change it to your own site:',
  next: 'You see, on the next `npx ui-tests`, the card reads: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam\'s email is sam@acme.co. When you think you\'ve finished, press Done. If you get stuck, press I couldn\'t do this." It is written from `users`, `purpose`, the goal and `beforeEach`, never from the path; pin your own wording with `scenario`. Write `users` as the sentence alone and `ui-tests lint` prints the screener it drafted from it, and the plan names the recording level: event replay, or screen video with `video: true`.',
  agent: 'You type, in the same file or a new one:',
  agentSee: 'You see a separate agent report:',
  read: 'Read what came back',
  once: 'You type, once the attempts are in:',
  pr: 'Then, for the pull request, put `npx ui-tests run` in the job that deploys your preview. On the next pull request you see the check:',
}
export const agent = {
  heading: 'The same test, run by an agent.',
  lead: 'Point a file at your API, your MCP server or your CLI and run it with an agent instead of a person. Five trials, a trace for each, a report of its own. Agent runs are never counted with people and never described as people.',
  closing: 'One file, two actors, two reports that never mix.',
  command: 'npx ui-tests run --actor agent',
  fileLine: "goal('add a member through the API', { target: { http: 'https://api.weekboard.app' } })",
  report: { goal: 'add a member through the API', url: 'https://ui-tests.com/r/k2m9-agent', trials: [
    { seconds: '0:19', detail: 'POST /members, then GET /members' },
    { seconds: '0:22' },
    { seconds: '0:41', stopped: 'called POST /invites, which does not exist' },
    { seconds: '0:17' },
    { seconds: '0:35', stopped: 'sent the email in the query string, 400' },
  ] },
}
export const hosted = {
  heading: 'No repo to put it in? Paste one line.',
  lead: 'One script tag on your live site, through your tag manager if that is how you ship. Then the same test in a form instead of a file: who the users are, what they are trying to do, and how you can tell they did it, by a page they reach, an element they see or a question they answer. People come from your link, a paid panel or your own visitors, and the report is a page you can share.',
  closing: 'Same test, same report, no install.',
  snippet: '<script src="https://ui-tests.com/s.js" data-site="weekboard" async></script>',
  users: 'people who signed up this week and want a colleague on their board',
  purpose: 'plan the week together without emailing screenshots around',
  goal: 'invite a colleague',
  screen: { did: 'signed up for a tool to plan work with a team', within: '7 days', uses: 'Trello, Asana, Notion, Linear', not: 'has used Weekboard' },
  paste: 'Paste the line',
  pasteSee: 'You see the script in your live site’s markup, or in the tag manager that publishes it.',
  fill: 'Fill the form',
  fillSee: 'You see the run on your dashboard, and a report page you can share once the attempts are in.',
}
/** The hosted dashboard: other runs on the same site, none of them the example run shown above it. Fixed fields first, the name last. */
export const runs = [
  { date: '16 Oct', participants: '3 of 5', status: 'running', progress: 0.6, result: '', band: '', name: 'change the plan to Team' },
  { date: '15 Oct', participants: '5 of 5', status: 'done', progress: 1, result: 'Reached 5 of 5 · 1 problem', band: 'great', name: 'export last month’s board' },
  { date: '12 Oct', participants: '8 of 8', status: 'done', progress: 1, result: 'Reached 6 of 8 · 3 problems', band: 'check', name: 'start a board from a template' },
  { date: '9 Oct', participants: '5 of 5', status: 'done', progress: 1, result: 'Reached 5 of 5 · none found', band: 'great', name: 'find a card from last week' },
  { date: '—', participants: '0 of 5', status: 'draft', progress: 0, result: '', band: '', name: 'archive a finished board' },
] as const
export const ui = { wordmark: 'ui-tests', guide: 'Guide', github: 'GitHub', getStarted: 'Get started', skip: 'Skip to content', navigation: 'Main navigation', steps: 'Getting started', copy: 'Copy', copied: 'Copied', copyError: 'Could not copy. Select and copy the code.', typescript: 'TypeScript', shell: 'Shell', output: 'Output', example: 'Example run' }
