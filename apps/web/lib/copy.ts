import { exampleFile, exampleFileName } from 'ui-tests/example'

/** Approved D2 copy. README parity tests cover every exported string. */
export const promise = 'See where people get stuck on what you just shipped.'
export const intro = 'Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.'
export const landing = {
  access: 'Open source. Nothing to sign up for. Runs on your preview or your live site.',
  caption: "Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.",
  fileCaption: 'If you have written a Playwright test, you have written this.',
  closing: 'A run reports the problems it found, or that it found none this time. There is no score and no pass.',
  scenario: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.co.",
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
 * Compilation (docs/design/site-schema.md; design/artefacts/compile-section.html): each piece a person meets in order, with its
 * note and what comes back, then the file. `tab` is the piece's name on its tab, as the artefact names it. The screens themselves
 * are drawn by the component; no piece carries code of its own (issue #54).
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
    { n: 1, id: 'consent', tab: 'Consent', name: 'Consent', sub: 'before anything loads', notes: ['What the person does on the page is always recorded, and the consent says so in plain words. `video: true` adds the screen as a video, which is what needs the browser\'s prompt; without that line the first line of the list is all there is. Voice and camera are always the person\'s choice. The incentive and the purposes are filled in from the run. The colours are Weekboard\'s: the chrome inverts their page and takes the one accent they set.'], returns: 'recorded: actions, screen, voice · camera: declined' },
    { n: 2, id: 'screener', tab: 'Screener', name: 'Who gets in, and how many', sub: 'the sample', notes: ['Six questions, one per screen; press Next to see them all. The first three come from `users`: `did` and `within` become a recency question with bands, `uses` a multi-select with one decoy, `not` an item among neutral ones, so nobody can tell what disqualifies. The last three come from `purpose`: when they last needed it, how they do it today, how much it matters. Write `users` as the sentence alone and the first three are drafted from it.', 'The `catch` line sets how many: one in three at 85% confidence means five people, enough to see any problem that hits one person in three with an 87% chance. Leave it out and that is the default. From the paid panel five people cost from $60, under a cap you set before it starts. The paid panel and your visitors are the only things you pay for; your own link costs nothing.'], returns: 'screened 20 · matched 5 · who took part: 3 of 5 had the need this month · how they do it today, in their words' },
    { n: 3, id: 'impression', tab: 'First look', name: 'First look', sub: 'on by default', notes: ['The page the task starts on is flashed for 500 ms, then one open question. The start is the first page of the `happyPath` unless the goal names a `start`; name another page for the flash with `impression: { page }` when the task begins behind a login and the purpose lives on the public page. The answers are read against the `purpose`, which the person never sees, and you can re-read any of them. Then the page comes back for one click.'], returns: 'named the purpose: 4 of 5, with their words · first click on your path: 3 of 5' },
    { n: 4, id: 'card', tab: 'Scenario card', name: 'Scenario card', sub: 'from the goal, never the path', notes: ['The situation from `users.are` and `purpose`, the action from the goal\'s name, the name and email from `beforeEach`. Lint rejects any word that appears on a control of your site, so the card cannot hint where to click. Edit it in the trace and pin it with `scenario`.'], returns: 'the exact card text, kept with the run' },
    { n: 5, id: 'bar', tab: 'Your page, with the bar', name: 'Your page, with the bar, then the check', sub: 'two controls, one check', notes: ['One small pill in a corner, draggable, that hides while they type in your page. The red dot and the time come from `video`, with a pause; there is no microphone during the task. The summary is the goal\'s name; press it to reread the card. Done asks "Finished this task?" in place. No countdown: the two pages of the `happyPath` set a silent three-minute limit, and the person may ask for more time once. The pill takes your font, inverts your page\'s colours and uses the one accent you set, so it is never mistaken for your site and never carries ours.', 'When they press Done, the `outcome` runs against the page as they left it. What they said does not count; what the page says does. A check that cannot decide returns "couldn\'t tell" and is never rounded either way.'], returns: 'time on this goal · every moment · their path against yours · how it ended · reached the goal: yes / no / couldn\'t tell, with the diff' },
    { n: 6, id: 'after', tab: 'After the task', name: 'After the task', sub: 'not from your file', notes: ['Five screens, one question each; press Next to see them all. The first two come after every attempt, including the ones that ended with I couldn\'t do this: how easy it was, with nothing preselected, and, at 4 or below, what made it difficult. The last three come once, after all goals: would it help them, is it easy to use, and anything they want to say, typed or spoken. Confidence is asked only when a goal has no check, so Weekboard\'s people never see it.'], returns: 'ease 3 of 7 · what made it difficult, in their words · would it help them 4 of 5 · easy to use 2 of 5 · words and audio' },
  ],
  sample: [['People', '5 from the paid panel, matched to `users`'], ['Chance of seeing a 1-in-3 problem', '87%'], ['Cost', 'from $60 · cap $70 · first people within minutes, usually all five within a few hours']],
}
/**
 * The run's problems (design/artefacts/run-report-list.html), each as a sentence about the design, where as the page and the element
 * (the short form, and the Playwright locator a developer can paste into a test), the moments that show it (person and second,
 * the first one the moment to watch), the words tied to it and who said them, and the suggested change. Who hit it and how many
 * come from the moments; the rank (impact, then how many people) is computed, so the Share-menu problem, 4 of 5 but slowed,
 * ranks third behind the two that kept people from the goal.
 */
export const problems = [
  { title: 'Pressed Add, saw nothing change, pressed it again; Sam got two invitations', impact: 'blocked', page: '/settings/members', locator: 'button "Add"', playwright: "getByRole('button', { name: 'Add' })", moments: [[3, 58], [4, 41]], quote: { text: "I wasn't sure the first Add did anything, so I pressed it again.", who: 'Person 3, after the task' }, change: 'On press, change the button to "Invited sam@acme.co" and disable it.' },
  { title: "The Add button looked switched off; Person 2 pressed I couldn't do this", impact: 'blocked', page: '/settings/members', locator: 'button "Add"', playwright: "getByRole('button', { name: 'Add' })", moments: [[2, 49]], quote: { text: 'It looked switched off.', who: 'Person 2, after the task' }, change: 'Keep the button solid, and check the address on press, with a message.' },
  { title: 'Looked for Invite in the Share menu and found only link options', impact: 'slowed', page: '/board', locator: 'menu "Share"', playwright: "getByRole('button', { name: 'Share' })", moments: [[1, 4], [2, 6], [3, 3], [5, 9]], quote: { text: 'Share is where you add people.', who: 'Person 5, after the task' }, change: 'Put "Invite a colleague" at the top of the Share menu.' },
  { title: "Typed Sam's email into the board search", impact: 'confused', page: '/board', locator: 'field "Search"', playwright: "getByRole('textbox', { name: 'Search cards' })", moments: [[1, 30], [3, 23]], quote: { text: 'I figured it would find them.', who: 'Person 1, after the task' }, change: 'When a search matches no cards, offer "Invite someone with this email".' },
] as const
/** What worked: the last row of the list, with the moment each person did it. */
export const worked = { title: 'Found Settings, then Members, on their own', page: '/settings', locator: 'tab "Members"', playwright: "getByRole('link', { name: 'Members' })", moments: [[1, 44], [2, 40], [3, 46], [4, 19], [5, 39]] } as const
/**
 * WhatComesBack (docs/design/site-schema.md; design/artefacts/what-comes-back.html): the landing section "How it works.", with no
 * lead (issue #49). Three numbered pieces in the order a developer meets them: the check in the merge box, its page on GitHub, and
 * the report as the list (design/artefacts/run-report-list.html). The heading and the intros are the artefact's.
 */
export const whatComesBack = {
  heading: 'How it works.',
  /** The merge box: GitHub's own heading, then our check and two of the team's. */
  check: { n: 1, id: 'the-check', name: 'The check', intro: 'One line in the merge box, next to your other checks. Its mark is neutral, never red or green: there is no pass to give, and it never blocks a merge unless you ask it to.', heading: 'All checks have passed', counts: '1 neutral and 2 successful checks', others: [{ name: 'preview', summary: 'Deployment ready' }, { name: 'tests', summary: '212 passed' }] },
  checkPage: { n: 2, id: 'check-page', name: 'Its details, on GitHub', intro: 'Press Details and GitHub shows the check\'s own page: the sentence, the three problems to fix first with where they are and a link to the moment, and a link to the report. One screen, no pictures, no scrolling.' },
  report: { n: 3, id: 'the-report', name: 'The report', intro: 'The page the check links to, and the one you can send as a link. One line says whether it worked. Then each problem as one card, worst first, with its evidence inline: who hit it, where, the clip, their words and the smallest change. The five people in a strip, each linking to their attempt. One line closes the page.' },
}
/** The example run's facts that are not in the recordings: the product, where the report lives, the preview and commit the check ran on, where each person came from. */
export const runFacts = {
  product: 'Weekboard', host: 'https://ui-tests.com', preview: 'weekboard-git-invite-flow.vercel.app', commit: '80035db',
  /** Where each person came from: the run filled across both panels (the `run` frame in the guide says the same). */
  panels: { 1: 'Prolific', 2: 'Prolific', 3: 'CloudResearch Connect', 4: 'Prolific', 5: 'CloudResearch Connect' } as Record<number, string>,
  screened: 'screened as signed up for a planning tool this week',
  firstLook: { named: 4, firstClick: 3 },
  share: 'Share',
}
/**
 * Sources (docs/design/site-schema.md; design/artefacts/sources-section.html): where the people come from, verbatim from the artefact.
 * One row per source in the order your link, your visitors, a paid panel; each opens to how it works, the caveat and one picture.
 * The caveat is its lead sentence, then the rest. The research is docs/discovery/sources-research.md and sources-desk-research.md.
 */
export const sources = {
  heading: 'Where the people come from.',
  lead: 'Friends are kind and coworkers know too much. Three ways to reach people who are neither, and what each one can and cannot tell you. Open a row to see how it works and what the person sees.',
  columns: ['Source', 'Who', 'Cost', 'Time', 'Good for'],
  how: 'How it works',
  rows: [
    {
      id: 'link', icon: 'link', picture: 'join', name: 'Your link', what: 'A link to your run that anyone can open. Nothing to install.',
      who: "Anyone outside your team: a customer, a community, a friend's friend",
      cost: 'Free', costNote: 'Pay them if you like; the consent says so either way',
      time: 'As each person finishes', timeNote: 'Closes at the deadline, 48 h unless you set one',
      goodFor: 'What almost anybody would stumble on, today, and every week',
      steps: ['`npx ui-tests run` prints the link. It can point at a branch preview, at your laptop through a tunnel, or at your live site.', 'You send it. Ask a friend to pass it on rather than take it themselves.', 'Whoever opens it answers the same short screener, so the report still says who they were. Each attempt lands as the person finishes.'],
      caveat: ['Friends are kind and people in tech know too much.', 'Send it beyond your team and beyond tech where you can, and for each problem ask whether your users would hit it too.'],
    },
    {
      id: 'visitors', icon: 'cursor', picture: 'invitation', name: 'Your visitors', what: 'On the hosted version: people already on your live site, invited when a page has given them trouble twice.',
      who: 'Real visitors who seemed stuck and said yes, on their own device',
      cost: 'Paid', costNote: 'Like the panel, under a daily cap you set',
      time: 'Depends on your traffic', timeNote: 'A page with trouble and a few hundred visitors a day gives one or two',
      goodFor: 'Real tasks, real devices, the moment it went wrong',
      steps: ['One script tag on your site. It watches for the same trouble the attempt view shows: a dead click, a rage click, a U-turn, a long pause.', 'Mark the pages it must never interrupt. Checkout, payment and a form in progress are never interrupted anyway.', 'The second sign of trouble on the same page invites the person. Nothing from before a yes is kept. Their attempt is kept beside the five, not inside.'],
      caveat: ['They show where real users get stuck, not how many do.', 'Treat their problems as leads, and confirm them with a link or a panel run.'],
    },
    {
      id: 'paid-panel', icon: 'users', picture: 'fill', name: 'A paid panel', what: 'Five strangers who match your `users` block, found for you and paid by the run.',
      who: 'People who say they did what `users` describes; nobody who works in UX, design or marketing',
      cost: 'Starting at $12 a person', costNote: 'Five from $60; a cap of $70 holds the reserve',
      time: 'First people within minutes', timeNote: 'Usually all five within a few hours; a narrow audience a day or more',
      goodFor: "People like your users when you don't know any",
      steps: ['Put a cap in the config. The hosted version brings the panel accounts; on your own machine you add a token.', '`npx ui-tests run` turns `users` into each panel\'s filters and a short screener, prints the plan, and asks before it spends.', 'People are paid as they finish. Anyone you exclude later stays paid. What is not spent comes back.'],
      caveat: ['Panel people answer screeners for money.', 'Read the Who took part line in the report, and exclude anyone who is plainly not your audience. They stay paid; the count does not.'],
    },
  ],
  /** The paid panel's picture: one run filling across Prolific and CloudResearch Connect, each with its pool and speed, and the payment against the cap. */
  fill: {
    label: 'One run filling across two panels', run: 'k2m9', wanted: '5 people wanted', elapsed: '2 h 10 m',
    sources: [
      { id: 'prolific', name: 'Prolific', count: '3 of 3', first: 'first at 6 min', pool: '300,000+ active participants, 300+ filters, plus the screener from `users`', speed: 'First person usually within minutes; five within a few hours; a narrow audience a day or more, and the plan says so' },
      { id: 'connect', name: 'CloudResearch Connect', count: '2 of 2', first: 'first at 11 min', pool: 'Thousands of vetted, census-matched participants; profiled, screened and custom audiences', speed: 'First person within minutes; five within a few hours; a narrow audience needs a prescreen project, which adds time and cost' },
    ],
    paid: '$60', cap: '$70', back: '$10', labelled: 'Each attempt labelled with its panel',
  },
} as const
export const commands = { install: 'npm install -D ui-tests', init: 'npx ui-tests init', run: 'npx ui-tests', people: 'npx ui-tests run', report: 'npx ui-tests report k2m9' }
export const rehearsal = 'Rehearsal: 0 of 5 planned attempts recorded.'
export const guide = {
  title: 'Getting started',
  titles: ['Install', 'Set up', 'Try it on yourself', 'Write your own', 'Run it with people', 'Test your API with an agent'],
  requirement: 'Node 22. Paste one line on any site, or install the package in a Next.js app.',
  installIntro: 'In a Next.js app, install the package. On any other site, paste one line instead: Without a repository.',
  install: 'You see "ui-tests" in `devDependencies`.',
  try: 'You see a link in the terminal, then in your browser the consent, a few questions, the first look, the scenario card, your own page with the bar over it, and the questions after the task, one at a time. Press "Done". The terminal prints:',
  write: 'You open `ui-tests/invite.ui.test.ts`, the file `init` wrote with the Weekboard example filled in, and change it to your own site:',
  next: 'You see, on the next `npx ui-tests`, the card reads: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam\'s email is sam@acme.co. When you think you\'ve finished, press Done. If you get stuck, press I couldn\'t do this." It is written from `users`, `purpose`, the goal and `beforeEach`, never from the path; pin your own wording with `scenario`. Write `users` as the sentence alone and `ui-tests lint` prints the screener it drafted from it, and the plan names the recording level: event replay, or screen video with `video: true`.',
  agent: 'You type, in the same file or a new one:',
  agentSee: 'You see a separate agent report:',
  read: 'Read what came back',
  once: 'You type, once the attempts are in:',
  pr: 'Then, for the pull request, put `npx ui-tests run` in the job that deploys your preview. On the next pull request you see the check:',
}
/**
 * The agent section (design/artefacts/agents-section.html; docs/discovery/agent-section-research.md), verbatim: the heading, the
 * command under it, the three-sentence lead, and one tile per interface an agent uses, each its name, its target and one sentence
 * (a word in backticks is set in mono). The guide's agent step keeps the command, the file line, the closing and the terminal's report.
 */
export const agent = {
  heading: 'Agents use some interfaces, too.',
  lead: 'Your API, your MCP server and your CLI have a second kind of user: an agent that reads text, not pixels. Point the same file at that surface and five trials show whether it gets through. It is a capability test, not a usability one, and it never counts with people.',
  tiles: [
    { id: 'api', name: 'Your API', target: 'target: { http }', text: 'Endpoint names, schemas and error bodies are its whole page. A `400` with no reason is a dead end.' },
    { id: 'mcp', name: 'Your MCP server', target: 'target: { mcp }', text: 'Tool names and their descriptions are the only labels it reads. If two tools sound alike, it picks one.' },
    { id: 'cli', name: 'Your CLI', target: 'target: { cli }', text: 'Flags, help text and exit codes are what it sees. A `--help` that lies costs it the run.' },
  ],
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
/**
 * What a run is worth (design/artefacts/roi-section.html; docs/discovery/roi-research.md; issue #53), verbatim: the heading, the one
 * sentence and its arithmetic as they read with the four given numbers at their defaults, each field's value and label, and the two
 * sources. The section recomputes the sentence and the arithmetic as the given numbers change (lib/worth.ts).
 */
export const worth = {
  heading: 'What a run is worth.',
  sentence: "Five people cost about $60, about 39\u00a0minutes of a US developer's time. If one problem they show you would have taken longer than that to find from bug reports, reproduce and fix after release, the run has paid for itself.",
  arithmetic: 'The arithmetic: $135,980 ÷ 2,080 h = $65 an hour in wages. Wages are 70% of what employers pay, so about $93 an hour. $60 ÷ $93 = 0.65 h, about 39\u00a0minutes.',
  given: {
    pay: { value: '135,980', label: 'US median pay for software developers, a year' },
    hours: { value: '2,080', label: 'working hours a year' },
    share: { value: '70', label: 'wages as a share of what employers pay, per cent' },
    price: { value: '60', label: 'what the run cost' },
  },
  sources: [
    { name: 'BLS, software developers, May 2025', href: 'https://www.bls.gov/ooh/computer-and-information-technology/software-developers.htm' },
    { name: 'BLS, employer costs, March 2026', href: 'https://www.bls.gov/news.release/archives/ecec_03202026.htm' },
  ],
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
/** The footer's links (issue #51): the author's site, the licence and the new-issue page; the header already links to GitHub. */
export const footer = { site: 'miguel.design', licence: 'Open source MIT licence', report: 'Report a bug or suggest an improvement', label: 'About ui-tests' }
export const ui = { wordmark: 'ui-tests', guide: 'Guide', github: 'GitHub', getStarted: 'Get started', skip: 'Skip to content', navigation: 'Main navigation', steps: 'Getting started', copy: 'Copy', copied: 'Copied', copyError: 'Could not copy. Select and copy the code.', typescript: 'TypeScript', shell: 'Shell', output: 'Output', example: 'Example run' }
