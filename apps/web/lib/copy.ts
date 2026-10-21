import { tagFor } from 'ui-tests/tag'
import { exampleFile, exampleFileName } from './example'

/** Approved D2 copy: every word on the landing page. */
export const promise = 'See where people get stuck on what you just shipped.'
export const intro = 'Say who your users are, what they are trying to do, and how you would know they did it, in one small file next to your code. One command puts real people in front of your site, records every attempt, and hands back the problems they hit, ranked, with the moment to watch, the words they said, and what to change.'
export const landing = {
  access: 'Open source. Nothing to sign up for. Runs on your preview or your live site.',
  /** The hero's second action: the getting-started page. */
  start: 'Get started',
  caption: "Each line opens to the moment to watch, the person's words, and the smallest change that would fix it.",
  scenario: "You plan the week on this board and want your colleague Sam to plan it with you. Invite Sam to the board. Sam's email is sam@acme.example.",
}
export const example = `import { study, task, outcome, expect } from 'ui-tests'

study('getting started', {
  users: {
    are: 'developers who ship UI and have no researcher',
    did: 'shipped a user interface you built yourself',
    within: '3 months',
    role: ['developer', 'designer', 'founder'],
    not: ['works in UX research'],
  },
  purpose: 'find out whether people can use what I built, without a researcher',
}, () => {
  task('start trying ui-tests', { path: ['/', '/docs/getting-started'] }, () => {
    outcome(async ({ page }) => {
      expect(page.url()).toContain('/docs/getting-started')
    })
  })
})`
/** The study file, with Weekboard filled in, as the landing's compile section shows it. */
export const inviteExample = exampleFile
export const inviteFile = exampleFileName
/**
 * Compilation (docs/design/site-schema.md): each piece a person meets in order, with its
 * note and what comes back, then the file. `tab` is the piece's name on its tab. The screens themselves
 * are drawn by the component; no piece carries code of its own (issue #54).
 */
export const compilation = {
  heading: 'What you write, what they see.',
  lead: 'The whole test, then every screen it produces, in the order a person meets them, and what comes back from each. The path you expect and the check you wrote stay on your side, so nothing you wrote can lead them.',
  commands: [
    { command: 'npm install -D ui-tests', does: 'Adds the package.', strong: '' },
    { command: 'npx ui-tests init', does: 'Writes a study file and a config, and prints the script tag for your app.', strong: 'a study file' },
    { command: 'npx ui-tests', does: 'Runs the whole study on you, in your browser: the consent, the scenario card, your page with the bar, and your own trace. Recruits nobody, costs nothing.', strong: 'on you' },
    { command: 'npx ui-tests recruit', does: 'Runs it with real people: your link, your visitors or a paid panel. Shows the plan and the price, and asks first.', strong: 'real people' },
    { command: 'npx ui-tests check', does: 'In the job that deploys your preview: the same run, with the cap in your config as the yes, and a check on the pull request.', strong: 'a check on the pull request' },
  ],
  note: '',
  pieces: [
    { n: 1, id: 'consent', tab: 'Consent', name: 'Consent', sub: 'before anything loads', notes: ['What the person does on the page is always recorded, and the consent says so in plain words. `record: \'video\'` adds the screen as a video, which is what needs the browser\'s prompt and raises the incentive to 1.5×, and the plan shows that price; without that line the first line of the list is all there is. Voice and camera are always the person\'s choice. The incentive and the purposes are filled in from the run. The colours are Weekboard\'s: the chrome inverts their page and takes the one accent they\u00a0set.'], returns: 'recorded: actions, screen, voice · camera: declined' },
    { n: 2, id: 'screener', tab: 'Screener', name: 'Who gets in, and how many', sub: 'the sample', notes: ['Six questions, one per screen; press Next to see them all. The first three come from `users`: `did` and `within` become a recency question with bands, `uses` a multi-select with one decoy, `not` an item among neutral ones, so nobody can tell what disqualifies. The last three come from `purpose`: when they last needed it, how they do it today, how much it matters. Write `users` as the sentence alone and the first three are drafted from it.', 'The `sample` line sets how many, for the whole study: one in three at 85% confidence means five people, enough to see any problem that hits one person in three with an 87% chance. Leave it out and that is the default. From the paid panel five people cost from $60, under a cap you set before it starts. The paid panel and your visitors are the only things you pay for; your own link costs nothing.'], returns: 'screened 20 · matched 5 · who took part: 3 of 5 had the need this month · how they do it today, in their words' },
    { n: 3, id: 'impression', tab: 'First look', name: 'First look', sub: 'on for public pages', notes: ['A page is flashed for 500 ms, then one open question. It is the page the task starts on when that page is public, and off when the start is behind a sign-in, as Weekboard\'s board is; `firstLook: { page }` names the public page where the purpose lives, here the home page. The answers are read against the `purpose`, which the person never sees, and you can re-read any of them. Then the page comes back for one click.'], returns: 'named the purpose: 4 of 5, with their words · first click on your path: 3 of 5' },
    { n: 4, id: 'card', tab: 'Scenario card', name: 'Scenario card', sub: 'from the task, never the path', notes: ['The situation from `users.are` and `purpose`, the action from the task\'s name, the name and email from what `setup` returns. Lint rejects any word that appears on a control of your site, so the card cannot hint where to click. Edit it in the trace and pin it with `scenario`.'], returns: 'the exact card text, kept with the run' },
    { n: 5, id: 'bar', tab: 'Your page, with the bar', name: 'Your page, with the bar, then the check', sub: 'two controls, one check', notes: ['One small pill in a corner, draggable, that hides while they type in your page. The red dot and the time come from `record: \'video\'`, with a pause; there is no microphone during the task. The summary is the goal\'s name; press it to reread the card. Done asks "Finished this task?" in place. No countdown: `timeLimit` is silent, and the person may ask for more time once. The `path` is only what you expect them to take; it sets nothing else. The pill takes your font, inverts your page\'s colours and uses the one accent you set, so it is never mistaken for your site and never carries ours.', 'When they press Done, the `outcome` asks your app what happened, whatever page they ended on: here, whether this board has an invitation for Sam. What they said does not count; what your app holds does. Pressing Add twice still invited Sam; the second invitation comes back as a problem, not as a failure. A check that cannot decide returns "couldn\'t tell" and is never rounded either way.'], returns: 'time on this goal · every moment · their path against yours · how it ended · reached the goal: yes / no / couldn\'t tell, with the diff' },
    { n: 6, id: 'after', tab: 'After the task', name: 'After the task', sub: 'not from your file', notes: ['Five screens, one question each; press Next to see them all. The first two come after every attempt, including the ones that ended with I couldn\'t do this: how easy it was, with nothing preselected, and, at 4 or below, what made it difficult. The last three come once, after all goals: would it help them, is it easy to use, and anything they want to say, typed or spoken. Confidence is asked only when a goal has no check, so Weekboard\'s people never see it.'], returns: 'ease 3 of 7 · what made it difficult, in their words · would it help them 4 of 5 · easy to use 2 of 5 · words and audio' },
  ],
}
/**
 * The run's problems, each as a sentence about the design, where as the page and the element
 * (the short form, and the Playwright locator a developer can paste into a test), the moments that show it (person and second,
 * the first one the moment to watch), the words tied to it and who said them, and the suggested change. Who hit it and how many
 * come from the moments; the rank (impact, then how many people) is computed, so the Share-menu problem, 4 of 5 but slowed,
 * ranks third behind the two that kept people from the goal.
 */
export const problems = [
  { title: 'Pressed Add, saw nothing change, pressed it again; Sam got two invitations', impact: 'confused', page: '/settings/members', locator: 'button "Add"', playwright: "getByRole('button', { name: 'Add' })", moments: [[3, 58], [4, 41]], quote: { text: "I wasn't sure the first Add did anything, so I pressed it again.", who: 'Person 3, after the task' }, change: 'On press, change the button to "Invited sam@acme.example" and disable it.' },
  { title: "The Add button looked switched off; Person 2 pressed I couldn't do this", impact: 'blocked', page: '/settings/members', locator: 'button "Add"', playwright: "getByRole('button', { name: 'Add' })", moments: [[2, 49]], quote: { text: 'It looked switched off.', who: 'Person 2, after the task' }, change: 'Keep the button solid, and check the address on press, with a message.' },
  { title: 'Looked for Invite in the Share menu and found only link options', impact: 'slowed', page: '/board', locator: 'menu "Share"', playwright: "getByRole('button', { name: 'Share' })", moments: [[1, 4], [2, 6], [3, 3], [5, 9]], quote: { text: 'Share is where you add people.', who: 'Person 5, after the task' }, change: 'Put "Invite a colleague" at the top of the Share menu.' },
  { title: "Typed Sam's email into the board search", impact: 'confused', page: '/board', locator: 'field "Search"', playwright: "getByRole('textbox', { name: 'Search cards' })", moments: [[1, 30], [3, 23]], quote: { text: 'I figured it would find them.', who: 'Person 1, after the task' }, change: 'When a search matches no cards, offer "Invite someone with this email".' },
] as const
/** What worked: the last row of the list, with the moment each person did it. */
export const worked = { title: 'Found Settings, then Members, on their own', page: '/settings', locator: 'tab "Members"', playwright: "getByRole('link', { name: 'Members' })", moments: [[1, 44], [2, 40], [3, 46], [4, 19], [5, 39]] } as const
/**
 * WhatComesBack (docs/design/site-schema.md): the landing section "How it works.", with no
 * lead (issue #49). Three numbered pieces in the order a developer meets them: the check in the merge box, its page on GitHub, and
 * the replay (issue #62), one person's minute as a rail with the first problem's moment as a card.
 */
export const whatComesBack = {
  heading: 'How it works.',
  /** The merge box: GitHub's own heading, then our check and two of the team's. */
  check: { n: 1, id: 'the-check', name: 'The check', intro: 'One line in the merge box, next to your other checks, from `npx ui-tests check` in your preview job. It waits while people take part and turns neutral when the run closes, never red or green: there is no pass to give. One run per pull request: a push while people are still in starts nothing new, and the line names the commit they\u00a0saw.', heading: 'All checks have passed', counts: '1 neutral and 2 successful checks', others: [{ name: 'preview', summary: 'Deployment ready' }, { name: 'tests', summary: '212 passed' }] },
  checkPage: { n: 2, id: 'check-page', name: 'Its details, on GitHub', intro: 'Press Details and GitHub shows the check\'s own page: the sentence, the three problems to fix first with where they are and a link to the moment, and a link to the report. One screen, no pictures, no scrolling.' },
  /** The replay (issue #62): an illustration of one person's minute, the first problem's moment as one compact card over the rail. */
  replay: {
    n: 3, id: 'the-replay', name: 'The replay', intro: 'Every problem in the report comes with the moment it happened: the person\'s minute as a rail, the moments that got in the way as stops, and at each stop the clip, what they did, what they said afterwards, and the smallest change that would have fixed it.',
    person: 3, at: 58, to: 64, impact: 'Confused', did: 'Pressed Add, saw nothing change, pressed it again.', said: problems[0].quote.text, change: problems[0].change,
    started: 'Started on /board', ended: 'Pressed Done', reached: 'reached the goal, with two invitations',
  },
}
/** The example run's facts that are not in the recordings: the product, where the report lives, the preview and commit the check ran on, where each person came from. */
export const runFacts = {
  product: 'Weekboard', host: 'https://ui-tests.com', preview: 'weekboard-git-invite-flow.vercel.app', commit: '80035db',
  /** Where each person came from: the run filled across both panels. */
  panels: { 1: 'Prolific', 2: 'Prolific', 3: 'CloudResearch Connect', 4: 'Prolific', 5: 'CloudResearch Connect' } as Record<number, string>,
  screened: 'screened as planning work with a team in a shared tool',
  firstLook: { named: 4, firstClick: 3 },
  share: 'Share',
}
/**
 * Sources (docs/design/site-schema.md): where people who represent users come from.
 * One row per source in the order your link, your visitors, a paid panel; each opens to how it works, the caveat and one picture.
 * The caveat is its lead sentence, then the rest. The research is docs/discovery/sources-research.md and sources-desk-research.md.
 */
export const sources = {
  heading: 'Where people who represent users come from.',
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
      steps: ['`npx ui-tests recruit` prints the link. It can point at a branch preview, at your laptop through a tunnel, or at your live site.', 'You send it. Ask a friend to pass it on rather than take it themselves.', 'Whoever opens it answers the same short screener, so the report still says who they were. Each attempt lands as the person finishes.'],
      caveat: ['Friends are kind and people in tech know too much.', 'Send it beyond your team and beyond tech where you can, and for each problem ask whether your users would hit it too.'],
    },
    {
      id: 'visitors', icon: 'cursor', picture: 'invitation', name: 'Your visitors', what: 'On your deploy: people already on your live site, invited when a page has given them trouble twice.',
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
      steps: ['Put a cap in the config. Your deploy and your machine both use your own panel account: add a token once.', '`npx ui-tests recruit` turns `users` into each panel\'s filters and a short screener, prints the plan, and asks before it spends. In CI, `npx ui-tests check` asks nothing: the cap in the config is the yes.', 'People are paid as they finish. Anyone you exclude later stays paid. What is not spent comes back.'],
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
export const commands = { install: 'npm install -D ui-tests', init: 'npx ui-tests init', run: 'npx ui-tests', people: 'npx ui-tests recruit', ci: 'npx ui-tests check', report: 'npx ui-tests report k2m9' }
/**
 * The agent section (docs/discovery/agent-section-research.md): the heading, the
 * command under it, the three-sentence lead, and one tile per interface an agent uses, each its name, its target and one sentence
 * (a word in backticks is set in mono).
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
  command: 'npx ui-tests --actor agent',
}
/**
 * What a run is worth (docs/discovery/roi-research.md; issue #53): the heading, the one
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
/**
 * The host section (docs/prd/05-integration.md, "Where things run"): the heading, the
 * lead, two unnumbered pieces (the command and its terminal as drawn, the line and its script tag) and the closing. The server is the
 * author's, started with `ui-tests serve` or the Docker image; the line is the same tag `init` prints, for the example's address.
 */
export const hostedServer = 'https://tests.weekboard.example'
export const hosted = {
  heading: 'Your server, one command.',
  lead: 'The consent, the questions, the collector and the report run on a ui-tests server you start for as long as a study is open: on your laptop, a machine you rent or a free tier. Nobody else runs it, and the recordings stay on your box. `npx ui-tests host`, one command that puts it in an account you own, is not shipped yet.',
  command: { name: 'The command', intro: 'On any machine with Node 24 or later, with UI_TESTS_PUBLIC_URL set to the address people reach it at. It prints that address and the tag that points there. The Docker image, to be published as ghcr.io/miguel-perez/ui-tests, is built from the repository and runs the same thing.', tab: ['Terminal', 'Example'] },
  terminal: `$ npx ui-tests serve
ui-tests server: ${hostedServer}
<script data-ui-tests="${hostedServer}">…</script>`,
  line: { name: 'The line', intro: 'One inline script tag in your HTML layout, whatever your app is built with. It does nothing until a person is in an attempt: no request, no change to the page.', tab: ['index.html', 'or your layout'] },
  snippet: tagFor(hostedServer),
  closing: 'Same test, same report, on a box you own.',
}
/** The footer's links (issue #51): the author's site, the licence and the new-issue page; the header already links to GitHub. */
export const footer = { site: 'miguel.design', licence: 'Open source MIT licence', report: 'Report a bug or suggest an improvement', label: 'About ui-tests' }
export const ui = { wordmark: 'ui-tests', github: 'GitHub', skip: 'Skip to content', navigation: 'Main navigation', copy: 'Copy', copied: 'Copied', copyError: 'Could not copy. Select and copy the code.', typescript: 'TypeScript', shell: 'Shell', output: 'Output', example: 'Example run' }
